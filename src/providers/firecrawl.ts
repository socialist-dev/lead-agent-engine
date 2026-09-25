import { RawScrapedPost } from '../types';
import { detectPlatform } from '../utils';
import { httpFetch } from '../infra/http-client';
import { logger } from '../infra/logger';

let isFirecrawlRateLimited = false;

export function resetFirecrawlState(): void {
  isFirecrawlRateLimited = false;
}

export async function searchFirecrawl(
  query: string,
  apiKey: string,
  _timeFilter = 'qdr:d'
): Promise<RawScrapedPost[]> {
  if (!apiKey || isFirecrawlRateLimited) return [];
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
        limit: 5,
        scrapeOptions: {
          formats: ['markdown'],
          onlyMainContent: true
        }
      }),
      timeoutMs: 8000,
      retries: 1
    });

    if (!res.ok) {
      if (res.status === 429) {
        logger.warn(`[Firecrawl] HTTP 429 Rate Limit. Bỏ qua Firecrawl các dork tiếp theo.`);
        isFirecrawlRateLimited = true;
      } else {
        const errText = await res.text();
        logger.warn(`[Firecrawl] HTTP Error ${res.status}: ${errText.slice(0, 100)}`);
      }
      return [];
    }

    const json = (await res.json()) as any;
    const results = json.data || json.results || [];

    for (const item of results) {
      const textContent = (item.markdown || item.description || item.snippet || item.title || '').trim();
      if (item.url && textContent) {
        posts.push({
          platform: detectPlatform(item.url),
          url: item.url,
          rawContent: `Title: ${item.title || ''}\nURL Source: ${item.url}\n\n${textContent.slice(0, 500)}`
        });
      }
    }
  } catch (err: any) {
    logger.warn(`[Firecrawl] Bỏ qua dork "${query}": ${err.message}`);
  }

  return posts;
}


