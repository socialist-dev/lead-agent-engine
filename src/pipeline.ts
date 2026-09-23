import { ActiveClientFromAdmin, AppConfig, PipelineResult, RawScrapedPost } from './types';
import { generateDorksFromNiche, batchEvaluateContent } from './providers/gemini';
import { evaluateIntentBinary } from './providers/ai-intent-judge';
import { searchSerpDirect } from './providers/serp-direct';
import { fetchBingSerp } from './providers/bing-direct';
import { fetchSearXNG } from './providers/searxng';
import { searchJina } from './providers/jina';
import { searchFirecrawl } from './providers/firecrawl';
import { exportToClientSheet } from './providers/gsheet';
import { sleep } from './utils';
import { logger } from './infra/logger';
import { isToxicOrNsfw } from './infra/content-filter';
import { verifyUrlIsLiveAndClean } from './infra/url-verifier';
import { containsNegativeKeywords } from './infra/niche-negative-keywords';
import { normalizeUrl } from './infra/url-normalizer';

export async function runClientPipeline(
  client: ActiveClientFromAdmin,
  config: AppConfig
): Promise<PipelineResult> {
  const startTime = Date.now();
  const errors: string[] = [];

  logger.info(`\n======================================================`);
  logger.info(`KHÁCH HÀNG: [${client.name}] | GÓI: [${client.sku}]`);
  logger.info(`🎯 ĐỊNH NGHĨA NGÁCH: "${client.nicheDefinition}"`);
  logger.info(`📍 SPREADSHEET ID: [${client.spreadsheetId}]`);
  logger.info(`======================================================`);

  // Bước 1: AI tự động sinh 16 câu Dorking chia theo 4 nhóm chiến lược
  const dynamicDorks = await generateDorksFromNiche(client.nicheDefinition, config.geminiKey, config.geminiModel);
  logger.info(`🤖 AI sinh ${dynamicDorks.length} câu Dorking đa dạng cho [${client.name}]: ${JSON.stringify(dynamicDorks)}`);

  // Bước 2: Cào dữ liệu siêu quy mô với Đa Động Cơ Direct SERP (Google + DDG + Bing + SearXNG)
  const rawPosts: RawScrapedPost[] = [];

  for (let i = 0; i < dynamicDorks.length; i++) {
    const dork = dynamicDorks[i];
    logger.info(`🔎 [Dork ${i + 1}/${dynamicDorks.length}] [${client.name}]: "${dork}"`);

    // Động cơ 1 & 2: Direct Google + DuckDuckGo SERP (Phân trang 3 trang)
    let dorkPosts = await searchSerpDirect(dork, client.timeFilter, 3);

    // Động cơ 3: Direct Bing SERP (Phân trang 2 trang)
    const bingPosts = await fetchBingSerp(dork, 2);
    if (bingPosts.length > 0) {
      dorkPosts.push(...bingPosts);
    }

    // Động cơ 4: SearXNG Multi-Instance JSON API
    const searxPosts = await fetchSearXNG(dork, 2);
    if (searxPosts.length > 0) {
      dorkPosts.push(...searxPosts);
    }

    // Tầng 2 Fallback: Jina API Fallback (nếu các động cơ 0đ trên không ra bài)
    if (dorkPosts.length === 0 && config.jinaKey) {
      logger.info(`🔍 [Tier 2: Jina Snippet Fallback] [${client.name}]: "${dork}"`);
      dorkPosts = await searchJina(dork, config.jinaKey, client.timeFilter);
    }

    // Tầng 3 Fallback: Firecrawl API Fallback
    if (dorkPosts.length === 0 && config.firecrawlKey) {
      logger.info(`🔥 [Tier 3: Firecrawl Fallback] [${client.name}]: "${dork}"`);
      dorkPosts = await searchFirecrawl(dork, config.firecrawlKey, client.timeFilter);
    }

    rawPosts.push(...dorkPosts);
    await sleep(250);
  }

  // Chuẩn hóa URL & Deduplication & Lọc rác thô tục / từ phủ định ngách sớm
  const cleanRawPosts = rawPosts.filter(
    p =>
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

  let leadsPushed = 0;
  let leadsFound = 0;

  // Bước 3: AI QUY TRÌNH 2 GIAI ĐOẠN (2-Stage AI Pipeline)
  if (uniquePosts.length > 0) {
    // Stage 1: AI Intent Judge thẩm định ý định mua dương tính (Binary YES/NO)
    const stage1ApprovedPosts = await evaluateIntentBinary(uniquePosts, client, config.geminiKey, config.geminiModel);

    // Stage 2: AI Field Extractor chỉ bóc 10 cột JSON cho những bài vượt qua Stage 1
    if (stage1ApprovedPosts.length > 0) {
      const approvedLeads = await batchEvaluateContent(stage1ApprovedPosts, client, config.geminiKey, config.geminiModel);
      leadsFound = approvedLeads.length;
      logger.info(`🎯 AI Stage 2 bóc tách được ${leadsFound}/${stage1ApprovedPosts.length} lead đạt chuẩn cho [${client.name}].`);

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
        const success = await exportToClientSheet(client.spreadsheetId, verifiedLeads, config.sheetWebhookUrl);
        if (success) {
          leadsPushed = verifiedLeads.length;
        } else {
          errors.push('Lỗi khi xuất dữ liệu sang Google Sheet');
        }
      }
    }
  }

  const durationMs = Date.now() - startTime;
  return {
    client: client.name,
    leadsFound,
    leadsPushed,
    durationMs,
    errors
  };
}
