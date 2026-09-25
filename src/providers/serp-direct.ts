import { RawScrapedPost } from '../types';
import { detectPlatform } from '../utils';
import { httpFetch } from '../infra/http-client';
import { logger } from '../infra/logger';
import { isSpecificPostUrl } from '../infra/url-verifier';

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
    return [];
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
        retries: 0
      });

      if (res.status === 429) {
        logger.warn(`⚠️ [Google SERP] Rate limit 429. Skipping Google for remaining dorks in this run.`);
        isGoogleRateLimited = true;
        break;
      }

      if (!res.ok) break;

      const html = await res.text();
      let pageNewItems = 0;

      // Trích xuất link dạng /url?q=
      const urlQMatches = html.matchAll(/href="\/url\?q=(https?%3A%2F%2F[^&"]+|https?:\/\/[^&"]+)/gi);
      for (const match of urlQMatches) {
        const cleanUrl = decodeURIComponent(match[1]);
        if (isValidSerpUrl(cleanUrl, seenUrls)) {
          seenUrls.add(cleanUrl);
          pageNewItems++;
          posts.push({
            platform: detectPlatform(cleanUrl),
            url: cleanUrl,
            rawContent: `[Google Result Trang ${page + 1}]\nURL: ${cleanUrl}\nTrích đoạn nội dung: Kết quả tìm kiếm từ Google`
          });
        }
      }

      // Trích xuất link direct href="https://..." trong kết quả Google hiện đại
      const directMatches = html.matchAll(/href="(https?:\/\/(?:facebook\.com|threads\.net|voz\.vn|tinhte\.vn|otofun\.net|otosaigon\.com|[^"\/]+)[^"]*)"/gi);
      for (const match of directMatches) {
        const cleanUrl = match[1];
        if (isValidSerpUrl(cleanUrl, seenUrls)) {
          seenUrls.add(cleanUrl);
          pageNewItems++;
          posts.push({
            platform: detectPlatform(cleanUrl),
            url: cleanUrl,
            rawContent: `[Google Result Trang ${page + 1}]\nURL: ${cleanUrl}\nTrích đoạn nội dung: Kết quả tìm kiếm từ Google`
          });
        }
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

function isValidSerpUrl(url: string, seenUrls: Set<string>): boolean {
  if (!url || seenUrls.has(url)) return false;
  if (!isSpecificPostUrl(url)) return false;
  if (
    url.includes('google.com') ||
    url.includes('google.com.vn') ||
    url.includes('youtube.com/watch') ||
    url.includes('accounts.google') ||
    url.includes('support.google') ||
    url.endsWith('.net/') ||
    url.endsWith('.com/')
  ) {
    return false;
  }
  return true;
}

async function fetchDuckDuckGoSerp(query: string, maxPages = 2): Promise<RawScrapedPost[]> {
  const posts: RawScrapedPost[] = [];
  const seenUrls = new Set<string>();

  for (let page = 0; page < maxPages; page++) {
    const randomUA = USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
    const url = 'https://html.duckduckgo.com/html/';
    const bodyStr = `q=${encodeURIComponent(query)}${page > 0 ? `&s=${page * 30}&dc=${page * 30 + 1}` : ''}`;

    try {
      const res = await httpFetch(url, {
        method: 'POST',
        headers: {
          'User-Agent': randomUA,
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept-Language': 'vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7'
        },
        body: bodyStr,
        timeoutMs: 6000,
        retries: 0
      });

      if (!res.ok) break;

      const html = await res.text();
      let pageNewItems = 0;

      // Trích xuất tất cả uddg redirect URLs trong HTML DuckDuckGo
      const uddgMatches = html.matchAll(/uddg=(https?%3A%2F%2F[^&"]+|https?:\/\/[^&"]+)/gi);
      for (const match of uddgMatches) {
        const targetUrl = decodeURIComponent(match[1]);
        if (
          !targetUrl.includes('duckduckgo.com') &&
          !seenUrls.has(targetUrl) &&
          isSpecificPostUrl(targetUrl)
        ) {
          seenUrls.add(targetUrl);
          pageNewItems++;
          posts.push({
            platform: detectPlatform(targetUrl),
            url: targetUrl,
            rawContent: `[DuckDuckGo Result Trang ${page + 1}]\nURL: ${targetUrl}\nTrích đoạn: Kết quả tìm kiếm từ DuckDuckGo`
          });
        }
      }

      if (pageNewItems === 0) break;

      if (page < maxPages - 1) {
        await new Promise(r => setTimeout(r, 300 + Math.random() * 300));
      }
    } catch (err: any) {
      logger.warn(`[DuckDuckGo Direct Page ${page + 1}] Lỗi: ${err.message}`);
      break;
    }
  }

  return posts;
}
