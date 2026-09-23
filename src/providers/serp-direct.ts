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
  timeFilter = 'qdr:d'
): Promise<RawScrapedPost[]> {
  const safeTime = String(timeFilter || 'qdr:d');
  const validTimeParam = safeTime.includes('qdr:w') ? 'qdr:w' : 'qdr:d';

  // Thử 1: Direct Google SERP Scraper
  const googlePosts = await fetchGoogleSerp(query, validTimeParam);
  if (googlePosts.length > 0) {
    logger.info(`🌐 [Direct SERP Google] Tìm thấy ${googlePosts.length} kết quả kèm trích đoạn (0đ API)`);
    return googlePosts;
  }

  // Thử 2: DuckDuckGo HTML Scraper Fallback
  const ddgPosts = await fetchDuckDuckGoSerp(query);
  if (ddgPosts.length > 0) {
    logger.info(`🦆 [Direct SERP DuckDuckGo] Tìm thấy ${ddgPosts.length} kết quả kèm trích đoạn (0đ API)`);
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

async function fetchGoogleSerp(query: string, timeParam: string): Promise<RawScrapedPost[]> {
  const randomUA = USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
  const url = `https://www.google.com/search?q=${encodeURIComponent(query)}&tbs=${timeParam}&hl=vi&gl=vn`;
  const posts: RawScrapedPost[] = [];

  try {
    const res = await httpFetch(url, {
      headers: {
        'User-Agent': randomUA,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7',
        'Cache-Control': 'no-cache'
      },
      timeoutMs: 8000,
      retries: 1
    });

    if (!res.ok) return [];

    const html = await res.text();
    // Tách HTML theo từng phần kết quả tìm kiếm Google
    const chunks = html.split(/href="\/url\?q=/g);
    const seenUrls = new Set<string>();

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

      // Trích xuất văn bản trích đoạn từ HTML xung quanh link
      const snippetText = cleanHtmlText(chunk.slice(0, 600));

      posts.push({
        platform: detectPlatform(cleanUrl),
        url: cleanUrl,
        rawContent: `[Google Result]\nURL: ${cleanUrl}\nTrích đoạn nội dung: ${snippetText}`
      });
    }
  } catch (err: any) {
    logger.warn(`[Google SERP Direct] Lỗi: ${err.message}`);
  }

  return posts;
}

async function fetchDuckDuckGoSerp(query: string): Promise<RawScrapedPost[]> {
  const randomUA = USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
  const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
  const posts: RawScrapedPost[] = [];

  try {
    const res = await httpFetch(url, {
      method: 'POST',
      headers: {
        'User-Agent': randomUA,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept-Language': 'vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7'
      },
      body: `q=${encodeURIComponent(query)}`,
      timeoutMs: 8000,
      retries: 1
    });

    if (!res.ok) return [];

    const html = await res.text();
    const resultBlocks = html.split(/<div[^>]+class="[^"]*result[^"]*body-result/gi);
    const seenUrls = new Set<string>();

    for (let i = 1; i < resultBlocks.length; i++) {
      const block = resultBlocks[i];
      const urlMatch = block.match(/href="\/\/duckduckgo\.com\/l\/\?uddg=(https?%3A%2F%2F[^&"]+)"/i);
      if (!urlMatch) continue;

      const targetUrl = decodeURIComponent(urlMatch[1]);
      if (targetUrl.includes('duckduckgo.com') || targetUrl.endsWith('.net/')) continue;
      if (seenUrls.has(targetUrl)) continue;
      seenUrls.add(targetUrl);

      // Trích xuất snippet text trong class result__snippet
      const snippetMatch = block.match(/class="result__snippet"[^>]*>([\s\S]*?)<\/a>/i);
      const snippetText = snippetMatch ? cleanHtmlText(snippetMatch[1]) : cleanHtmlText(block.slice(0, 400));

      posts.push({
        platform: detectPlatform(targetUrl),
        url: targetUrl,
        rawContent: `[DuckDuckGo Result]\nURL: ${targetUrl}\nTrích đoạn nội dung: ${snippetText}`
      });
    }
  } catch (err: any) {
    logger.warn(`[DuckDuckGo Direct] Lỗi: ${err.message}`);
  }

  return posts;
}
