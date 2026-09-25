import { ActiveClientFromAdmin, ExtractedItem } from '../types';
import { httpFetch } from '../infra/http-client';
import { logger } from '../infra/logger';
import { sleep } from '../utils';

export async function fetchActiveClientsFromAdmin(
  webhookUrl: string,
  maxRetries = 3
): Promise<ActiveClientFromAdmin[]> {
  logger.info(`📡 Đang đồng bộ danh sách khách hàng từ Admin Dashboard...`);

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const res = await httpFetch(webhookUrl, {
        redirect: 'follow',
        timeoutMs: 60000, // 60s timeout cho Google Apps Script cold start
        retries: 0
      });

      const text = await res.text();

      // Kiểm tra phản hồi HTML lỗi (khi Google Apps Script chưa kịp khởi động xong)
      if (text.includes('<!DOCTYPE') || text.includes('<html')) {
        throw new Error(`Google Webhook trả về HTML thay vì JSON (Cold-start/Redirect).`);
      }

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${text.slice(0, 100)}`);
      }

      let rawData: any;
      try {
        rawData = JSON.parse(text);
      } catch {
        throw new Error(`Dữ liệu từ Webhook không đúng định dạng JSON.`);
      }

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
      if (attempt < maxRetries) {
        const delay = 2000 * Math.pow(2, attempt);
        logger.warn(`⚠️ [Admin Sheet Sync] ${err.message}. Thử lại lần ${attempt + 1}/${maxRetries} sau ${delay}ms...`);
        await sleep(delay);
      } else {
        logger.error(`❌ Lỗi kết nối Sheet Admin sau ${maxRetries} lần thử: ${err.message}`);
      }
    }
  }

  return [];
}

export async function exportToClientSheet(
  spreadsheetId: string,
  items: ExtractedItem[],
  webhookUrl: string
): Promise<number> {
  const cleanSheetId = (spreadsheetId || '').trim();
  if (!webhookUrl || items.length === 0 || !cleanSheetId) return -1;

  try {
    const res = await httpFetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        spreadsheetId: cleanSheetId,
        jobs: items
      }),
      timeoutMs: 45000,
      retries: 2
    });

    const result = await res.text();
    if (result.includes('<!DOCTYPE') || result.includes('<html')) {
      logger.error(`❌ [Google Sheet] Webhook trả về HTML lỗi cho Sheet [${cleanSheetId}]. Vui lòng kiểm tra lại quyền truy cập File Sheet hoặc Webhook!`);
      return -1;
    }

    let insertedCount = items.length;
    try {
      const jsonRes = JSON.parse(result);
      if (typeof jsonRes.inserted === 'number') {
        insertedCount = jsonRes.inserted;
      }
    } catch {}

    if (insertedCount > 0) {
      logger.info(`📊 [Google Sheet] Đã bơm thành công ${insertedCount}/${items.length} lead mới vào Sheet [${cleanSheetId}].`);
    } else {
      logger.info(`ℹ️ [Google Sheet] 0 lead mới được chèn vào Sheet [${cleanSheetId}] (Do tất cả ${items.length} lead đã tồn tại trùng lặp trên Sheet từ trước).`);
    }

    return insertedCount;
  } catch (err: any) {
    logger.error(`[Google Sheet] Lỗi xuất dữ liệu [${cleanSheetId}]: ${err.message}`);
    return -1;
  }
}

