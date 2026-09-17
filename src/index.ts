import { searchJina, RawScrapedPost } from './core/jina';
import { searchFirecrawl } from './core/firecrawl';
import { generateDorksFromNiche, batchEvaluateContent, sleep } from './core/gemini';
import { exportToClientSheet } from './core/sheet';
import { ActiveClientFromAdmin } from './core/types';

// 1. Lấy danh sách khách hàng đang BẬT từ Google Sheet Admin
async function fetchActiveClientsFromAdmin(webhookUrl: string): Promise<ActiveClientFromAdmin[]> {
  try {
    console.log('📡 Đang đồng bộ danh sách khách hàng từ Admin Dashboard...');
    const res = await fetch(webhookUrl, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) return [];
    return (await res.json()) as ActiveClientFromAdmin[];
  } catch (err: any) {
    console.error('❌ Lỗi kết nối Sheet Admin:', err.message);
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
    console.error('❌ Thiếu biến môi trường cấu hình bắt buộc (JINA, GEMINI, SHEET_WEBHOOK)!');
    process.exit(1);
  }

  const activeClients = await fetchActiveClientsFromAdmin(keys.sheetUrl);

  if (activeClients.length === 0) {
    console.log('✨ Không có khách hàng nào đang ở trạng thái Hoạt động trên Admin Sheet.');
    return;
  }

  console.log(`🚀 Tìm thấy ${activeClients.length} khách hàng đang hoạt động. Bắt đầu quét...`);

  // Chạy lần lượt từng khách hàng
  for (let i = 0; i < activeClients.length; i++) {
    const client = activeClients[i];

    console.log(`\n======================================================`);
    console.log(`[${i + 1}/${activeClients.length}] KHÁCH HÀNG: [${client.name}] | GÓI: [${client.sku}]`);
    console.log(`🎯 ĐỊNH NGHĨA NGÁCH: "${client.nicheDefinition}"`);
    console.log(`📍 SPREADSHEET ID: [${client.spreadsheetId}]`);
    console.log(`======================================================`);

    // Bước 1: AI tự động sinh Dorking theo định nghĩa ngách
    const dynamicDorks = await generateDorksFromNiche(client.nicheDefinition, keys.gemini);
    console.log(`🤖 AI sinh ${dynamicDorks.length} câu Dorking:`, dynamicDorks);

    // Bước 2: Cào dữ liệu qua Jina + Firecrawl dự phòng
    const rawPosts: RawScrapedPost[] = [];
    for (const dork of dynamicDorks) {
      console.log(`🔍 [Jina Search]: ${dork}`);
      const jinaRes = await searchJina(dork, keys.jina, client.timeFilter);
      rawPosts.push(...jinaRes);

      // Kích hoạt Firecrawl nếu Jina không ra bài hoặc có API key Firecrawl
      if (keys.firecrawl && jinaRes.length === 0) {
        console.log(`🔥 [Firecrawl Fallback]: "${dork}"`);
        const fcRes = await searchFirecrawl(dork, keys.firecrawl, client.timeFilter);
        rawPosts.push(...fcRes);
      }
      await sleep(300);
    }

    const uniquePosts = Array.from(new Map(rawPosts.map(p => [p.url, p])).values());
    console.log(`📌 Gom được ${uniquePosts.length} bài viết thô.`);

    // Bước 3: Đưa toàn bộ vào Gemini thẩm định 1 lượt (Single Batch)
    if (uniquePosts.length > 0) {
      const approvedLeads = await batchEvaluateContent(uniquePosts, client, keys.gemini);
      console.log(`🎯 AI duyệt được ${approvedLeads.length}/${uniquePosts.length} lead đạt chuẩn.`);

      // Bước 4: Bơm thẳng vào Sheet riêng của khách
      if (approvedLeads.length > 0) {
        await exportToClientSheet(client.spreadsheetId, approvedLeads, keys.sheetUrl);
      }
    }

    if (i < activeClients.length - 1) {
      await sleep(1500); // Nghỉ 1.5s giữa các khách hàng
    }
  }

  console.log('\n🎉 HOÀN THÀNH TOÀN BỘ PHIÊN QUÉT CHO TẤT CẢ KHÁCH HÀNG!');
}

main();
