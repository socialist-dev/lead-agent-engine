export interface RawScrapedPost {
  platform: string;
  url: string;
  rawContent: string;
}

export function detectPlatform(url: string): string {
  if (url.includes('tiktok.com')) return 'TikTok';
  if (url.includes('youtube.com') || url.includes('youtu.be')) return 'YouTube';
  if (url.includes('threads.net')) return 'Threads';
  if (url.includes('facebook.com')) return 'Facebook';
  if (url.includes('x.com') || url.includes('twitter.com')) return 'X';
  if (url.includes('voz.vn')) return 'Voz';
  if (url.includes('otofun.net') || url.includes('otosaigon.com')) return 'Diễn đàn Ô tô';
  return 'Web / Diễn đàn';
}

export async function searchJina(query: string, apiKey: string, timeFilter = 'qdr:d'): Promise<RawScrapedPost[]> {
  // 🌟 Chuẩn hóa: Nếu timeFilter có dấu phẩy thì chỉ lấy mã đầu tiên hợp lệ
  let validTimeParam = 'qdr:d';
  if (timeFilter.includes('qdr:w')) {
    validTimeParam = 'qdr:w';
  }

  const url = `https://s.jina.ai/${encodeURIComponent(query)}?tbs=${validTimeParam}`;
  const posts: RawScrapedPost[] = [];

  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(10000),
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'X-Locale': 'vi-VN',
        'X-No-Cache': 'true'
      }
    });

    if (!res.ok) return [];

    const md = await res.text();
    const sections = md.split(/\[\d+\] Title:/g);

    for (const section of sections) {
      if (!section.trim()) continue;
      const urlMatch = section.match(/URL Source:\s*(https?:\/\/[^\s\n]+)/);

      if (urlMatch) {
        const postUrl = urlMatch[1].trim();
        if (postUrl.includes('/search') || postUrl.endsWith('.net/')) continue;

        posts.push({
          platform: detectPlatform(postUrl),
          url: postUrl,
          rawContent: section
        });
      }
    }
  } catch (err: any) {
    console.warn(`[Jina] Bỏ qua dork "${query}": ${err.message}`);
  }

  return posts;
}
