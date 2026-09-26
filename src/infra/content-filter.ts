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
 * Chặn tuyệt đối các bài "6 tháng trước", "1 năm trước", và UNKNOWN_TIME
 */
export function isLeadTimeValid(postedAgo: string, maxDays = 7): boolean {
  if (!postedAgo) return true;
  const timeStr = String(postedAgo).trim();

  // 0. Chặn tuyệt đối UNKNOWN_TIME (bài không xác định được thời gian)
  if (timeStr === 'UNKNOWN_TIME') {
    logger.warn(`⏰ [Time Filter] Loại bỏ bài do không xác định được thời gian đăng.`);
    return false;
  }

  // 1. Kiểm tra định dạng mốc ngày dd/MM/yyyy (sử dụng VN timezone nhất quán)
  const dateMatch = timeStr.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (dateMatch) {
    const day = parseInt(dateMatch[1], 10);
    const month = parseInt(dateMatch[2], 10) - 1;
    const year = parseInt(dateMatch[3], 10);
    const postDate = new Date(year, month, day);

    // Sử dụng VN timezone nhất quán (khớp với formatPostedTimeToDateTime)
    const now = new Date();
    const vnNow = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Ho_Chi_Minh' }));
    const diffMs = vnNow.getTime() - postDate.getTime();
    const diffDays = diffMs / (1000 * 60 * 60 * 24);

    // Chặn bài tương lai (chênh lệch âm > 1 ngày)
    if (diffDays < -1) {
      logger.warn(`⏰ [Time Filter] Loại bỏ bài đăng từ tương lai: "${postedAgo}" (${Math.round(diffDays)} ngày)`);
      return false;
    }

    if (diffDays > maxDays) {
      logger.warn(`⏰ [Time Filter] Loại bỏ bài đăng quá ${maxDays} ngày: "${postedAgo}" (${Math.round(diffDays)} ngày)`);
      return false;
    }
    return true;
  }

  // 2. Chặn bài chứa chữ "tháng trước", "năm trước", "months ago", "years ago"
  if (/tháng\s+trước|month|năm\s+trước|year/i.test(timeStr)) {
    logger.warn(`⏰ [Time Filter] Loại bỏ bài quá cũ: "${postedAgo}"`);
    return false;
  }

  // 3. Kiểm tra số ngày nếu chứa chữ "ngày" hoặc "day" (VD: "10 ngày trước")
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

