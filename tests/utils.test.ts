import { describe, it, expect } from 'vitest';
import { detectPlatform, cleanPhoneNumber, cleanStringField, mapConcurrent, formatPostedTimeToDateTime } from '../src/utils';
import { isSpecificPostUrl } from '../src/infra/url-verifier';

describe('Utils', () => {
  it('detects platforms accurately from URLs', () => {
    expect(detectPlatform('https://www.threads.net/@user/post/123')).toBe('Threads');
    expect(detectPlatform('https://facebook.com/groups/123/posts/456')).toBe('Facebook');
    expect(detectPlatform('https://tiktok.com/@user/video/123')).toBe('TikTok');
    expect(detectPlatform('https://voz.vn/t/threads-post.123')).toBe('Voz');
    expect(detectPlatform('https://example.com/blog/article')).toBe('Web / Diễn đàn');
  });

  it('rejects profile URLs and accepts specific post URLs via isSpecificPostUrl', () => {
    // Threads Profile vs Post
    expect(isSpecificPostUrl('https://www.threads.net/@nini_vu__')).toBe(false);
    expect(isSpecificPostUrl('https://www.threads.net/@nini_vu__/post/C_123456')).toBe(true);
    expect(isSpecificPostUrl('https://threads.net/t/C_123456')).toBe(true);

    // Facebook Group Home / Profile vs Post
    expect(isSpecificPostUrl('https://www.facebook.com/groups/hoireviewbaohoem')).toBe(false);
    expect(isSpecificPostUrl('https://www.facebook.com/nini_vu')).toBe(false);
    expect(isSpecificPostUrl('https://www.facebook.com/groups/hoireviewbaohoem/posts/123456')).toBe(true);

    // TikTok Profile vs Post
    expect(isSpecificPostUrl('https://www.tiktok.com/@nini_vu')).toBe(false);
    expect(isSpecificPostUrl('https://www.tiktok.com/@nini_vu/video/7123456789')).toBe(true);

    // Voz Category vs Thread Topic
    expect(isSpecificPostUrl('https://voz.vn/f/tro-chuyen-linh-tinh.17/')).toBe(false);
    expect(isSpecificPostUrl('https://voz.vn/t/hoi-mua-bao-hiem.123456/')).toBe(true);
  });

  it('cleans phone numbers and handles fallbacks correctly', () => {
    expect(cleanPhoneNumber('0981234567')).toBe('0981234567');
    expect(cleanPhoneNumber('https://facebook.com/post')).toBe('Chưa có SĐT (Inbox qua link bài)');
    expect(cleanPhoneNumber('https://threads.net/@user/post/1')).toBe('Chưa có SĐT (Inbox qua link bài)');
    expect(cleanPhoneNumber('N/A')).toBe('Chưa có SĐT (Inbox qua link bài)');
    expect(cleanPhoneNumber('null')).toBe('Chưa có SĐT (Inbox qua link bài)');
    expect(cleanPhoneNumber('')).toBe('Chưa có SĐT (Inbox qua link bài)');
  });

  it('formats posted time to precise DD/MM/YYYY HH:mm and eliminates Vừa xong', () => {
    const formattedNow = formatPostedTimeToDateTime('Vừa xong');
    expect(formattedNow).toMatch(/^\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}$/);

    const formattedMoiDang = formatPostedTimeToDateTime('Mới đăng gần đây');
    expect(formattedMoiDang).toMatch(/^\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}$/);

    const formattedNA = formatPostedTimeToDateTime('N/A');
    expect(formattedNA).toMatch(/^\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}$/);

    const formattedExplicit = formatPostedTimeToDateTime('24/09/2026 14:30');
    expect(formattedExplicit).toBe('24/09/2026 14:30');

    const formattedRelativeMin = formatPostedTimeToDateTime('30 phút trước');
    expect(formattedRelativeMin).toMatch(/^\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}$/);
  });

  it('cleans string fields with fallbacks', () => {
    expect(cleanStringField('Tài chính 3 tỷ', 'Theo thỏa thuận')).toBe('Tài chính 3 tỷ');
    expect(cleanStringField('', 'Theo thỏa thuận')).toBe('Theo thỏa thuận');
    expect(cleanStringField('N/A', 'Theo thỏa thuận')).toBe('Theo thỏa thuận');
    expect(cleanStringField(null, 'Theo thỏa thuận')).toBe('Theo thỏa thuận');
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



