import { calendarDateKey } from './calendarDate';

/** The shape `/api/academic-days` and the bundled calendar both use. */
export interface Holiday {
  date: string;
  occasion: string;
}

export interface HolidayEntry extends Holiday {
  /** The holiday as a local wall date, for weekday names and day arithmetic. */
  at: Date;
  year: number;
  /** Already gone, relative to the campus date. A holiday today is not past. */
  past: boolean;
  /** Whole calendar days away; 0 is today, negative is in the past. */
  daysAway: number;
  /** Falls on a Saturday or Sunday, so no teaching day is actually gained. */
  onWeekend: boolean;
  /** Marked `*` in the institute list: the date depends on the moon sighting. */
  tentative: boolean;
}

export interface HolidayWindow {
  /** The most recent past holidays, then every one still to come, in date order. */
  rows: HolidayEntry[];
  /** The soonest holiday still to come (today counts), or null when none are listed. */
  next: HolidayEntry | null;
  /** Where `next` sits in `rows`; -1 without one. */
  nextIndex: number;
}

/** How many past holidays stay in the list for context. */
export const RECENT_PAST_HOLIDAYS = 2;

/**
 * Parses a holiday key as a *local* date.
 *
 * `new Date('2026-01-26')` is UTC midnight, which in IST is still the 26th but
 * in a negative offset is the 25th — the same trap `calendarDateKey` exists to
 * avoid on the way out.
 */
function parseHolidayDate(key: string): Date {
  const [year, month, day] = key.split('-').map(Number);
  return new Date(year, (month ?? 1) - 1, day ?? 1);
}

function daysBetween(from: Date, to: Date): number {
  const a = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const b = new Date(to.getFullYear(), to.getMonth(), to.getDate());
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

/**
 * The holiday list to show: the last `pastCount` holidays, then every
 * upcoming one that is listed (across years), with the next one marked.
 *
 * `today` is the campus date (an Asia/Kolkata wall-clock Date, as
 * `getCurrentTimeInKolkata()` returns). Dates are compared as `YYYY-MM-DD`
 * keys, which sort lexicographically and cannot drift across a timezone the
 * way two `Date` objects can. Two holidays on one date are both kept; only an
 * exact repeat (same date and name) is dropped.
 */
export function holidayWindow(holidays: Holiday[], today: Date, pastCount = RECENT_PAST_HOLIDAYS): HolidayWindow {
  const todayKey = calendarDateKey(today);
  const seen = new Set<string>();

  const entries: HolidayEntry[] = holidays
    .filter((holiday) => {
      const key = `${holiday.date}|${holiday.occasion}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((holiday) => {
      const at = parseHolidayDate(holiday.date);
      const day = at.getDay();
      return {
        ...holiday,
        at,
        year: at.getFullYear(),
        past: holiday.date < todayKey,
        daysAway: daysBetween(today, at),
        onWeekend: day === 0 || day === 6,
        tentative: holiday.occasion.includes('*'),
      };
    });

  const past = entries.filter((entry) => entry.past);
  const upcoming = entries.filter((entry) => !entry.past);
  const recent = pastCount > 0 ? past.slice(-pastCount) : [];

  return {
    rows: [...recent, ...upcoming],
    next: upcoming[0] ?? null,
    nextIndex: upcoming.length ? recent.length : -1,
  };
}

/** "Today", "Tomorrow", or "in 12 days" — for an upcoming holiday. */
export function formatDaysAway(daysAway: number): string {
  if (daysAway === 0) return 'Today';
  if (daysAway === 1) return 'Tomorrow';
  return `in ${daysAway} days`;
}
