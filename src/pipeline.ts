import { ActiveClientFromAdmin, AppConfig, PipelineResult, RawScrapedPost } from './types';
import { generateDorksFromNiche, generateGroupDiscoveryDorks, generateMicroTargetedPostDorks, batchEvaluateContent } from './providers/gemini';
import { evaluateIntentBinary } from './providers/ai-intent-judge';
import { searchSerpDirect, resetSerpState } from './providers/serp-direct';
import { fetchBingSerp } from './providers/bing-direct';
import { fetchSearXNG } from './providers/searxng';
import { searchJina } from './providers/jina';
import { searchFirecrawl, resetFirecrawlState } from './providers/firecrawl';
import { exportToClientSheet } from './providers/gsheet';
import { sleep, mapConcurrent, extractFacebookGroupHandles, getAfterDate } from './utils';
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

  // BƯỚC 1: QUY TRÌNH DORKING 2 GIAI ĐOẠN (2-TIER PRECISION DORKING FOR FB GROUPS)
  const daysBack = client.timeFilter === 'qdr:d' ? 1 : 7;
  const afterDate = getAfterDate(daysBack);

  // Tier 1: Group Discovery Phase - Khám phá danh sách Facebook Group ngách qua inurl: & intitle:
  logger.info(`🌐 [Tier 1 Group Discovery] Đang quét khám phá danh sách Facebook Groups ngách cho [${client.name}]...`);
  const groupDiscoveryDorks = await generateGroupDiscoveryDorks(client.nicheDefinition, config.geminiKey, config.geminiModel);
  
  const groupDiscoveryPosts: RawScrapedPost[] = [];
  for (const discDork of groupDiscoveryDorks.slice(0, 3)) {
    const foundGroupPosts = await searchSerpDirect(discDork, client.timeFilter, 1);
    groupDiscoveryPosts.push(...foundGroupPosts);
  }

  const discoveredGroupHandles = extractFacebookGroupHandles(groupDiscoveryPosts.map(p => p.url));
  logger.info(`🌐 [Tier 1 Group Discovery] Đã phát hiện ${discoveredGroupHandles.length} Facebook Group IDs phù hợp: ${JSON.stringify(discoveredGroupHandles)}`);

  // Tier 2: Micro-Targeted Post Dorking Phase - Quét bài đăng theo từng Group ID bóp mốc thời gian after:YYYY-MM-DD
  const targetedPostDorks = generateMicroTargetedPostDorks(client.nicheDefinition, discoveredGroupHandles, daysBack);
  logger.info(`🎯 [Tier 2 Targeted Dorks] Sinh ${targetedPostDorks.length} câu Dorking bóp thời gian (after:${afterDate}): ${JSON.stringify(targetedPostDorks)}`);

  // Bổ sung thêm dynamic dorks nếu chưa đủ 12 dorks
  const dynamicDorks = await generateDorksFromNiche(client.nicheDefinition, config.geminiKey, config.geminiModel);
  const combinedDorks = Array.from(new Set([...targetedPostDorks, ...dynamicDorks]));
  const activeDorks = combinedDorks.slice(0, 12);

  // BƯỚC 2: CÀO DỮ LIỆU SIÊU QUY MÔ VỚI ĐA ĐỘNG CƠ WATERFALL (Google -> DDG -> Bing -> SearXNG)
  const rawPosts: RawScrapedPost[] = [];
  let jinaCreditsUsed = 0;
  let firecrawlCreditsUsed = 0;

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
      const jinaResult = await searchJina(dork, config.jinaKey, client.timeFilter);
      posts.push(...jinaResult.posts);
      jinaCreditsUsed += jinaResult.creditsUsed;
    }

    // Tầng 3 Fallback: Firecrawl API Fallback
    if (posts.length === 0 && config.firecrawlKey) {
      const firecrawlResult = await searchFirecrawl(dork, config.firecrawlKey, client.timeFilter);
      posts.push(...firecrawlResult.posts);
      firecrawlCreditsUsed += firecrawlResult.creditsUsed;
    }

    rawPosts.push(...posts);
    await sleep(1000); // Nghỉ 1000ms giữa các dork tránh Google rate limit burst
  }


  // Chuẩn hóa URL & Deduplication & Lọc rác link profile rác
  // TEMPORARILY DISABLED PER USER REQUEST: Bypassing toxic & negative keyword filters to inspect raw output
  const cleanRawPosts = rawPosts.filter(p => isSpecificPostUrl(p.url));

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

  // TEMPORARILY DISABLED PER USER REQUEST (Requirements #4 & #5): Bypass cache check to re-evaluate and push all scraped posts
  const freshPosts = uniquePosts;
  const cachedCount = 0;

  let leadsPushed = 0;
  let leadsFound = 0;

  // Bước 3: AI QUY TRÌNH 2 GIAI ĐOẠN (2-Stage AI Pipeline)
  if (freshPosts.length > 0) {
    // TEMPORARILY DISABLED PER USER REQUEST (Requirement #4): Bypass Stage 1 Intent Judge so user can inspect raw output
    const stage1ApprovedPosts = freshPosts;

    // Stage 2: AI Field Extractor bóc 10 cột JSON cho những bài viết cào được
    if (stage1ApprovedPosts.length > 0) {
      // Smart Content Enricher: Cào bổ sung nội dung với 100% fallback bảo toàn số lượng lead
      const enrichedPosts = await enrichPostsWithDeepContent(stage1ApprovedPosts, config.concurrencyLimit);

      const approvedLeads = await batchEvaluateContent(enrichedPosts, client, config.geminiKey, config.geminiModel);
      leadsFound = approvedLeads.length;
      logger.info(`🎯 AI Stage 2 bóc tách được ${leadsFound}/${stage1ApprovedPosts.length} lead cho [${client.name}].`);

      // Ghi nhận các lead thành công vào persistent cache với TTL 30 ngày
      if (approvedLeads.length > 0) {
        markUrlsSeen(approvedLeads.map(p => p.url), 'APPROVED');
      }

      // Đánh dấu các bài không đạt chuẩn thành REJECTED (TTL 3 ngày)
      const approvedUrlsSet = new Set(approvedLeads.map(l => normalizeUrl(l.url)));
      const rejectedPosts = freshPosts.filter(p => !approvedUrlsSet.has(normalizeUrl(p.url)));
      if (rejectedPosts.length > 0) {
        markUrlsSeen(rejectedPosts.map(p => p.url), 'REJECTED');
      }

      // TEMPORARILY BYPASSED PER USER REQUEST: Cho phép tất cả lead đi qua mà không drop ở Verification
      const verifiedLeads = approvedLeads;

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
    jinaCreditsUsed,
    firecrawlCreditsUsed,
    durationMs,
    errors
  };
}
