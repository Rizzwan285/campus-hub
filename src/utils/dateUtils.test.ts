import { describe, it, expect } from 'vitest';
import { getWeekCycle, resolveDepartures, getNextDeparture, formatTimeUntil } from './dateUtils';

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

describe('resolveDepartures', () => {
  // A Sunday, whose schedule contains a midday 12:00 as well as a 12:00 at the
  // very end of the day. Both print identically.
  const sunday = ['8:45', '9:15', '10:00', '11:00', '12:00', '12:30', '1:15', '11:00', '12:00'];
  const at = (h: number, m = 0) => {
    const d = new Date('2026-08-23T00:00:00');
    d.setHours(h, m, 0, 0);
    return d;
  };

  it('reads a midday 12:00 as noon, not midnight', () => {
    const noon = resolveDepartures(sunday, at(11, 54))[4];
    expect(noon.time).toBe('12:00');
    expect(noon.at.getHours()).toBe(12);
    expect(noon.at.getDate()).toBe(23);
  });

  it('reads the closing 12:00 as the next day’s midnight', () => {
    const midnight = resolveDepartures(sunday, at(11, 54)).at(-1)!;
    expect(midnight.at.getHours()).toBe(0);
    expect(midnight.at.getDate()).toBe(24);
  });

  it('tells the morning and evening 11:00 apart by position', () => {
    const resolved = resolveDepartures(sunday, at(6));
    expect(resolved[3].at.getHours()).toBe(11);
    expect(resolved[7].at.getHours()).toBe(23);
  });

  it('resolves every departure to a strictly increasing instant', () => {
    const resolved = resolveDepartures(sunday, at(6));
    for (let i = 1; i < resolved.length; i += 1) {
      expect(resolved[i].at.getTime()).toBeGreaterThan(resolved[i - 1].at.getTime());
    }
  });

  it('honours an explicit am/pm marker when one is present', () => {
    const [am, pm] = resolveDepartures(['7:45 AM', '7:45 PM'], at(6));
    expect(am.at.getHours()).toBe(7);
    expect(pm.at.getHours()).toBe(19);
  });
});

describe('getNextDeparture and formatTimeUntil', () => {
  const sunday = ['8:45', '9:15', '10:00', '11:00', '12:00', '12:30', '1:15', '11:00', '12:00'];
  const at = (h: number, m = 0) => {
    const d = new Date('2026-08-23T00:00:00');
    d.setHours(h, m, 0, 0);
    return d;
  };

  it('counts minutes, not half a day, to the noon bus at 11:54', () => {
    const now = at(11, 54);
    const next = getNextDeparture(sunday, now)!;
    expect(next.time).toBe('12:00');
    // Previously read "12h 5m": the label was re-parsed as midnight.
    expect(formatTimeUntil(next.at, now)).toBe('6m');
  });

  it('measures the closing midnight bus as hours away', () => {
    const now = at(23, 30);
    const next = getNextDeparture(sunday, now)!;
    expect(next.time).toBe('12:00');
    expect(formatTimeUntil(next.at, now)).toBe('30m');
  });

  it('formats a gap over an hour as hours and minutes', () => {
    const now = at(6);
    expect(formatTimeUntil(at(8, 30), now)).toBe('2h 30m');
  });

  it('returns null once the last bus has gone', () => {
    expect(getNextDeparture(['8:45', '9:15'], at(23))).toBeNull();
  });

  it('reports a departure already past', () => {
    expect(formatTimeUntil(at(7), at(8))).toBe('Passed');
  });
});
