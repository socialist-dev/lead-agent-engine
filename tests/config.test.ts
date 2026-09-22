import { describe, it, expect } from 'vitest';
import { getTimeFilterRule } from '../src/config';

describe('Config pricing rules', () => {
  it('returns 24h filter rule for PRO SKU', () => {
    const rule = getTimeFilterRule('SKU-BDS-PRO');
    expect(rule.isHighTier).toBe(true);
    expect(rule.ruleText).toContain('24 GIỜ QUA');
  });

  it('returns 24h filter rule for TRI (Trial) SKU', () => {
    const rule = getTimeFilterRule('SKU-FINANCE-TRI');
    expect(rule.isHighTier).toBe(true);
    expect(rule.ruleText).toContain('24 GIỜ QUA');
  });

  it('returns 7-day filter rule for STD SKU', () => {
    const rule = getTimeFilterRule('SKU-AUTO-STD');
    expect(rule.isHighTier).toBe(false);
    expect(rule.ruleText).toContain('7 ngày qua');
  });
});
