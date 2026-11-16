import { describe, expect, it } from 'vitest';
import { LEGACY_REDIRECTS, NAV_ITEMS, PAGE_SECTIONS } from './routes';

const pagePaths = NAV_ITEMS.map((item) => item.path);

describe('student navigation', () => {
  it('fits the phone bar: at most five tabs, Home first', () => {
    expect(NAV_ITEMS.length).toBeLessThanOrEqual(5);
    expect(NAV_ITEMS[0]).toMatchObject({ path: '/', label: 'Home' });
    expect(new Set(pagePaths).size).toBe(pagePaths.length);
  });

  it('keeps the pages people already use, and the new Academics page', () => {
    expect(pagePaths).toEqual(['/', '/timetable', '/academics', '/campus', '/leave']);
  });
});

describe('legacy redirects', () => {
  const target = (from: string) => LEGACY_REDIRECTS.find((redirect) => redirect.from === from)?.to;

  it('sends the old Gym tab to the Gym section of Campus', () => {
    expect(target('/gym')).toBe('/campus#gym');
  });

  it('sends /holidays to the holiday list on Leave, and /library to Academics', () => {
    expect(target('/holidays')).toBe('/leave#holidays');
    expect(target('/library')).toBe('/academics#library');
  });

  it('keeps the older shortcuts pointing at Home', () => {
    for (const from of ['/food', '/buggy', '/buggy-timings', '/bus-timings']) expect(target(from)).toBe('/');
  });

  it('only ever lands on a real page and, with an anchor, on a section that page has', () => {
    for (const { from, to } of LEGACY_REDIRECTS) {
      const [path, anchor] = to.split('#');
      expect(pagePaths, `${from} -> ${to}`).toContain(path);
      if (anchor) expect(PAGE_SECTIONS[path], `${from} -> ${to}`).toContain(anchor);
    }
  });

  it('never redirects a path that is still a page, or redirects one path twice', () => {
    const froms = LEGACY_REDIRECTS.map((redirect) => redirect.from);
    expect(froms.filter((from) => pagePaths.includes(from))).toEqual([]);
    expect(new Set(froms).size).toBe(froms.length);
  });
});
