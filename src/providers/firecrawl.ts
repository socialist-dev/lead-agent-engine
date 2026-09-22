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
        limit: 10,
        scrapeOptions: {
          formats: ['markdown']
        }
      }),
      timeoutMs: 15000,
      retries: 2
    });

    if (!res.ok) {
      const errText = await res.text();
      logger.warn(`[Firecrawl] HTTP Error ${res.status}: ${errText.slice(0, 100)}`);
      return [];
    }

    const json = (await res.json()) as any;
    const results = json.data || json.results || [];

    for (const item of results) {
      const textContent = item.markdown || item.description || item.snippet || item.title || '';
      if (item.url && textContent) {
        posts.push({
          platform: detectPlatform(item.url),
          url: item.url,
          rawContent: `Title: ${item.title || ''}\nURL Source: ${item.url}\n\n${textContent}`
        });
      }
    }
  } catch (err: any) {
    logger.warn(`[Firecrawl] Bỏ qua dork "${query}": ${err.message}`);
  }

  return posts;
}

