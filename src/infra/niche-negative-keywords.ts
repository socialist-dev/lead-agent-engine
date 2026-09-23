import { logger } from './logger';

// Định nghĩa từ khóa phủ định bắt buộc theo từng nhóm ngách kinh doanh
const NICHE_NEGATIVE_KEYWORDS: Record<string, string[]> = {
  // Ngách Ô tô / Xe sang / Mua bán xe
  auto: [
    'steam',
    'game',
    'family share',
    'mk11',
    'fc27',
    'ps5',
    'playstation',
    'nintendo',
    'acc',
    'tài khoản game',
    'cho thuê acc',
    'pass acc',
    'bán acc',
    'bán clone',
    'giftcode',
    'nạp game',
    'tải game'
  ],
  // Ngách Bất động sản / Nhà đất / Chung cư
  realestate: [
    'tuyển dụng',
    'tuyển nhân viên',
    'tuyển telesale',
    'phòng trọ 1.5tr',
    'pass đồ',
    'thanh lý tủ',
    'thanh lý bàn ghế',
    'tìm người ở ghép'
  ],
  // Ngách Tài chính / Chứng khoán / Ngân hàng
  finance: [
    'baccara',
    'tài xỉu',
    'nhận kéo',
    'tín dụng đen',
    'vay app',
    'đánh bạc',
    'cờ bạc online'
  ]
};

/**
 * Xác định nhóm ngách tương ứng từ chuỗi định nghĩa nicheDefinition của khách hàng
 */
function detectNicheCategory(nicheDefinition: string): string {
  const text = (nicheDefinition || '').toLowerCase();
  if (/ô tô|xe|mercedes|bmw|audi|camry|hyundai|toyota|ford/i.test(text)) {
    return 'auto';
  }
  if (/bđs|bất động sản|nhà|đất|chung cư|vinhomes|căn hộ|cho thuê nhà/i.test(text)) {
    return 'realestate';
  }
  if (/chứng khoán|tài chính|tài khoản|sàn|cổ phiếu|trái phiếu/i.test(text)) {
    return 'finance';
  }
  return 'general';
}

/**
 * Kiểm tra văn bản hoặc URL bài viết có chứa từ khóa phủ định không phù hợp với ngách khách hàng không
 */
export function containsNegativeKeywords(text: string, nicheDefinition: string): boolean {
  if (!text || !nicheDefinition) return false;

  const category = detectNicheCategory(nicheDefinition);
  const keywords = NICHE_NEGATIVE_KEYWORDS[category] || [];
  if (keywords.length === 0) return false;

  const lowerText = text.toLowerCase();
  for (const kw of keywords) {
    // Sử dụng Regex ranh giới từ để tránh khớp nhầm chuỗi con
    const pattern = new RegExp(`\\b${kw.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')}\\b`, 'i');
    if (pattern.test(lowerText) || lowerText.includes(kw)) {
      logger.warn(`🚫 [Niche Negative Filter] Loại bỏ bài viết chứa từ phủ định ngách [${category}]: "${kw}"`);
      return true;
    }
  }

  return false;
}
