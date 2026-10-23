import { describe, expect, it } from 'vitest';
import { getLibraryStatus, libraries, LIBRARY_TIMINGS_LABEL } from './libraryData';
import { formatTimeUntil } from '@/utils/dateUtils';

describe('library timings', () => {
  it('covers both campuses', () => {
    expect(libraries.map((library) => library.name)).toEqual([
      'Nila Library',
      'Sahyadri Library',
    ]);
    expect(LIBRARY_TIMINGS_LABEL).toBe('9:00 AM – 12:00 AM (midnight)');
  });

  it('is closed before 9 AM and says when it opens', () => {
    const now = new Date(2026, 9, 23, 7, 30);
    const { open, changesAt } = getLibraryStatus(now);

    expect(open).toBe(false);
    expect(changesAt.getHours()).toBe(9);
    expect(changesAt.getDate()).toBe(23);
    expect(formatTimeUntil(changesAt, now)).toBe('1h 30m');
  });

  it('is open at 9 AM sharp and all the way to midnight', () => {
    expect(getLibraryStatus(new Date(2026, 9, 23, 9, 0)).open).toBe(true);
    expect(getLibraryStatus(new Date(2026, 9, 23, 23, 59)).open).toBe(true);
  });

  it('closes at the next day midnight, so the countdown never goes backwards', () => {
    const now = new Date(2026, 9, 23, 23, 50);
    const { open, changesAt } = getLibraryStatus(now);

    expect(open).toBe(true);
    expect(changesAt.getDate()).toBe(24);
    expect(changesAt.getHours()).toBe(0);
    expect(formatTimeUntil(changesAt, now)).toBe('10m');
  });

  it('treats midnight itself as closed until 9 AM', () => {
    const { open, changesAt } = getLibraryStatus(new Date(2026, 9, 23, 0, 0));

    expect(open).toBe(false);
    expect(changesAt.getHours()).toBe(9);
    expect(changesAt.getDate()).toBe(23);
  });
});
