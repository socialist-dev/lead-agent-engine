import { describe, it, expect } from 'vitest';
import { searchSerpDirect, resetSerpState } from '../src/providers/serp-direct';

describe('Direct SERP Provider', () => {
  it('should reset rate limit state cleanly', () => {
    expect(() => resetSerpState()).not.toThrow();
  });

  it('should return array of raw scraped posts without crashing', async () => {
    // Test with a safe sample query
    const results = await searchSerpDirect('bảo hiểm xã hội đà nẵng', 'qdr:w', 1);
    expect(Array.isArray(results)).toBe(true);
  }, 15000);
});
