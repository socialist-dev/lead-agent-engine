import { ActiveClientFromAdmin, AppConfig, PipelineResult, RawScrapedPost } from './types';
import { generateDorksFromNiche, batchEvaluateContent } from './providers/gemini';
import { searchJina } from './providers/jina';
import { searchFirecrawl } from './providers/firecrawl';
import { exportToClientSheet } from './providers/gsheet';
import { sleep } from './utils';
import { logger } from './infra/logger';

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

  // Bước 2: Cào dữ liệu qua Jina + Firecrawl dự phòng
  const rawPosts: RawScrapedPost[] = [];
  for (const dork of dynamicDorks) {
    logger.info(`🔍 [Jina Search] [${client.name}]: ${dork}`);
    const jinaRes = await searchJina(dork, config.jinaKey, client.timeFilter);
    rawPosts.push(...jinaRes);

    if (config.firecrawlKey && jinaRes.length === 0) {
      logger.info(`🔥 [Firecrawl Fallback] [${client.name}]: "${dork}"`);
      const fcRes = await searchFirecrawl(dork, config.firecrawlKey, client.timeFilter);
      rawPosts.push(...fcRes);
    }
    await sleep(300);
  }

  // Deduplication theo URL
  const uniquePosts = Array.from(new Map(rawPosts.map(p => [p.url, p])).values());
  logger.info(`📌 Gom được ${uniquePosts.length} bài viết thô cho [${client.name}].`);

  let leadsPushed = 0;
  let leadsFound = 0;

  // Bước 3: Đưa toàn bộ vào Gemini thẩm định 1 lượt (Single Batch)
  if (uniquePosts.length > 0) {
    const approvedLeads = await batchEvaluateContent(uniquePosts, client, config.geminiKey, config.geminiModel);
    leadsFound = approvedLeads.length;
    logger.info(`🎯 AI duyệt được ${leadsFound}/${uniquePosts.length} lead đạt chuẩn cho [${client.name}].`);

    // Bước 4: Bơm thẳng vào Sheet riêng của khách
    if (approvedLeads.length > 0) {
      const success = await exportToClientSheet(client.spreadsheetId, approvedLeads, config.sheetWebhookUrl);
      if (success) {
        leadsPushed = approvedLeads.length;
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
