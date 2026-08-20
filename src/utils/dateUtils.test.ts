import { describe, it, expect } from 'vitest';
import { getWeekCycle } from './dateUtils';

describe('getWeekCycle', () => {
  // 2026-08-20 is a Thursday the mess serves as an even-week day.
  const thursday = new Date('2026-08-20');
  const weekLater = new Date('2026-08-27');

  it('derives the cycle from the semester anchor', () => {
    expect(getWeekCycle(thursday)).toBe('week24');
  });

  it('alternates every seven days', () => {
    expect(getWeekCycle(weekLater)).toBe('week13');
  });

  it('inverts both cycles when flipped', () => {
    expect(getWeekCycle(thursday, true)).toBe('week13');
    expect(getWeekCycle(weekLater, true)).toBe('week24');
  });

  it('treats an explicit false the same as the default', () => {
    expect(getWeekCycle(thursday, false)).toBe(getWeekCycle(thursday));
  });
});
