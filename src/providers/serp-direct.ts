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

  // Thử 2: DuckDuckGo Lite Engine (Siêu nhẹ, 0đ API, chống timeout)
  const ddgLitePosts = await fetchDuckDuckGoLiteSerp(query, maxPages);
  if (ddgLitePosts.length > 0) {
    logger.info(`🦆 [Direct SERP DDG Lite] Tìm thấy ${ddgLitePosts.length} kết quả (0đ API)`);
    return ddgLitePosts;
  }

  // Thử 3: DuckDuckGo HTML Scraper Fallback (Multi-page)
  const ddgPosts = await fetchDuckDuckGoSerp(query, maxPages);
  if (ddgPosts.length > 0) {
    logger.info(`🦆 [Direct SERP DuckDuckGo HTML] Tìm thấy ${ddgPosts.length} kết quả qua ${maxPages} trang (0đ API)`);
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
  // Do NOT reset isGoogleRateLimited during process run to prevent repeated 429 blocks
}

async function fetchGoogleSerp(query: string, timeParam: string, maxPages = 1): Promise<RawScrapedPost[]> {
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
        if (!isGoogleRateLimited) {
          logger.warn(`⚠️ [Google SERP] Rate limit HTTP 429 hit. Tự động chuyển toàn bộ dorks sang DuckDuckGo/Bing/SearXNG.`);
          isGoogleRateLimited = true;
        }
        break;
      }

      if (!res.ok) break;

      const html = await res.text();
      let pageNewItems = 0;

      // Phân tách khối kết quả tìm kiếm Google (<div class="g"> hoặc <div class="MjjYud">)
      const blocks = html.split(/<div\s+class="[^"]*(?:MjjYud|Gx5Zad|g\s|tF2Cxc)[^"]*"/gi);

      if (blocks.length > 1) {
        for (let i = 1; i < blocks.length; i++) {
          const block = blocks[i];

          // Tìm URL trong block
          const urlMatch = block.match(/href="\/url\?q=(https?%3A%2F%2F[^&"]+|https?:\/\/[^&"]+)/i) ||
                           block.match(/href="(https?:\/\/(?:facebook\.com|threads\.net|voz\.vn|tinhte\.vn|otofun\.net|otosaigon\.com|[^"\/]+)[^"]*)"/i);
          if (!urlMatch) continue;

          let cleanUrl = urlMatch[1];
          if (cleanUrl.startsWith('http%3A') || cleanUrl.startsWith('https%3A')) {
            cleanUrl = decodeURIComponent(cleanUrl);
          }

          if (!isValidSerpUrl(cleanUrl, seenUrls)) continue;
          seenUrls.add(cleanUrl);
          pageNewItems++;

          // Trích xuất Tiêu đề (<h3>)
          const titleMatch = block.match(/<h3[^>]*>(.*?)<\/h3>/i);
          const titleText = titleMatch ? cleanHtmlText(titleMatch[1]) : '';

          // Trích xuất Snippet
          const snippetMatch = block.match(/<div[^>]*class="[^"]*(?:VwiC3b|yXMwvf|BNeawe|s3rec)[^"]*"[^>]*>(.*?)<\/div>/i);
          const snippetText = snippetMatch ? cleanHtmlText(snippetMatch[1]) : cleanHtmlText(block.slice(0, 500));

          posts.push({
            platform: detectPlatform(cleanUrl),
            url: cleanUrl,
            rawContent: `[Google Result Trang ${page + 1}]\nURL: ${cleanUrl}\nTiêu đề: ${titleText}\nTrích đoạn nội dung: ${snippetText}`
          });
        }
      }

      // Fallback: nếu split block không tìm ra kết quả, dùng regex quét URL truyền thống
      if (pageNewItems === 0) {
        const urlQMatches = html.matchAll(/href="\/url\?q=(https?%3A%2F%2F[^&"]+|https?:\/\/[^&"]+)/gi);
        for (const match of urlQMatches) {
          const cleanUrl = decodeURIComponent(match[1]);
          if (isValidSerpUrl(cleanUrl, seenUrls)) {
            seenUrls.add(cleanUrl);
            pageNewItems++;
            posts.push({
              platform: detectPlatform(cleanUrl),
              url: cleanUrl,
              rawContent: `[Google Result Trang ${page + 1}]\nURL: ${cleanUrl}\nTrích đoạn nội dung: Kết quả từ Google Search`
            });
          }
        }
      }

      if (pageNewItems === 0) break;

      if (page < maxPages - 1) {
        await new Promise(r => setTimeout(r, 1000 + Math.random() * 500));
      }
    } catch (err: any) {
      if (err.message && err.message.includes('429')) {
        isGoogleRateLimited = true;
      }
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
    const sParam = page > 0 ? `&s=${page * 30}&dc=${page * 30 + 1}` : '';
    const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}${sParam}`;

    try {
      const res = await httpFetch(url, {
        headers: {
          'User-Agent': randomUA,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7'
        },
        timeoutMs: 8000,
        retries: 0
      });

      if (!res.ok) break;

      const html = await res.text();
      let pageNewItems = 0;

      // Phân tách các khối kết quả của DuckDuckGo (<div class="result ...">)
      const blocks = html.split(/<div\s+class="[^"]*result\s+results_links[^"]*"/gi);

      if (blocks.length > 1) {
        for (let i = 1; i < blocks.length; i++) {
          const block = blocks[i];
          const match = block.match(/uddg=(https?%3A%2F%2F[^&"]+|https?:\/\/[^&"]+)/i);
          if (!match) continue;

          const targetUrl = decodeURIComponent(match[1]);
          if (
            targetUrl.includes('duckduckgo.com') ||
            seenUrls.has(targetUrl) ||
            !isSpecificPostUrl(targetUrl)
          ) {
            continue;
          }

          seenUrls.add(targetUrl);
          pageNewItems++;

          // Trích xuất Tiêu đề DDG
          const titleMatch = block.match(/<a[^>]*class="[^"]*result__a[^"]*"[^>]*>(.*?)<\/a>/i);
          const titleText = titleMatch ? cleanHtmlText(titleMatch[1]) : '';

          // Trích xuất Snippet DDG
          const snippetMatch = block.match(/<(?:a|div)[^>]*class="[^"]*result__snippet[^"]*"[^>]*>(.*?)<\/(?:a|div)>/i);
          const snippetText = snippetMatch ? cleanHtmlText(snippetMatch[1]) : cleanHtmlText(block.slice(0, 400));

          posts.push({
            platform: detectPlatform(targetUrl),
            url: targetUrl,
            rawContent: `[DuckDuckGo Result Trang ${page + 1}]\nURL: ${targetUrl}\nTiêu đề: ${titleText}\nTrích đoạn nội dung: ${snippetText}`
          });
        }
      }

      // Fallback cho DDG nếu block split rỗng
      if (pageNewItems === 0) {
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
              rawContent: `[DuckDuckGo Result Trang ${page + 1}]\nURL: ${targetUrl}\nTrích đoạn nội dung: Kết quả từ DuckDuckGo`
            });
          }
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

async function fetchDuckDuckGoLiteSerp(query: string, maxPages = 2): Promise<RawScrapedPost[]> {
  const posts: RawScrapedPost[] = [];
  const seenUrls = new Set<string>();

  for (let page = 0; page < maxPages; page++) {
    const randomUA = USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
    const sParam = page > 0 ? `&s=${page * 30}` : '';
    const url = `https://lite.duckduckgo.com/lite/?q=${encodeURIComponent(query)}&kl=vi-vn${sParam}`;

    try {
      const res = await httpFetch(url, {
        headers: {
          'User-Agent': randomUA,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7'
        },
        timeoutMs: 8000,
        retries: 0
      });

      if (!res.ok) break;

      const html = await res.text();
      let pageNewItems = 0;

      // Extract DDG Lite HTML rows with result links & snippets
      const rows = html.split(/<tr[^>]*>/gi);
      let currentTitle = '';
      let currentUrl = '';

      for (let r = 0; r < rows.length; r++) {
        const row = rows[r];
        const uddgMatch = row.match(/uddg=(https?%3A%2F%2F[^&"'\s]+|https?:\/\/[^&"'\s]+)/i);
        if (uddgMatch) {
          let cleanUrl = decodeURIComponent(uddgMatch[1]).replace(/["'\s>].*$/, '');
          const titleMatch = row.match(/<a[^>]*class="result-link"[^>]*>(.*?)<\/a>/i) || row.match(/<a[^>]*>(.*?)<\/a>/i);
          currentTitle = titleMatch ? cleanHtmlText(titleMatch[1]) : '';
          currentUrl = cleanUrl;
        }

        const snippetMatch = row.match(/<td[^>]*class="result-snippet"[^>]*>(.*?)<\/td>/i);
        if (snippetMatch && currentUrl) {
          const snippetText = cleanHtmlText(snippetMatch[1]);
          if (
            !currentUrl.includes('duckduckgo.com') &&
            !seenUrls.has(currentUrl) &&
            isSpecificPostUrl(currentUrl)
          ) {
            seenUrls.add(currentUrl);
            pageNewItems++;
            posts.push({
              platform: detectPlatform(currentUrl),
              url: currentUrl,
              rawContent: `[DuckDuckGo Lite Trang ${page + 1}]\nURL: ${currentUrl}\nTiêu đề: ${currentTitle}\nTrích đoạn: ${snippetText}`
            });
          }
          currentUrl = '';
          currentTitle = '';
        }
      }

      // Fallback if row parsing found no items
      if (pageNewItems === 0) {
        const uddgMatches = html.matchAll(/uddg=(https?%3A%2F%2F[^&"'\s]+|https?:\/\/[^&"'\s]+)/gi);
        for (const match of uddgMatches) {
          let cleanUrl = decodeURIComponent(match[1]).replace(/["'\s>].*$/, '');
          if (
            !cleanUrl.includes('duckduckgo.com') &&
            !seenUrls.has(cleanUrl) &&
            isSpecificPostUrl(cleanUrl)
          ) {
            seenUrls.add(cleanUrl);
            pageNewItems++;
            posts.push({
              platform: detectPlatform(cleanUrl),
              url: cleanUrl,
              rawContent: `[DuckDuckGo Lite Trang ${page + 1}]\nURL: ${cleanUrl}\nTrích đoạn: Kết quả từ DuckDuckGo Lite`
            });
          }
        }
      }

      if (pageNewItems === 0) break;

      if (page < maxPages - 1) {
        await new Promise(r => setTimeout(r, 200 + Math.random() * 200));
      }
    } catch (err: any) {
      logger.warn(`[DuckDuckGo Lite Page ${page + 1}] Lỗi: ${err.message}`);
      break;
    }
  }

  return posts;
}
