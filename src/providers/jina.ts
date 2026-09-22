import { RawScrapedPost } from '../types';
import { detectPlatform } from '../utils';
import { httpFetch } from '../infra/http-client';
import { logger } from '../infra/logger';

export async function searchJina(
  query: string,
  apiKey: string,
  timeFilter = 'qdr:d'
): Promise<RawScrapedPost[]> {
  let validTimeParam = 'qdr:d';
  if (timeFilter.includes('qdr:w')) {
    validTimeParam = 'qdr:w';
  }

  const url = `https://s.jina.ai/${encodeURIComponent(query)}?tbs=${validTimeParam}`;
  const posts: RawScrapedPost[] = [];

  try {
    const res = await httpFetch(url, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'X-Locale': 'vi-VN',
        'X-No-Cache': 'true'
      },
      timeoutMs: 12000,
      retries: 2
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
    logger.warn(`[Jina] Bỏ qua dork "${query}": ${err.message}`);
  }

  return posts;
}
