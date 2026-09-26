import { RawScrapedPost } from '../types';
import { httpFetch } from './http-client';
import { logger } from './logger';
import { mapConcurrent } from '../utils';

function cleanHtmlText(html: string): string {
  // Strip script, style, header, footer elements
  const clean = html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, ' ')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, ' ')
    .replace(/<nav\b[^<]*(?:(?!<\/nav>)<[^<]*)*<\/nav>/gi, ' ')
    .replace(/<footer\b[^<]*(?:(?!<\/footer>)<[^<]*)*<\/footer>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();

  return clean;
}

export async function enrichPostsWithDeepContent(
  posts: RawScrapedPost[],
  concurrency = 4
): Promise<RawScrapedPost[]> {
  if (posts.length === 0) return posts;

  logger.info(`✨ [Content Enricher] Đang thử cào bổ sung nội dung cho ${posts.length} bài viết (giới hạn 3.5s/trang)...`);

  const results = await mapConcurrent(posts, concurrency, async (post) => {
    // Không cào sâu nếu đã có thông tin chi tiết dài (> 600 ký tự)
    if (post.rawContent.length > 600) {
      return post;
    }

    try {
      const res = await httpFetch(post.url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7'
        },
        timeoutMs: 3500,
        retries: 0
      });

      if (!res.ok) {
        return post; // Fallback 100%: giữ nguyên SERP snippet
      }

      const html = await res.text();
      const text = cleanHtmlText(html);

      if (text.length > 150) {
        // Cắt lấy tối đa 1200 ký tự quan trọng nhất của trang
        const enrichedSnippet = text.slice(0, 1200);
        return {
          ...post,
          rawContent: `${post.rawContent}\n\n[Nội dung cào chi tiết bổ sung]:\n${enrichedSnippet}`
        };
      }
    } catch {
      // Catch timeout / connection error silently -> 100% fallback to original post snippet
    }

    return post;
  });

  const enrichedCount = results.filter((r, i) => r.status === 'fulfilled' && (r.value as RawScrapedPost).rawContent.includes('[Nội dung cào chi tiết bổ sung]')).length;
  logger.info(`⚡ [Content Enricher] Đã làm giàu thành công nội dung cho ${enrichedCount}/${posts.length} bài viết.`);

  return results.map((r, i) => (r.status === 'fulfilled' ? (r.value as RawScrapedPost) : posts[i]));
}
