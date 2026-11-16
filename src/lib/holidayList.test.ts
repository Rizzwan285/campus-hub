import { describe, expect, it } from 'vitest';
import { formatDaysAway, holidayWindow, type Holiday } from './holidayList';
import { getDateInKolkata } from '@/utils/dateUtils';
import bundledHolidays from '@/data/timetable/holidays.json';

const calendar: Holiday[] = bundledHolidays.map(({ date, name }) => ({ date, occasion: name }));
const dates = (rows: Array<{ date: string }>) => rows.map((row) => row.date);

describe('holidayWindow', () => {
  const today = new Date(2026, 10, 17); // 17 Nov 2026, the day this list was built

  it('keeps the two most recent past holidays, then every upcoming one through 2027', () => {
    const { rows, next, nextIndex } = holidayWindow(calendar, today);

    expect(dates(rows.slice(0, 5))).toEqual(['2026-10-20', '2026-11-08', '2026-11-24', '2026-12-25', '2027-01-15']);
    expect(rows.at(-1)?.date).toBe('2027-12-25');
    expect(rows).toHaveLength(2 + 2 + 16); // 2 past, rest of 2026, all of 2027
    expect(rows.filter((row) => row.past)).toHaveLength(2);
    expect(next?.occasion).toBe("Guru Nanak's Birthday");
    expect(nextIndex).toBe(2);
    expect(rows[nextIndex]).toBe(next);
  });

  it('drops older past holidays', () => {
    const { rows } = holidayWindow(calendar, today);
    expect(rows.some((row) => row.date < '2026-10-20')).toBe(false);
  });

  it('counts a holiday today as the upcoming one', () => {
    const { next, rows, nextIndex } = holidayWindow(calendar, new Date(2026, 10, 24, 23, 59));
    expect(next).toMatchObject({ date: '2026-11-24', daysAway: 0, past: false });
    expect(formatDaysAway(next!.daysAway)).toBe('Today');
    expect(dates(rows.slice(0, nextIndex))).toEqual(['2026-10-20', '2026-11-08']);
  });

  it('uses the campus date: 00:15 IST on 24 Nov is already the holiday, though UTC is still the 23rd', () => {
    const campus = getDateInKolkata(new Date('2026-11-23T18:45:00Z'));
    expect(holidayWindow(calendar, campus).next?.date).toBe('2026-11-24');
    const evening = getDateInKolkata(new Date('2026-11-24T18:45:00Z')); // 00:15 IST on the 25th
    expect(holidayWindow(calendar, evening).next?.date).toBe('2026-12-25');
  });

  it('crosses into the next year with each row carrying its year', () => {
    const { rows } = holidayWindow(calendar, new Date(2026, 11, 20));
    expect(rows.map((row) => row.year).slice(0, 4)).toEqual([2026, 2026, 2026, 2027]);
  });

  it('works with fewer than two past holidays', () => {
    const { rows, nextIndex } = holidayWindow(calendar.filter((h) => h.date >= '2027-01-01'), new Date(2027, 0, 20));
    expect(dates(rows.slice(0, 2))).toEqual(['2027-01-15', '2027-01-26']);
    expect(nextIndex).toBe(1);
  });

  it('has no next holiday once the list runs out, and keeps only the recent past', () => {
    const { rows, next, nextIndex } = holidayWindow(calendar, new Date(2028, 0, 3));
    expect(next).toBeNull();
    expect(nextIndex).toBe(-1);
    expect(dates(rows)).toEqual(['2027-11-14', '2027-12-25']);
  });

  it('copes with an empty calendar', () => {
    expect(holidayWindow([], today)).toEqual({ rows: [], next: null, nextIndex: -1 });
  });

  it('keeps two holidays on one date, and drops only an exact repeat', () => {
    const shared = [
      { date: '2027-08-15', occasion: 'Independence Day' },
      { date: '2027-08-15', occasion: "Prophet Mohammad's Birthday (Id-E-Milad)*" },
      { date: '2027-08-15', occasion: 'Independence Day' },
    ];
    const { rows } = holidayWindow(shared, new Date(2027, 7, 1));
    expect(rows.map((row) => row.occasion)).toEqual(['Independence Day', "Prophet Mohammad's Birthday (Id-E-Milad)*"]);
  });

  it('derives the weekday from the date, never from a printed label', () => {
    // The 2027 PDF prints Buddha Purnima (20 May 2027) as a Tuesday; it is a Thursday.
    const buddha = holidayWindow(calendar, new Date(2027, 4, 1)).rows.find((row) => row.occasion === 'Buddha Purnima')!;
    expect(buddha.at.toLocaleDateString('en-IN', { weekday: 'long' })).toBe('Thursday');
    expect(buddha.onWeekend).toBe(false);
  });

  it('marks moon-sighting holidays and weekends', () => {
    const { rows } = holidayWindow(calendar, new Date(2027, 0, 1));
    const augustFifteenth = rows.find((row) => row.date === '2027-08-15')!;
    expect(augustFifteenth.tentative).toBe(true);
    expect(augustFifteenth.onWeekend).toBe(true); // a Sunday
    expect(rows.find((row) => row.date === '2027-01-15')?.tentative).toBe(false);
  });

  it('reads a holiday key as a local wall date, not a UTC instant', () => {
    const [entry] = holidayWindow([{ date: '2026-01-26', occasion: 'Republic Day' }], new Date(2026, 0, 1)).rows;
    expect(entry.at.getDate()).toBe(26);
    expect(entry.at.getMonth()).toBe(0);
    expect(entry.daysAway).toBe(25);
  });
});

describe('formatDaysAway', () => {
  it('reads naturally for the near dates', () => {
    expect(formatDaysAway(0)).toBe('Today');
    expect(formatDaysAway(1)).toBe('Tomorrow');
    expect(formatDaysAway(16)).toBe('in 16 days');
  });
});
