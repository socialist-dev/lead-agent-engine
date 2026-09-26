import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { isUrlSeen, markUrlsSeen, saveUrlCache } from '../src/infra/url-cache';

const CACHE_DIR = path.resolve(process.cwd(), '.cache');
const CACHE_FILE = path.join(CACHE_DIR, 'processed_urls.json');

describe('UrlCache Module', () => {
  const testUrl1 = 'https://facebook.com/groups/123/posts/456?utm_source=fb';
  const testUrl2 = 'https://voz.vn/t/can-mua-laptop-cu.789';

  afterEach(() => {
    if (fs.existsSync(CACHE_FILE)) {
      fs.unlinkSync(CACHE_FILE);
    }
  });

  it('should accurately detect unseen and seen URLs', () => {
    expect(isUrlSeen(testUrl1)).toBe(false);

    markUrlsSeen([testUrl1]);
    expect(isUrlSeen(testUrl1)).toBe(true);
    expect(isUrlSeen('https://facebook.com/groups/123/posts/456')).toBe(true); // check normalized equivalence

    expect(isUrlSeen(testUrl2)).toBe(false);
  });

  it('should persist cache to disk and load it back', () => {
    markUrlsSeen([testUrl1, testUrl2]);
    saveUrlCache();

    expect(fs.existsSync(CACHE_FILE)).toBe(true);

    const content = fs.readFileSync(CACHE_FILE, 'utf-8');
    expect(content).toContain('https://facebook.com/groups/123/posts/456');
  });
});
