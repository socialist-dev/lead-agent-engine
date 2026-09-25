import { RawScrapedPost } from '../types';
import { detectPlatform } from '../utils';
import { httpFetch } from '../infra/http-client';
import { logger } from '../infra/logger';
import { isSpecificPostUrl } from '../infra/url-verifier';

const SEARXNG_INSTANCES = [
  'https://searx.be',
  'https://searx.space',
  'https://searx.priv.at'
];

export async function fetchSearXNG(query: string, maxPages = 1): Promise<RawScrapedPost[]> {
  const posts: RawScrapedPost[] = [];
  const seenUrls = new Set<string>();

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
          timeoutMs: 3500,
          retries: 0
        });

        if (!res.ok) break;

        const contentType = res.headers.get('content-type') || '';
        if (!contentType.includes('application/json')) break;

        const data = (await res.json()) as any;
        const results = data.results;

        if (!Array.isArray(results) || results.length === 0) break;

        let pageNewItems = 0;
        for (const item of results) {
          if (!item.url || !isSpecificPostUrl(item.url)) continue;

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
        break;
      }
    }

    if (success && posts.length > 0) {
      logger.info(`🌀 [SearXNG Engine] Tìm thấy ${posts.length} kết quả qua ${instance}`);
      break;
    }
  }

  return posts;
}
