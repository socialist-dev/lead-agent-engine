import { RawScrapedPost } from '../types';
import { detectPlatform } from '../utils';
import { httpFetch } from '../infra/http-client';
import { logger } from '../infra/logger';

export async function searchFirecrawl(
  query: string,
  apiKey: string,
  _timeFilter = 'qdr:d'
): Promise<RawScrapedPost[]> {
  if (!apiKey) return [];
  const posts: RawScrapedPost[] = [];

  try {
    const res = await httpFetch('https://api.firecrawl.dev/v1/search', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        query: query,
        searchOptions: { limit: 10 }
      }),
      timeoutMs: 12000,
      retries: 2
    });

    if (!res.ok) return [];
    const json = (await res.json()) as any;
    const results = json.data || [];

    for (const item of results) {
      if (item.url && item.markdown) {
        posts.push({
          platform: detectPlatform(item.url),
          url: item.url,
          rawContent: `Title: ${item.title || ''}\nURL Source: ${item.url}\n\n${item.markdown}`
        });
      }
    }
  } catch (err: any) {
    logger.warn(`[Firecrawl] Bỏ qua dork "${query}": ${err.message}`);
  }

  return posts;
}
