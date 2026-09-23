import { httpFetch } from './http-client';
import { logger } from './logger';
import { isToxicOrNsfw } from './content-filter';

const DELETED_PAGE_INDICATORS = [
  'content not available',
  'trang này không tồn tại',
  'nội dung này hiện không hiển thị',
  "this content isn't available right now",
  'page not found',
  'bài viết đã bị xóa',
  'không tìm thấy trang'
];

/**
 * Kiểm tra xem URL có tồn tại thực sự trên mạng hay không (Live URL Check)
 * và có chứa dấu hiệu bài đã bị gỡ hoặc nội dung khiếm nhã trong tiêu đề hay không
 */
export function verifyLiveUrl(url: string): boolean {
  if (!url || typeof url !== 'string') return false;
  const cleanUrl = url.trim();

  // Kiểm tra cấu trúc URL hợp lệ
  if (!cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://')) {
    logger.warn(`🔗 [URL Verifier] Link không hợp lệ: "${cleanUrl}"`);
    return false;
  }

  // Chặn các link lỗi hệ thống hoặc link tìm kiếm rác
  if (
    cleanUrl.includes('google.com/search') ||
    cleanUrl.includes('duckduckgo.com') ||
    cleanUrl.endsWith('.net/')
  ) {
    logger.warn(`🔗 [URL Verifier] Loại bỏ link tìm kiếm/trang chủ rác: "${cleanUrl}"`);
    return false;
  }

  // Kiểm tra độc tính/từ thô tục ngay trên chuỗi URL
  if (isToxicOrNsfw(cleanUrl)) {
    logger.warn(`🚫 [URL Verifier] Phát hiện từ thô tục trong chuỗi URL: "${cleanUrl}"`);
    return false;
  }

  return true;
}

/**
 * Kiểm tra nâng cao bằng HTTP Request để xác nhận bài viết chưa bị gỡ (Live Status Check)
 */
export async function verifyUrlIsLiveAndClean(url: string): Promise<boolean> {
  if (!verifyLiveUrl(url)) return false;

  try {
    const res = await httpFetch(url, {
      method: 'GET',
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml'
      },
      timeoutMs: 6000,
      retries: 1
    });

    // Nếu trả về lỗi 404 hoặc 410 -> Bài viết đã bị xóa
    if (res.status === 404 || res.status === 410) {
      logger.warn(`🔗 [Live Check] Bài viết đã bị gỡ (HTTP ${res.status}): "${url}"`);
      return false;
    }

    if (res.ok) {
      const htmlText = await res.text();
      const lowerHtml = htmlText.toLowerCase();

      // Kiểm tra dấu hiệu bài đăng đã bị gỡ của Threads / Facebook / Forum
      for (const indicator of DELETED_PAGE_INDICATORS) {
        if (lowerHtml.includes(indicator)) {
          logger.warn(`🔗 [Live Check] Trang báo nội dung không tồn tại ("${indicator}"): "${url}"`);
          return false;
        }
      }

      // Trích xuất tiêu đề <title> và kiểm tra từ thô tục khiếm nhã
      const titleMatch = htmlText.match(/<title[^>]*>(.*?)<\/title>/i);
      if (titleMatch && titleMatch[1]) {
        const pageTitle = titleMatch[1];
        if (isToxicOrNsfw(pageTitle)) {
          logger.warn(`🚫 [Live Check] Tiêu đề trang chứa từ thô tục khiếm nhã ("${pageTitle}"): "${url}"`);
          return false;
        }
      }
    }

    return true;
  } catch (err: any) {
    // Nếu timeout hoặc bị mạng chặn, giữ lại URL nếu URL hợp lệ (Fallback an toàn)
    logger.info(`🔗 [Live Check] Không thể ping trực tiếp HTTP (${err.message}), giữ lại URL hợp lệ.`);
    return true;
  }
}
