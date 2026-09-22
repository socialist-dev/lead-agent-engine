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

