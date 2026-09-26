import * as fs from 'fs';
import * as path from 'path';
import { logger } from './logger';
import { normalizeUrl } from './url-normalizer';

const CACHE_DIR = path.resolve(process.cwd(), '.cache');
const CACHE_FILE = path.join(CACHE_DIR, 'processed_urls.json');

// Smart Soft-Cache TTLs:
// - APPROVED leads: 30 ngày (30 * 24 * 60 * 60 * 1000 ms)
// - REJECTED posts: 3 ngày (3 * 24 * 60 * 60 * 1000 ms)
const APPROVED_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const REJECTED_TTL_MS = 3 * 24 * 60 * 60 * 1000;

export type CacheStatus = 'APPROVED' | 'REJECTED';

export interface CacheItem {
  timestamp: number;
  status: CacheStatus;
}

interface CacheData {
  [url: string]: CacheItem | number; // Backward compatibility with legacy number timestamps
}

let cacheMap: Map<string, CacheItem> | null = null;

function ensureLoaded(): Map<string, CacheItem> {
  if (cacheMap !== null) {
    return cacheMap;
  }

  cacheMap = new Map<string, CacheItem>();

  try {
    if (fs.existsSync(CACHE_FILE)) {
      const raw = fs.readFileSync(CACHE_FILE, 'utf-8');
      const data: CacheData = JSON.parse(raw);
      const now = Date.now();
      let expiredCount = 0;

      for (const [url, entry] of Object.entries(data)) {
        let timestamp: number;
        let status: CacheStatus = 'APPROVED';

        if (typeof entry === 'number') {
          timestamp = entry;
        } else {
          timestamp = entry.timestamp;
          status = entry.status || 'APPROVED';
        }

        const ttl = status === 'APPROVED' ? APPROVED_TTL_MS : REJECTED_TTL_MS;

        if (now - timestamp <= ttl) {
          cacheMap.set(url, { timestamp, status });
        } else {
          expiredCount++;
        }
      }

      logger.info(`📦 [Smart Soft-Cache] Loaded ${cacheMap.size} cached URLs (${expiredCount} expired URLs pruned).`);
    } else {
      logger.info(`📦 [Smart Soft-Cache] No cache file found at ${CACHE_FILE}. Starting clean cache.`);
    }
  } catch (err: any) {
    logger.warn(`⚠️ [Smart Soft-Cache] Error reading cache file: ${err.message}. Initializing empty cache.`);
  }

  return cacheMap;
}

export function isUrlSeen(rawUrl: string): boolean {
  const map = ensureLoaded();
  const normUrl = normalizeUrl(rawUrl);
  const entry = map.get(normUrl);
  if (!entry) return false;

  const now = Date.now();
  const ttl = entry.status === 'APPROVED' ? APPROVED_TTL_MS : REJECTED_TTL_MS;

  if (now - entry.timestamp > ttl) {
    map.delete(normUrl);
    return false;
  }

  return true;
}

export function markUrlsSeen(urls: string[], status: CacheStatus = 'REJECTED'): void {
  const map = ensureLoaded();
  const now = Date.now();

  for (const rawUrl of urls) {
    const normUrl = normalizeUrl(rawUrl);
    map.set(normUrl, { timestamp: now, status });
  }
}

export function saveUrlCache(): void {
  if (cacheMap === null) return;

  try {
    if (!fs.existsSync(CACHE_DIR)) {
      fs.mkdirSync(CACHE_DIR, { recursive: true });
    }

    const obj: { [url: string]: CacheItem } = {};
    const now = Date.now();

    for (const [url, entry] of cacheMap.entries()) {
      const ttl = entry.status === 'APPROVED' ? APPROVED_TTL_MS : REJECTED_TTL_MS;
      if (now - entry.timestamp <= ttl) {
        obj[url] = entry;
      }
    }

    fs.writeFileSync(CACHE_FILE, JSON.stringify(obj, null, 2), 'utf-8');
    logger.info(`💾 [Smart Soft-Cache] Saved ${Object.keys(obj).length} URLs to persistent cache file (${CACHE_FILE}).`);
  } catch (err: any) {
    logger.error(`❌ [Smart Soft-Cache] Error saving cache file: ${err.message}`);
  }
}
