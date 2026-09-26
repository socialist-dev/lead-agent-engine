export const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export function detectPlatform(url: string): string {
  if (!url) return 'Web / Diễn đàn';
  if (url.includes('tiktok.com')) return 'TikTok';
  if (url.includes('youtube.com') || url.includes('youtu.be')) return 'YouTube';
  if (url.includes('threads.net')) return 'Threads';
  if (url.includes('facebook.com')) return 'Facebook';
  if (url.includes('x.com') || url.includes('twitter.com')) return 'X';
  if (url.includes('voz.vn')) return 'Voz';
  if (url.includes('otofun.net') || url.includes('otosaigon.com')) return 'Diễn đàn Ô tô';
  return 'Web / Diễn đàn';
}

export function formatScanTimeVN(): string {
  const now = new Date();
  const vnTime = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Ho_Chi_Minh' }));
  const d = String(vnTime.getDate()).padStart(2, '0');
  const m = String(vnTime.getMonth() + 1).padStart(2, '0');
  const y = vnTime.getFullYear();
  const h = String(vnTime.getHours()).padStart(2, '0');
  const min = String(vnTime.getMinutes()).padStart(2, '0');
  const s = String(vnTime.getSeconds()).padStart(2, '0');
  return `${d}/${m}/${y} ${h}:${min}:${s}`;
}

export function cleanPhoneNumber(rawContact: string): string {
  let clean = String(rawContact || '').trim();
  const lower = clean.toLowerCase();
  
  if (
    clean === '' ||
    lower === 'null' ||
    lower === 'undefined' ||
    lower === 'n/a' ||
    lower === 'none' ||
    lower === 'không' ||
    lower === 'chưa có' ||
    lower.startsWith('chưa có') ||
    clean.includes('http://') ||
    clean.includes('https://') ||
    clean.includes('facebook.com') ||
    clean.includes('threads.net') ||
    clean.includes('tiktok.com') ||
    clean.includes('youtube.com') ||
    clean.includes('x.com') ||
    clean.includes('voz.vn') ||
    clean.includes('www.') ||
    clean.includes('.com') ||
    clean.includes('.net') ||
    clean.includes('.vn')
  ) {
    return 'Chưa có SĐT (Inbox qua link bài)';
  }
  return clean;
}

export function cleanStringField(val: any, fallback: string): string {
  if (val === undefined || val === null) return fallback;
  const str = String(val).trim();
  const lower = str.toLowerCase();
  if (str === '' || lower === 'null' || lower === 'undefined' || lower === 'n/a' || lower === 'none') {
    return fallback;
  }
  return str;
}

export function formatPostedTimeToDateTime(rawTime: string): string {
  const now = new Date();
  const vnTime = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Ho_Chi_Minh' }));
  const currentYear = vnTime.getFullYear();

  const pad = (n: number) => String(n).padStart(2, '0');
  const formatDate = (d: Date) => {
    return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  if (!rawTime) return 'UNKNOWN_TIME';
  const str = String(rawTime).trim().toLowerCase();

  // 0. Chặn trực tiếp các chuỗi chứa năm cũ (2020-2025 hoặc trước) → UNKNOWN_TIME
  const oldYearMatch = str.match(/\b(20[0-1]\d|202[0-5])\b/);
  if (oldYearMatch) {
    return 'UNKNOWN_TIME';
  }

  // Chặn trực tiếp "tháng trước", "năm trước", "months ago", "years ago", "tuần trước" > 2 tuần
  if (/tháng\s+trước|month|năm\s+trước|year/i.test(str)) {
    return 'UNKNOWN_TIME';
  }

  // 1. Mốc ngày tháng năm đã có sẵn (VD: 25/09/2026 14:30 hoặc 25/09/2026)
  const existingDateMatch = str.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})(?:\s+(\d{1,2}):(\d{2}))?/);
  if (existingDateMatch) {
    const day = parseInt(existingDateMatch[1], 10);
    const month = parseInt(existingDateMatch[2], 10);
    const year = parseInt(existingDateMatch[3], 10);
    // Chặn năm cũ hoặc năm tương lai xa
    if (year < currentYear || year > currentYear + 1) {
      return 'UNKNOWN_TIME';
    }
    // Chặn ngày/tháng không hợp lệ
    if (month < 1 || month > 12 || day < 1 || day > 31) {
      return 'UNKNOWN_TIME';
    }
    const hour = existingDateMatch[4] ? pad(parseInt(existingDateMatch[4], 10)) : pad(vnTime.getHours());
    const min = existingDateMatch[5] ? pad(parseInt(existingDateMatch[5], 10)) : pad(vnTime.getMinutes());
    return `${pad(day)}/${pad(month)}/${year} ${hour}:${min}`;
  }

  // 2. Các từ tương đối kiểu "vừa xong", "mới đăng" → Quy đổi sang ngày giờ quét hiện tại
  if (
    str.includes('vừa xong') ||
    str.includes('vừa mới') ||
    str.includes('mới đăng') ||
    str.includes('vừa đăng') ||
    str.includes('mới xong') ||
    str.includes('just now')
  ) {
    return formatDate(vnTime);
  }

  // 3. "X phút trước" / "X min ago"
  const minMatch = str.match(/(\d+)\s*(phút|min)/i);
  if (minMatch) {
    const mins = parseInt(minMatch[1], 10);
    if (mins > 60 * 24 * 30) return 'UNKNOWN_TIME'; // > 30 ngày tính theo phút
    const target = new Date(vnTime.getTime() - mins * 60 * 1000);
    return formatDate(target);
  }

  // 4. "X giờ trước" / "X hours ago" / "Xh"
  const hourMatch = str.match(/(\d+)\s*(giờ|hour|h\b)/i);
  if (hourMatch) {
    const hours = parseInt(hourMatch[1], 10);
    if (hours > 24 * 30) return 'UNKNOWN_TIME'; // > 30 ngày tính theo giờ
    const target = new Date(vnTime.getTime() - hours * 60 * 60 * 1000);
    return formatDate(target);
  }

  // 5. "X ngày trước" / "X days ago" / "Xd"
  const dayMatch = str.match(/(\d+)\s*(ngày|day|d\b)/i);
  if (dayMatch) {
    const days = parseInt(dayMatch[1], 10);
    if (days > 365) return 'UNKNOWN_TIME'; // > 1 năm
    const target = new Date(vnTime.getTime() - days * 24 * 60 * 60 * 1000);
    return formatDate(target);
  }

  // 6. "X tuần trước" / "X weeks ago"
  const weekMatch = str.match(/(\d+)\s*(tuần|week)/i);
  if (weekMatch) {
    const weeks = parseInt(weekMatch[1], 10);
    if (weeks > 52) return 'UNKNOWN_TIME';
    const target = new Date(vnTime.getTime() - weeks * 7 * 24 * 60 * 60 * 1000);
    return formatDate(target);
  }

  // STRICT FALLBACK: Không match bất kỳ pattern nào → UNKNOWN_TIME (KHÔNG gán ngày hiện tại)
  return 'UNKNOWN_TIME';
}

export async function mapConcurrent<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = new Array(items.length);
  let currentIndex = 0;
  const concurrency = Math.max(1, Math.min(limit, items.length));
  
  const workers = Array.from({ length: concurrency }, async () => {
    while (currentIndex < items.length) {
      const i = currentIndex++;
      try {
        const res = await fn(items[i], i);
        results[i] = { status: 'fulfilled', value: res };
      } catch (reason) {
        results[i] = { status: 'rejected', reason };
      }
    }
  });

  await Promise.all(workers);
  return results;
}


