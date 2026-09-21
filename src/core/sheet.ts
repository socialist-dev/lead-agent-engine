import { ExtractedItem } from './types';

export async function exportToClientSheet(spreadsheetId: string, items: ExtractedItem[], webhookUrl: string): Promise<void> {
  if (!webhookUrl || items.length === 0 || !spreadsheetId) return;

  try {
    const res = await fetch(webhookUrl, {
      signal: AbortSignal.timeout(30000), // ⚡ 30s an toàn
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        spreadsheetId: spreadsheetId,
        jobs: items
      })
    });
    const result = await res.text();
    console.log(`📊 [Google Sheet] Đã bơm ${items.length} lead vào Sheet [${spreadsheetId}]:`, result);
  } catch (err: any) {
    console.error(`[Google Sheet] Lỗi xuất dữ liệu:`, err.message);
  }
}
