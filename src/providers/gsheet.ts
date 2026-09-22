import { ActiveClientFromAdmin, ExtractedItem } from '../types';
import { httpFetch } from '../infra/http-client';
import { logger } from '../infra/logger';

export async function fetchActiveClientsFromAdmin(
  webhookUrl: string,
  maxRetries = 2
): Promise<ActiveClientFromAdmin[]> {
  logger.info(`📡 Đang đồng bộ danh sách khách hàng từ Admin Dashboard...`);
  try {
    const res = await httpFetch(webhookUrl, {
      redirect: 'follow',
      timeoutMs: 30000,
      retries: maxRetries
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`HTTP ${res.status}: ${errText.slice(0, 100)}`);
    }

    const clients = (await res.json()) as ActiveClientFromAdmin[];
    return clients;
  } catch (err: any) {
    logger.error(`❌ Lỗi kết nối Sheet Admin: ${err.message}`);
    return [];
  }
}

export async function exportToClientSheet(
  spreadsheetId: string,
  items: ExtractedItem[],
  webhookUrl: string
): Promise<boolean> {
  if (!webhookUrl || items.length === 0 || !spreadsheetId) return false;

  try {
    const res = await httpFetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        spreadsheetId: spreadsheetId,
        jobs: items
      }),
      timeoutMs: 30000,
      retries: 2
    });

    const result = await res.text();
    logger.info(`📊 [Google Sheet] Đã bơm ${items.length} lead vào Sheet [${spreadsheetId}]: ${result.slice(0, 100)}`);
    return true;
  } catch (err: any) {
    logger.error(`[Google Sheet] Lỗi xuất dữ liệu [${spreadsheetId}]: ${err.message}`);
    return false;
  }
}
