import { RawScrapedPost } from '../types';
import { detectPlatform } from '../utils';
import { httpFetch } from '../infra/http-client';
import { logger } from '../infra/logger';
import { isSpecificPostUrl } from '../infra/url-verifier';

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36'
];

function cleanHtmlText(htmlSnippet: string): string {
  return htmlSnippet
    .replace(/<[^>]+>/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

export async function fetchBingSerp(query: string, maxPages = 2): Promise<RawScrapedPost[]> {
  const posts: RawScrapedPost[] = [];
  const seenUrls = new Set<string>();

  for (let page = 0; page < maxPages; page++) {
    const randomUA = USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
    const firstOffset = 1 + page * 10;
    const url = `https://www.bing.com/search?q=${encodeURIComponent(query)}&setlang=vi-VN${page > 0 ? `&first=${firstOffset}` : ''}`;

    try {
      const res = await httpFetch(url, {
        headers: {
          'User-Agent': randomUA,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7'
        },
        timeoutMs: 8000,
        retries: 1
      });

      if (!res.ok) break;

      const html = await res.text();
      const blocks = html.split(/<li[^>]+class="[^"]*b_algo[^"]*"/gi);
      let pageNewItems = 0;

      for (let i = 1; i < blocks.length; i++) {
        const block = blocks[i];
        const urlMatch = block.match(/href="(https?:\/\/[^"]+)"/i);
        if (!urlMatch) continue;

        const cleanUrl = urlMatch[1];
        if (
          cleanUrl.includes('bing.com') ||
          cleanUrl.includes('microsoft.com') ||
          !isSpecificPostUrl(cleanUrl)
        ) {
          continue;
        }
        if (seenUrls.has(cleanUrl)) continue;
        seenUrls.add(cleanUrl);
        pageNewItems++;

        const snippetText = cleanHtmlText(block.slice(0, 800));

        posts.push({
          platform: detectPlatform(cleanUrl),
          url: cleanUrl,
          rawContent: `[Bing Result Trang ${page + 1}]\nURL: ${cleanUrl}\nTrích đoạn nội dung: ${snippetText}`
        });
      }

      if (pageNewItems === 0) break;

      if (page < maxPages - 1) {
        await new Promise(r => setTimeout(r, 400 + Math.random() * 400));
      }
    } catch (err: any) {
      logger.warn(`[Bing SERP Direct Page ${page + 1}] Lỗi: ${err.message}`);
      break;
    }
  }

  if (posts.length > 0) {
    logger.info(`🔍 [Direct SERP Bing] Tìm thấy ${posts.length} kết quả qua ${maxPages} trang (0đ API)`);
  }

  return posts;
}
