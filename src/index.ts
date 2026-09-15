import { runTask } from './core/engine';
import { ClientSampleBDS } from './tasks/client-sample-bds';
import { TaskDefinition } from './core/types';

// Danh sách các khách hàng đang thuê dịch vụ
const ACTIVE_CLIENTS: TaskDefinition[] = [
  ClientSampleBDS
  // Sau này có khách mới, bạn chỉ cần import và ném vào mảng này
];

async function main() {
  const keys = {
    jina: process.env.JINA_API_KEY || '',
    firecrawl: process.env.FIRECRAWL_API_KEY || '',
    gemini: process.env.GEMINI_API_KEY || '',
    sheetUrl: process.env.SHEET_WEBHOOK_URL || ''
  };

  let missing = [];
  if (!keys.jina) missing.push('JINA_API_KEY');
  if (!keys.gemini) missing.push('GEMINI_API_KEY');
  if (!keys.sheetUrl) missing.push('SHEET_WEBHOOK_URL');

  if (missing.length > 0) {
    console.error(`❌ THIẾU BIẾN MÔI TRƯỜNG: [ ${missing.join(', ')} ]`);
    process.exit(1);
  }

  console.log(`🌟 BẮT ĐẦU CHU TRÌNH QUÉT DỮ LIỆU CHO ${ACTIVE_CLIENTS.length} KHÁCH HÀNG`);

  for (const clientTask of ACTIVE_CLIENTS) {
    await runTask(clientTask, keys);
  }

  console.log('\n🎉 HOÀN THÀNH QUÉT TOÀN BỘ KHÁCH HÀNG!');
}

main();
