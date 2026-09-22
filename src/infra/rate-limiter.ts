import { sleep } from '../utils';

export class RateLimiter {
  private tokens: number;
  private maxTokens: number;
  private refillRatePerMs: number;
  private lastRefill: number;

  constructor(requestsPerMinute: number = 15) {
    this.maxTokens = requestsPerMinute;
    this.tokens = requestsPerMinute;
    this.refillRatePerMs = requestsPerMinute / (60 * 1000);
    this.lastRefill = Date.now();
  }

  private refill() {
    const now = Date.now();
    const elapsed = now - this.lastRefill;
    this.tokens = Math.min(this.maxTokens, this.tokens + elapsed * this.refillRatePerMs);
    this.lastRefill = now;
  }

  async acquire(): Promise<void> {
    this.refill();
    if (this.tokens >= 1) {
      this.tokens -= 1;
      return;
    }
    const needed = 1 - this.tokens;
    const waitTime = Math.ceil(needed / this.refillRatePerMs);
    await sleep(waitTime);
    return this.acquire();
  }
}

// Global instance for Gemini (15 RPM for free tier)
export const geminiRateLimiter = new RateLimiter(15);
