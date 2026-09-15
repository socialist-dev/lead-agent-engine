import { RawScrapedPost, detectPlatform } from './jina';

export async function searchFirecrawl(query: string, apiKey: string, timeFilter = 'qdr:d'): Promise<RawScrapedPost[]> {
  if (!apiKey) return [];
  const fullQuery = `${query} &tbs=${timeFilter}`;
  const posts: RawScrapedPost[] = [];

  try {
    const res = await fetch('https://api.firecrawl.dev/v1/search', {
      signal: AbortSignal.timeout(10000),
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ query: fullQuery, searchOptions: { limit: 10 } })
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
    console.warn(`[Firecrawl] Bỏ qua dork "${query}": ${err.message}`);
  }
  return posts;
}
