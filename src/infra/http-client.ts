import { sleep } from '../utils';
import { logger } from './logger';

export interface HttpRequestOptions extends RequestInit {
  timeoutMs?: number;
  retries?: number;
  retryDelayMs?: number;
}

export async function httpFetch(url: string, options: HttpRequestOptions = {}): Promise<Response> {
  const {
    timeoutMs = 15000,
    retries = 3,
    retryDelayMs = 2000,
    ...fetchOptions
  } = options;

  let lastError: any = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        ...fetchOptions,
        signal: AbortSignal.timeout(timeoutMs)
      });
      if (res.ok) {
        return res;
      }
      // If 429 or 5xx server error, retry
      if (res.status === 429 || res.status >= 500) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }
      // Non-retryable HTTP error (400, 401, 404, etc.)
      return res;
    } catch (err: any) {
      lastError = err;
      if (attempt < retries) {
        const delay = retryDelayMs * Math.pow(2, attempt) + Math.floor(Math.random() * 500);
        logger.warn(`Fetch error (${url.slice(0, 60)}...): ${err.message}. Retrying in ${delay}ms (Attempt ${attempt + 1}/${retries})...`);
        await sleep(delay);
      }
    }
  }

  throw lastError || new Error(`Fetch failed after ${retries} retries`);
}
