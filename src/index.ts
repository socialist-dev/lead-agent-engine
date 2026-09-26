import { loadConfig } from './config';
import { logger } from './infra/logger';
import { fetchActiveClientsFromAdmin } from './providers/gsheet';
import { runClientPipeline } from './pipeline';
import { mapConcurrent } from './utils';
import { PipelineResult } from './types';
import { saveUrlCache } from './infra/url-cache';

async function main() {
  const config = loadConfig();

  if (!config.jinaKey || !config.geminiKey || !config.sheetWebhookUrl) {
    logger.error('❌ Thiếu biến môi trường cấu hình bắt buộc! (JINA_API_KEY, GEMINI_API_KEY, SHEET_WEBHOOK_URL)');
    process.exit(1);
  }

  const activeClients = await fetchActiveClientsFromAdmin(config.sheetWebhookUrl);

  if (activeClients.length === 0) {
    logger.info('✨ Không có khách hàng nào đang ở trạng thái Hoạt động trên Admin Sheet.');
    return;
  }

  logger.info(`🚀 Tìm thấy ${activeClients.length} khách hàng đang hoạt động. Bắt đầu quét với song song (max ${config.concurrencyLimit})...`);

  const results = await mapConcurrent(
    activeClients,
    config.concurrencyLimit,
    client => runClientPipeline(client, config)
  );

  logger.info('\n======================================================');
  logger.info('📊 BÁO CÁO TỔNG HỢP KẾT QUẢ QUÉT LEADS:');
  
  let totalLeadsFound = 0;
  let totalLeadsPushed = 0;

  results.forEach((res, i) => {
    const clientName = activeClients[i].name;
    if (res.status === 'fulfilled') {
      const val = res.value as PipelineResult;
      totalLeadsFound += val.leadsFound;
      totalLeadsPushed += val.leadsPushed;
      logger.info(`- [${clientName}]: ${val.leadsPushed}/${val.leadsFound} leads pushed (${(val.durationMs / 1000).toFixed(1)}s)`);
    } else {
      logger.error(`- [${clientName}]: LỖI - ${res.reason?.message || res.reason}`);
    }
  });

  logger.info(`🎉 TỔNG CỘNG: Đã đẩy ${totalLeadsPushed}/${totalLeadsFound} leads cho ${activeClients.length} khách hàng.`);
  logger.info('======================================================\n');

  // Lưu persistent cache đĩa cho lần chạy tiếp theo
  saveUrlCache();
}

main();
