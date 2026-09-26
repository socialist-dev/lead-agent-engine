import { ActiveClientFromAdmin, AppConfig, PipelineResult, RawScrapedPost } from './types';
import { generateDorksFromNiche, batchEvaluateContent } from './providers/gemini';
import { evaluateIntentBinary } from './providers/ai-intent-judge';
import { searchSerpDirect, resetSerpState } from './providers/serp-direct';
import { fetchBingSerp } from './providers/bing-direct';
import { fetchSearXNG } from './providers/searxng';
import { searchJina } from './providers/jina';
import { searchFirecrawl, resetFirecrawlState } from './providers/firecrawl';
import { exportToClientSheet } from './providers/gsheet';
import { sleep, mapConcurrent } from './utils';
import { logger } from './infra/logger';
import { isToxicOrNsfw } from './infra/content-filter';
import { verifyUrlIsLiveAndClean, isSpecificPostUrl } from './infra/url-verifier';
import { containsNegativeKeywords } from './infra/niche-negative-keywords';
import { normalizeUrl } from './infra/url-normalizer';
import { isUrlSeen, markUrlsSeen } from './infra/url-cache';
import { enrichPostsWithDeepContent } from './infra/content-enricher';

export async function runClientPipeline(
  client: ActiveClientFromAdmin,
  config: AppConfig
): Promise<PipelineResult> {
  const startTime = Date.now();
  const errors: string[] = [];

  // Reset SERP & Firecrawl rate limit flags for new client run
  resetSerpState();
  resetFirecrawlState();

  logger.info(`\n======================================================`);
  logger.info(`KHÁCH HÀNG: [${client.name}] | GÓI: [${client.sku}]`);
  logger.info(`🎯 ĐỊNH NGHĨA NGÁCH: "${client.nicheDefinition}"`);
  logger.info(`📍 SPREADSHEET ID: [${client.spreadsheetId}]`);
  logger.info(`======================================================`);

  // Bước 1: AI tự động sinh 16 câu Dorking chia theo 4 nhóm chiến lược
  const dynamicDorks = await generateDorksFromNiche(client.nicheDefinition, config.geminiKey, config.geminiModel);
  logger.info(`🤖 AI sinh ${dynamicDorks.length} câu Dorking đa dạng cho [${client.name}]: ${JSON.stringify(dynamicDorks)}`);

  // Bỏ bớt dork thừa nếu có, lấy 12 dorks chiến lược nhất để quét siêu nhanh
  const activeDorks = dynamicDorks.slice(0, 12);

  // Bước 2: Cào dữ liệu siêu quy mô với Đa Động Cơ Waterfall (Google -> DDG -> Bing -> SearXNG)
  const rawPosts: RawScrapedPost[] = [];

  for (let i = 0; i < activeDorks.length; i++) {
    const dork = activeDorks[i];
    logger.info(`🔎 [Dork ${i + 1}/${activeDorks.length}] [${client.name}]: "${dork}"`);
    const posts: RawScrapedPost[] = [];

    // Động cơ 1 & 2: Direct Google + DuckDuckGo SERP (Phân trang 2 trang)
    const serpPosts = await searchSerpDirect(dork, client.timeFilter, 2);
    posts.push(...serpPosts);

    // Chiến lược Early Exit: Nếu cào được >= 5 kết quả từ Google/DDG, ngắt dork sớm
    if (posts.length < 5) {
      // Động cơ 3: Direct Bing SERP (Phân trang 1 trang)
      const bingPosts = await fetchBingSerp(dork, 1);
      if (bingPosts.length > 0) posts.push(...bingPosts);

      // Động cơ 4: SearXNG Multi-Instance JSON API
      if (posts.length < 5) {
        const searxPosts = await fetchSearXNG(dork, 1);
        if (searxPosts.length > 0) posts.push(...searxPosts);
      }
    }

    // Tầng 2 Fallback: Jina API Fallback (nếu 4 động cơ 0đ trên không ra bài)
    if (posts.length === 0 && config.jinaKey) {
      const jinaPosts = await searchJina(dork, config.jinaKey, client.timeFilter);
      posts.push(...jinaPosts);
    }

    // Tầng 3 Fallback: Firecrawl API Fallback
    if (posts.length === 0 && config.firecrawlKey) {
      const firecrawlPosts = await searchFirecrawl(dork, config.firecrawlKey, client.timeFilter);
      posts.push(...firecrawlPosts);
    }

    rawPosts.push(...posts);
    await sleep(250); // Nghỉ 250ms giữa các dork tránh Google rate limit burst
  }

  // Chuẩn hóa URL & Deduplication & Lọc rác thô tục / từ phủ định ngách / link profile rác
  const cleanRawPosts = rawPosts.filter(
    p =>
      isSpecificPostUrl(p.url) &&
      !isToxicOrNsfw(p.url) &&
      !isToxicOrNsfw(p.rawContent) &&
      !containsNegativeKeywords(p.url, client.nicheDefinition) &&
      !containsNegativeKeywords(p.rawContent, client.nicheDefinition)
  );

  // Gom trùng theo normalized URL
  const uniquePostsMap = new Map<string, RawScrapedPost>();
  for (const post of cleanRawPosts) {
    const normUrl = normalizeUrl(post.url);
    if (!uniquePostsMap.has(normUrl)) {
      uniquePostsMap.set(normUrl, { ...post, url: normUrl });
    }
  }

  const uniquePosts = Array.from(uniquePostsMap.values());
  logger.info(`📌 Tổng gom được ${uniquePosts.length} bài viết thô độc nhất cho [${client.name}].`);

  // BỘ LỌC PERSISTENT CACHE: Bỏ qua các URL đã xử lý/thẩm định trong 14 ngày qua
  const freshPosts = uniquePosts.filter(p => !isUrlSeen(p.url));
  const cachedCount = uniquePosts.length - freshPosts.length;
  if (cachedCount > 0) {
    logger.info(`📦 [URL Cache] Đã bỏ qua ${cachedCount}/${uniquePosts.length} bài viết trùng lặp trong cache (tiết kiệm token & AI quota).`);
  }

  let leadsPushed = 0;
  let leadsFound = 0;

  // Bước 3: AI QUY TRÌNH 2 GIAI ĐOẠN (2-Stage AI Pipeline)
  if (freshPosts.length > 0) {
    // Đánh dấu mặc định tất cả các bài cào mới vào Soft-Cache (TTL 3 ngày nếu không thành lead)
    markUrlsSeen(freshPosts.map(p => p.url), 'REJECTED');

    // Stage 1: AI Intent Judge thẩm định ý định mua dương tính (Binary YES/NO)
    const stage1ApprovedPosts = await evaluateIntentBinary(freshPosts, client, config.geminiKey, config.geminiModel);

    // Stage 2: AI Field Extractor chỉ bóc 10 cột JSON cho những bài vượt qua Stage 1
    if (stage1ApprovedPosts.length > 0) {
      // Smart Content Enricher: Cào bổ sung nội dung với 100% fallback bảo toàn số lượng lead
      const enrichedPosts = await enrichPostsWithDeepContent(stage1ApprovedPosts, config.concurrencyLimit);

      const approvedLeads = await batchEvaluateContent(enrichedPosts, client, config.geminiKey, config.geminiModel);
      leadsFound = approvedLeads.length;
      logger.info(`🎯 AI Stage 2 bóc tách được ${leadsFound}/${stage1ApprovedPosts.length} lead đạt chuẩn cho [${client.name}].`);

      // Ghi nhận các lead thành công vào persistent cache với TTL 30 ngày
      markUrlsSeen(approvedLeads.map(p => p.url), 'APPROVED');

      // TẦNG 4 VERIFICATION: Kiểm tra Live Status URL trước khi bơm vào Sheet
      const verifiedLeads = [];
      for (const lead of approvedLeads) {
        const isLive = await verifyUrlIsLiveAndClean(lead.url);
        if (isLive) {
          verifiedLeads.push(lead);
        } else {
          logger.warn(`🚫 [Pipeline Verifier] Bỏ qua lead do link bị gỡ hoặc dính từ thô tục: "${lead.url}"`);
        }
      }

      // Bước 4: Bơm thẳng vào Sheet riêng của khách
      if (verifiedLeads.length > 0) {
        const pushedCount = await exportToClientSheet(client.spreadsheetId, verifiedLeads, config.sheetWebhookUrl);
        if (pushedCount >= 0) {
          leadsPushed = pushedCount;
        } else {
          errors.push('Lỗi khi xuất dữ liệu sang Google Sheet');
        }
      }
    }
  }

  const durationMs = Date.now() - startTime;
  return {
    client: client.name,
    rawPostsFound: uniquePosts.length,
    cachedSkipped: cachedCount,
    freshEvaluated: freshPosts.length,
    leadsFound,
    leadsPushed,
    durationMs,
    errors
  };
}
