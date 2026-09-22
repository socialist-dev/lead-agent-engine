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

    const rawData = await res.json();
    const rawClients = Array.isArray(rawData) ? rawData : (rawData as any)?.clients || [];
    if (!Array.isArray(rawClients)) return [];

    const activeClients: ActiveClientFromAdmin[] = rawClients
      .map((c: any) => ({
        name: String(c.name || c.clientName || c.client || 'Khách hàng').trim(),
        spreadsheetId: String(c.spreadsheetId || c.spreadsheet_id || c.sheetId || '').trim(),
        nicheDefinition: String(c.nicheDefinition || c.niche || c.nicheKey || '').trim(),
        sku: String(c.sku || c.SKU || 'LEAD-PRO-01M').trim(),
        timeFilter: String(c.timeFilter || c.time_filter || c.mocCao || 'qdr:d').trim()
      }))
      .filter(c => c.spreadsheetId.length > 0 && c.nicheDefinition.length > 0);

    return activeClients;
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
  const cleanSheetId = (spreadsheetId || '').trim();
  if (!webhookUrl || items.length === 0 || !cleanSheetId) return false;

  try {
    const res = await httpFetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        spreadsheetId: cleanSheetId,
        jobs: items
      }),
      timeoutMs: 30000,
      retries: 2
    });

    const result = await res.text();
    logger.info(`📊 [Google Sheet] Đã bơm ${items.length} lead vào Sheet [${cleanSheetId}]: ${result.slice(0, 100)}`);
    return true;
  } catch (err: any) {
    logger.error(`[Google Sheet] Lỗi xuất dữ liệu [${cleanSheetId}]: ${err.message}`);
    return false;
  }
}

