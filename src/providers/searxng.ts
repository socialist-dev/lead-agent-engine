import { RawScrapedPost } from '../types';
import { detectPlatform } from '../utils';
import { httpFetch } from '../infra/http-client';
import { logger } from '../infra/logger';

const SEARXNG_INSTANCES = [
  'https://searx.be',
  'https://searxng.site',
  'https://searx.priv.at',
  'https://searx.online',
  'https://search.bus-hit.me'
];

export async function fetchSearXNG(query: string, maxPages = 2): Promise<RawScrapedPost[]> {
  const posts: RawScrapedPost[] = [];
  const seenUrls = new Set<string>();

  // Pick 2 random instances to query
  const shuffledInstances = [...SEARXNG_INSTANCES].sort(() => Math.random() - 0.5);

  for (const instance of shuffledInstances) {
    let success = false;

    for (let page = 1; page <= maxPages; page++) {
      const url = `${instance}/search?q=${encodeURIComponent(query)}&format=json&pageno=${page}`;

      try {
        const res = await httpFetch(url, {
          headers: {
            'Accept': 'application/json',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
          },
          timeoutMs: 6000,
          retries: 1
        });

        if (!res.ok) break;

        const data = (await res.json()) as any;
        const results = data.results;

        if (!Array.isArray(results) || results.length === 0) break;

        let pageNewItems = 0;
        for (const item of results) {
          if (!item.url) continue;

          const cleanUrl = item.url;
          if (seenUrls.has(cleanUrl)) continue;
          seenUrls.add(cleanUrl);
          pageNewItems++;

          const title = item.title || '';
          const snippet = item.content || '';

          posts.push({
            platform: detectPlatform(cleanUrl),
            url: cleanUrl,
            rawContent: `[SearXNG Result]\nURL: ${cleanUrl}\nTiêu đề: ${title}\nTrích đoạn: ${snippet}`
          });
        }

        if (pageNewItems > 0) success = true;
        else break;
      } catch (err: any) {
        logger.warn(`[SearXNG Instance ${instance}] Lỗi: ${err.message}`);
        break;
      }
    }

    if (success && posts.length > 0) {
      logger.info(`🌀 [SearXNG Engine] Tìm thấy ${posts.length} kết quả qua ${instance} (0đ API)`);
      break; // Found working instance, no need to try next
    }
  }

  return posts;
}
