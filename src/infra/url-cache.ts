import * as fs from 'fs';
import * as path from 'path';
import { logger } from './logger';
import { normalizeUrl } from './url-normalizer';

const CACHE_DIR = path.resolve(process.cwd(), '.cache');
const CACHE_FILE = path.join(CACHE_DIR, 'processed_urls.json');

// TTL: 14 ngày (14 * 24 * 60 * 60 * 1000 ms)
const MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;

interface CacheData {
  [url: string]: number; // timestamp
}

let cacheMap: Map<string, number> | null = null;

function ensureLoaded(): Map<string, number> {
  if (cacheMap !== null) {
    return cacheMap;
  }

  cacheMap = new Map<string, number>();

  try {
    if (fs.existsSync(CACHE_FILE)) {
      const raw = fs.readFileSync(CACHE_FILE, 'utf-8');
      const data: CacheData = JSON.parse(raw);
      const now = Date.now();
      let expiredCount = 0;

      for (const [url, timestamp] of Object.entries(data)) {
        if (now - timestamp <= MAX_AGE_MS) {
          cacheMap.set(url, timestamp);
        } else {
          expiredCount++;
        }
      }

      logger.info(`📦 [URL Cache] Loaded ${cacheMap.size} cached URLs (${expiredCount} expired URLs pruned).`);
    } else {
      logger.info(`📦 [URL Cache] No cache file found at ${CACHE_FILE}. Starting clean cache.`);
    }
  } catch (err: any) {
    logger.warn(`⚠️ [URL Cache] Error reading cache file: ${err.message}. Initializing empty cache.`);
  }

  return cacheMap;
}

export function isUrlSeen(rawUrl: string): boolean {
  const map = ensureLoaded();
  const normUrl = normalizeUrl(rawUrl);
  return map.has(normUrl);
}

export function markUrlsSeen(urls: string[]): void {
  const map = ensureLoaded();
  const now = Date.now();

  for (const rawUrl of urls) {
    const normUrl = normalizeUrl(rawUrl);
    map.set(normUrl, now);
  }
}

export function saveUrlCache(): void {
  if (cacheMap === null) return;

  try {
    if (!fs.existsSync(CACHE_DIR)) {
      fs.mkdirSync(CACHE_DIR, { recursive: true });
    }

    const obj: CacheData = {};
    const now = Date.now();

    for (const [url, timestamp] of cacheMap.entries()) {
      if (now - timestamp <= MAX_AGE_MS) {
        obj[url] = timestamp;
      }
    }

    fs.writeFileSync(CACHE_FILE, JSON.stringify(obj, null, 2), 'utf-8');
    logger.info(`💾 [URL Cache] Saved ${Object.keys(obj).length} URLs to persistent cache file (${CACHE_FILE}).`);
  } catch (err: any) {
    logger.error(`❌ [URL Cache] Error saving cache file: ${err.message}`);
  }
}
