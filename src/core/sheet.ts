import { ExtractedItem } from './types';

export async function exportToClientSheet(spreadsheetId: string, items: ExtractedItem[], webhookUrl: string): Promise<void> {
  if (!webhookUrl || items.length === 0 || !spreadsheetId) return;

  try {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        spreadsheetId: spreadsheetId, // Gửi đúng ID file Sheet riêng của khách
        jobs: items
      })
    });
    const result = await res.text();
    console.log(`📊 [Google Sheet] Đã chèn ${items.length} dòng vào Sheet [${spreadsheetId}]:`, result);
  } catch (err) {
    console.error(`[Google Sheet] Lỗi xuất dữ liệu:`, err);
  }
}
