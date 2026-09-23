import { ActiveClientFromAdmin, AppConfig, PipelineResult, RawScrapedPost } from './types';
import { generateDorksFromNiche, batchEvaluateContent } from './providers/gemini';
import { searchSerpDirect } from './providers/serp-direct';
import { searchJina } from './providers/jina';
import { searchFirecrawl } from './providers/firecrawl';
import { exportToClientSheet } from './providers/gsheet';
import { sleep } from './utils';
import { logger } from './infra/logger';
import { isToxicOrNsfw } from './infra/content-filter';
import { verifyUrlIsLiveAndClean } from './infra/url-verifier';
import { containsNegativeKeywords } from './infra/niche-negative-keywords';

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

  // Bước 1: AI tự động sinh Dorking theo định nghĩa ngách
  const dynamicDorks = await generateDorksFromNiche(client.nicheDefinition, config.geminiKey, config.geminiModel);
  logger.info(`🤖 AI sinh ${dynamicDorks.length} câu Dorking cho [${client.name}]: ${JSON.stringify(dynamicDorks)}`);

  // Bước 2: Cào dữ liệu với Hàng Rào Dự Phòng 3 Tầng (3-Tier Hybrid Engine)
  const rawPosts: RawScrapedPost[] = [];
  for (const dork of dynamicDorks) {
    // Tầng 1: Cào Direct SERP (0đ API, tốc độ siêu nhanh <500ms)
    logger.info(`🌐 [Tier 1: Direct SERP] [${client.name}]: "${dork}"`);
    let dorkPosts = await searchSerpDirect(dork, client.timeFilter);

    // Tầng 2: Jina API Fallback (với Snippet-Only Header tiết kiệm 85% token)
    if (dorkPosts.length === 0 && config.jinaKey) {
      logger.info(`🔍 [Tier 2: Jina Snippet Fallback] [${client.name}]: "${dork}"`);
      dorkPosts = await searchJina(dork, config.jinaKey, client.timeFilter);
    }

    // Tầng 3: Firecrawl API Fallback (Dự phòng cuối cùng)
    if (dorkPosts.length === 0 && config.firecrawlKey) {
      logger.info(`🔥 [Tier 3: Firecrawl Fallback] [${client.name}]: "${dork}"`);
      dorkPosts = await searchFirecrawl(dork, config.firecrawlKey, client.timeFilter);
    }

    rawPosts.push(...dorkPosts);
    await sleep(300);
  }

  // Deduplication & Lọc rác thô tục & từ phủ định ngách sớm
  const cleanRawPosts = rawPosts.filter(
    p =>
      !isToxicOrNsfw(p.url) &&
      !isToxicOrNsfw(p.rawContent) &&
      !containsNegativeKeywords(p.url, client.nicheDefinition) &&
      !containsNegativeKeywords(p.rawContent, client.nicheDefinition)
  );
  const uniquePosts = Array.from(new Map(cleanRawPosts.map(p => [p.url, p])).values());
  logger.info(`📌 Gom được ${uniquePosts.length} bài viết thô hợp lệ cho [${client.name}].`);

  let leadsPushed = 0;
  let leadsFound = 0;

  // Bước 3: Đưa toàn bộ vào Gemini thẩm định 1 lượt (Single Batch)
  if (uniquePosts.length > 0) {
    const approvedLeads = await batchEvaluateContent(uniquePosts, client, config.geminiKey, config.geminiModel);
    leadsFound = approvedLeads.length;
    logger.info(`🎯 AI duyệt được ${leadsFound}/${uniquePosts.length} lead đạt chuẩn cho [${client.name}].`);

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

  const durationMs = Date.now() - startTime;
  return {
    client: client.name,
    leadsFound,
    leadsPushed,
    durationMs,
    errors
  };
}
