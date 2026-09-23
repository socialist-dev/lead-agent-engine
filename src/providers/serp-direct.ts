import { RawScrapedPost } from '../types';
import { detectPlatform } from '../utils';
import { httpFetch } from '../infra/http-client';
import { logger } from '../infra/logger';

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'
];

export async function searchSerpDirect(
  query: string,
  timeFilter = 'qdr:d',
  maxPages = 3
): Promise<RawScrapedPost[]> {
  const safeTime = String(timeFilter || 'qdr:d');
  const validTimeParam = safeTime.includes('qdr:w') ? 'qdr:w' : 'qdr:d';

  // Thử 1: Direct Google SERP Scraper (Multi-page)
  const googlePosts = await fetchGoogleSerp(query, validTimeParam, maxPages);
  if (googlePosts.length > 0) {
    logger.info(`🌐 [Direct SERP Google] Tìm thấy ${googlePosts.length} kết quả qua ${maxPages} trang (0đ API)`);
    return googlePosts;
  }

  // Thử 2: DuckDuckGo HTML Scraper Fallback (Multi-page)
  const ddgPosts = await fetchDuckDuckGoSerp(query, maxPages);
  if (ddgPosts.length > 0) {
    logger.info(`🦆 [Direct SERP DuckDuckGo] Tìm thấy ${ddgPosts.length} kết quả qua ${maxPages} trang (0đ API)`);
    return ddgPosts;
  }

  return [];
}

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

let isGoogleRateLimited = false;

export function resetSerpState() {
  isGoogleRateLimited = false;
}

async function fetchGoogleSerp(query: string, timeParam: string, maxPages = 2): Promise<RawScrapedPost[]> {
  if (isGoogleRateLimited) {
    return []; // Google is currently rate-limited in this run, skip to avoid delays
  }

  const posts: RawScrapedPost[] = [];
  const seenUrls = new Set<string>();

  for (let page = 0; page < maxPages; page++) {
    const randomUA = USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
    const startOffset = page * 10;
    const url = `https://www.google.com/search?q=${encodeURIComponent(query)}&tbs=${timeParam}&hl=vi&gl=vn${startOffset > 0 ? `&start=${startOffset}` : ''}`;

    try {
      const res = await httpFetch(url, {
        headers: {
          'User-Agent': randomUA,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7',
          'Cache-Control': 'no-cache'
        },
        timeoutMs: 6000,
        retries: 0 // Do not retry on 429 immediately to avoid hitting timeout
      });

      if (res.status === 429) {
        logger.warn(`⚠️ [Google SERP] Rate limit 429. Skipping Google for remaining dorks in this run.`);
        isGoogleRateLimited = true;
        break;
      }

      if (!res.ok) break;

      const html = await res.text();
      const chunks = html.split(/href="\/url\?q=/g);
      let pageNewItems = 0;

      for (let i = 1; i < chunks.length; i++) {
        const chunk = chunks[i];
        const endUrlIdx = chunk.indexOf('&amp;');
        if (endUrlIdx === -1) continue;

        const rawUrl = chunk.slice(0, endUrlIdx);
        let cleanUrl = decodeURIComponent(rawUrl);

        if (
          cleanUrl.includes('google.com') ||
          cleanUrl.includes('youtube.com/watch') ||
          cleanUrl.endsWith('.net/')
        ) {
          continue;
        }
        if (seenUrls.has(cleanUrl)) continue;
        seenUrls.add(cleanUrl);
        pageNewItems++;

        const snippetText = cleanHtmlText(chunk.slice(0, 600));

        posts.push({
          platform: detectPlatform(cleanUrl),
          url: cleanUrl,
          rawContent: `[Google Result Trang ${page + 1}]\nURL: ${cleanUrl}\nTrích đoạn nội dung: ${snippetText}`
        });
      }

      if (pageNewItems === 0) break;

      if (page < maxPages - 1) {
        await new Promise(r => setTimeout(r, 300 + Math.random() * 300));
      }
    } catch (err: any) {
      logger.warn(`[Google SERP Direct Page ${page + 1}] Lỗi: ${err.message}`);
      break;
    }
  }

  return posts;
}

async function fetchDuckDuckGoSerp(query: string, maxPages = 3): Promise<RawScrapedPost[]> {
  const posts: RawScrapedPost[] = [];
  const seenUrls = new Set<string>();
  let nextParams = '';

  for (let page = 0; page < maxPages; page++) {
    const randomUA = USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
    const url = 'https://html.duckduckgo.com/html/';

    let bodyStr = `q=${encodeURIComponent(query)}`;
    if (page > 0 && nextParams) {
      bodyStr += `&${nextParams}`;
    } else if (page > 0) {
      bodyStr += `&s=${page * 30}&dc=${page * 30 + 1}`;
    }

    try {
      const res = await httpFetch(url, {
        method: 'POST',
        headers: {
          'User-Agent': randomUA,
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept-Language': 'vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7'
        },
        body: bodyStr,
        timeoutMs: 8000,
        retries: 1
      });

      if (!res.ok) break;

      const html = await res.text();
      const resultBlocks = html.split(/<div[^>]+class="[^"]*result[^"]*body-result/gi);
      let pageNewItems = 0;

      for (let i = 1; i < resultBlocks.length; i++) {
        const block = resultBlocks[i];
        const urlMatch = block.match(/href="\/\/duckduckgo\.com\/l\/\?uddg=(https?%3A%2F%2F[^&"]+)"/i);
        if (!urlMatch) continue;

        const targetUrl = decodeURIComponent(urlMatch[1]);
        if (targetUrl.includes('duckduckgo.com') || targetUrl.endsWith('.net/')) continue;
        if (seenUrls.has(targetUrl)) continue;
        seenUrls.add(targetUrl);
        pageNewItems++;

        const snippetMatch = block.match(/class="result__snippet"[^>]*>([\s\S]*?)<\/a>/i);
        const snippetText = snippetMatch ? cleanHtmlText(snippetMatch[1]) : cleanHtmlText(block.slice(0, 400));

        posts.push({
          platform: detectPlatform(targetUrl),
          url: targetUrl,
          rawContent: `[DuckDuckGo Result Trang ${page + 1}]\nURL: ${targetUrl}\nTrích đoạn nội dung: ${snippetText}`
        });
      }

      // Trích xuất form hidden params cho trang kế tiếp từ HTML DDG
      const sMatch = html.match(/name="s"\s+value="([^"]+)"/i);
      const dcMatch = html.match(/name="dc"\s+value="([^"]+)"/i);
      const vqdMatch = html.match(/name="vqd"\s+value="([^"]+)"/i);
      if (sMatch && dcMatch && vqdMatch) {
        nextParams = `s=${encodeURIComponent(sMatch[1])}&dc=${encodeURIComponent(dcMatch[1])}&vqd=${encodeURIComponent(vqdMatch[1])}`;
      } else {
        nextParams = '';
      }

      if (pageNewItems === 0) break;

      if (page < maxPages - 1) {
        await new Promise(r => setTimeout(r, 400 + Math.random() * 400));
      }
    } catch (err: any) {
      logger.warn(`[DuckDuckGo Direct Page ${page + 1}] Lỗi: ${err.message}`);
      break;
    }
  }

  return posts;
}
