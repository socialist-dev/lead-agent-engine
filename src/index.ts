import { NICHE_PRESETS } from './presets/niches';
import { searchJina, RawScrapedPost } from './core/jina';
import { searchFirecrawl } from './core/firecrawl';
import { batchEvaluateContent, sleep } from './core/gemini';
import { exportToClientSheet } from './core/sheet';
import { TaskDefinition } from './core/types';

interface ActiveClient {
  name: string;
  spreadsheetId: string;
  nicheKey: string;
  timeFilter: 'qdr:h' | 'qdr:d' | 'qdr:w' | 'qdr:m';
}

async function fetchActiveClientsFromAdminSheet(webhookUrl: string): Promise<ActiveClient[]> {
  try {
    console.log('📡 Đang đồng bộ danh sách khách hàng từ Google Sheet Admin Dashboard...');
    const res = await fetch(webhookUrl, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) return [];
    return (await res.json()) as ActiveClient[];
  } catch (err: any) {
    console.error('❌ Không thể đọc dữ liệu từ Admin Sheet:', err.message);
    return [];
  }
}

async function main() {
  const keys = {
    jina: process.env.JINA_API_KEY || '',
    firecrawl: process.env.FIRECRAWL_API_KEY || '',
    gemini: process.env.GEMINI_API_KEY || '',
    sheetUrl: process.env.SHEET_WEBHOOK_URL || ''
  };

  if (!keys.jina || !keys.gemini || !keys.sheetUrl) {
    console.error('❌ Thiếu biến môi trường cấu hình bắt buộc!');
    process.exit(1);
  }

  // 1. Lấy danh sách toàn bộ khách hàng đang BẬT trên Google Sheet Admin
  const activeClients = await fetchActiveClientsFromAdminSheet(keys.sheetUrl);

  if (activeClients.length === 0) {
    console.log('✨ Hiện tại không có khách hàng nào ở trạng thái "BẬT" trên Admin Sheet.');
    return;
  }

  console.log(`🚀 Tìm thấy ${activeClients.length} khách hàng đang kích hoạt. Bắt đầu quét dữ liệu...`);

  // 2. Chạy quét dữ liệu cho từng khách hàng
  for (const client of activeClients) {
    const preset = NICHE_PRESETS[client.nicheKey] || NICHE_PRESETS['freelance_video'];

    console.log(`\n------------------------------------------------------`);
    console.log(`👤 KHÁCH HÀNG: [${client.name}] | NGÀNH: [${preset.name}]`);
    console.log(`📍 SPREADSHEET ID: [${client.spreadsheetId}]`);
    console.log(`------------------------------------------------------`);

    const rawPosts: RawScrapedPost[] = [];

    // Cào các câu dork theo ngành
    for (const dork of preset.dorks) {
      console.log(`🔍 Quét Jina: ${dork}`);
      const jinaRes = await searchJina(dork, keys.jina, client.timeFilter);
      rawPosts.push(...jinaRes);

      if (keys.firecrawl && jinaRes.length === 0) {
        const fcRes = await searchFirecrawl(dork, keys.firecrawl, client.timeFilter);
        rawPosts.push(...fcRes);
      }
      await sleep(500);
    }

    const uniquePosts = Array.from(new Map(rawPosts.map(p => [p.url, p])).values());
    console.log(`📌 Gom được ${uniquePosts.length} bài viết thô.`);

    if (uniquePosts.length > 0) {
      // Giả lập TaskDefinition từ NichePreset
      const taskDef: TaskDefinition = {
        id: client.nicheKey,
        name: preset.name,
        enabled: true,
        spreadsheetId: client.spreadsheetId,
        timeFilter: client.timeFilter,
        dorks: preset.dorks,
        aiPrompt: {
          systemRole: preset.systemRole,
          validationRules: preset.validationRules,
          categoryTags: preset.categoryTags,
          extraField1Label: preset.extraField1Label,
          extraField2Label: preset.extraField2Label
        }
      };

      // Đưa qua Gemini xử lý Batch
      const approvedLeads = await batchEvaluateContent(uniquePosts, taskDef, keys.gemini);
      console.log(`🎯 AI đã duyệt ${approvedLeads.length}/${uniquePosts.length} lead chất lượng cao.`);

      // Ghi thẳng vào Google Sheet riêng của khách đó
      if (approvedLeads.length > 0) {
        await exportToClientSheet(client.spreadsheetId, approvedLeads, keys.sheetUrl);
      }
    }

    await sleep(2000); // Nghỉ 2s trước khi chuyển sang khách tiếp theo
  }

  console.log('\n🎉 HOÀN THÀNH TOÀN BỘ PHIÊN QUÉT CHO TẤT CẢ KHÁCH HÀNG!');
}

main();
