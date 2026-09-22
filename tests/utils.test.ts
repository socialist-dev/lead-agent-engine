import { describe, it, expect } from 'vitest';
import { detectPlatform, cleanPhoneNumber, mapConcurrent } from '../src/utils';

describe('Utils', () => {
  it('detects platforms accurately from URLs', () => {
    expect(detectPlatform('https://www.threads.net/@user/post/123')).toBe('Threads');
    expect(detectPlatform('https://facebook.com/groups/123/posts/456')).toBe('Facebook');
    expect(detectPlatform('https://tiktok.com/@user/video/123')).toBe('TikTok');
    expect(detectPlatform('https://voz.vn/t/threads-post.123')).toBe('Voz');
    expect(detectPlatform('https://example.com/blog/article')).toBe('Web / Diễn đàn');
  });

  it('cleans phone numbers and handles fallbacks correctly', () => {
    expect(cleanPhoneNumber('0981234567')).toBe('0981234567');
    expect(cleanPhoneNumber('https://facebook.com/post')).toBe('Chưa có SĐT (Inbox qua link bài)');
    expect(cleanPhoneNumber('')).toBe('Chưa có SĐT (Inbox qua link bài)');
  });

  it('mapConcurrent executes items in parallel with concurrency limit', async () => {
    const items = [1, 2, 3, 4, 5];
    const results = await mapConcurrent(items, 2, async (num) => {
      return num * 2;
    });

    expect(results).toHaveLength(5);
    expect(results.map(r => r.status === 'fulfilled' ? r.value : null)).toEqual([2, 4, 6, 8, 10]);
  });
});
