import { logger } from './logger';

// Danh sách từ khóa thô tục, khiếm nhã, NSFW, 18+, cờ bạc, chửi thề tiếng Việt & tiếng Anh
const BLACKLIST_PATTERNS = [
  /\bđụ\b/i,
  /\bđịt\b/i,
  /\blồn\b/i,
  /\bcặc\b/i,
  /\bchịch\b/i,
  /\bsex\b/i,
  /\b18\+\b/i,
  /\bbồ nhí\b/i,
  /\bdâm\b/i,
  /\bđéo\b/i,
  /\bchửi\b/i,
  /\bphim heo\b/i,
  /\bcờ bạc\b/i,
  /\bgame bài\b/i,
  /\bđụ nhau\b/i,
  /\bpublic\b/i,
  /\bdân tình nó cản\b/i
];

/**
 * Kiểm tra xem nội dung văn bản hoặc tiêu đề có chứa từ ngữ thô tục / khiếm nhã / NSFW hay không
 */
export function isToxicOrNsfw(text: string): boolean {
  if (!text) return false;
  const normalizedText = text.toLowerCase();

  for (const pattern of BLACKLIST_PATTERNS) {
    if (pattern.test(normalizedText)) {
      logger.warn(`🚫 [Toxic Filter] Phát hiện từ ngữ khiếm nhã/NSFW (Pattern: ${pattern.source})`);
      return true;
    }
  }

  return false;
}

/**
 * Kiểm tra thời gian đăng bài có hợp lệ hay không (Thời gian thực <= maxDays, mặc định 7 ngày)
 * Chặn tuyệt đối các bài "6 tháng trước", "1 năm trước"
 */
export function isLeadTimeValid(postedAgo: string, maxDays = 7): boolean {
  if (!postedAgo) return true;
  const timeStr = String(postedAgo).toLowerCase().trim();

  // Chặn tuyệt đối bài viết chứa chữ "tháng" hoặc "năm" (VD: "6 tháng trước", "1 năm trước")
  if (/tháng|month|năm|year/i.test(timeStr)) {
    logger.warn(`⏰ [Time Filter] Loại bỏ bài quá cũ: "${postedAgo}" (Chứa tháng/năm)`);
    return false;
  }

  // Kiểm tra số ngày nếu chứa chữ "ngày" hoặc "day" (VD: "10 ngày trước")
  const dayMatch = timeStr.match(/(\d+)\s*(ngày|day)/i);
  if (dayMatch) {
    const days = parseInt(dayMatch[1], 10);
    if (!isNaN(days) && days > maxDays) {
      logger.warn(`⏰ [Time Filter] Loại bỏ bài đăng quá ${maxDays} ngày: "${postedAgo}" (${days} ngày)`);
      return false;
    }
  }

  return true;
}
