import { describe, it, expect } from 'vitest';
import { generateMicroTargetedPostDorks } from '../src/providers/gemini';
import { getAfterDate } from '../src/utils';

describe('2-Tier Dorking Engine', () => {
  it('generates micro targeted post dorks with group IDs and after date', () => {
    const niche = 'Bất động sản | Nhu cầu mua | Đà Nẵng';
    const groupHandles = ['136253933684351', 'batdongsandanang'];
    const daysBack = 7;
    const afterDate = getAfterDate(daysBack);

    const dorks = generateMicroTargetedPostDorks(niche, groupHandles, daysBack);

    expect(dorks.length).toBeGreaterThan(0);
    const hasGroupDork = dorks.some(d => d.includes('facebook.com/groups/136253933684351') || d.includes('facebook.com/groups/batdongsandanang'));
    expect(hasGroupDork).toBe(true);

    const hasAfterDate = dorks.every(d => d.includes(`after:${afterDate}`));
    expect(hasAfterDate).toBe(true);
  });
});
