import { calendarDateKey } from './calendarDate';

/** The shape `/api/academic-days` and the bundled calendar both use. */
export interface Holiday {
  date: string;
  occasion: string;
}

export interface SemesterWindow {
  /** How the institute names the term, e.g. "Aug–Dec 2026". */
  label: string;
  /** Inclusive bounds as `YYYY-MM-DD` keys. */
  startKey: string;
  endKey: string;
}

export interface HolidayEntry extends Holiday {
  /** The holiday as a local wall date, for weekday names and day arithmetic. */
  at: Date;
  /** Already gone, relative to the day being viewed. */
  past: boolean;
  /** Whole calendar days away; 0 is today, negative is in the past. */
  daysAway: number;
  /** Falls on a Saturday or Sunday, so no teaching day is actually gained. */
  onWeekend: boolean;
}

export interface GroupedHolidays {
  semester: SemesterWindow;
  /** Every holiday inside the current term, in date order, past ones included. */
  thisSemester: HolidayEntry[];
  /** The soonest holiday still to come, wherever it falls. */
  next: HolidayEntry | null;
  /** Holidays after the term ends — the "next holidays" students plan around. */
  afterSemester: HolidayEntry[];
}

/**
 * The term `date` falls in.
 *
 * July is counted into the Aug–Dec term and June into Jan–May so the window
 * never goes empty during a break: a student checking in July should see the
 * term that is about to start, not the one that finished.
 */
export function getSemesterWindow(date: Date): SemesterWindow {
  const year = date.getFullYear();

  return date.getMonth() >= 6
    ? { label: `Aug–Dec ${year}`, startKey: `${year}-07-01`, endKey: `${year}-12-31` }
    : { label: `Jan–May ${year}`, startKey: `${year}-01-01`, endKey: `${year}-06-30` };
}

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
 * Splits the holiday list into the current term and what follows it.
 *
 * Dates are compared as `YYYY-MM-DD` keys, which sort lexicographically and
 * cannot drift across a timezone the way two `Date` objects can.
 */
export function groupHolidays(
  holidays: Holiday[],
  today: Date,
  afterSemesterLimit = 4,
): GroupedHolidays {
  const semester = getSemesterWindow(today);
  const todayKey = calendarDateKey(today);

  const byDate = new Map<string, Holiday>();
  for (const holiday of holidays) {
    // An admin edit and the bundled copy can both describe one date; the first
    // entry wins so the API's name is what shows.
    if (!byDate.has(holiday.date)) byDate.set(holiday.date, holiday);
  }

  const entries: HolidayEntry[] = [...byDate.values()]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((holiday) => {
      const at = parseHolidayDate(holiday.date);
      const day = at.getDay();

      return {
        ...holiday,
        at,
        past: holiday.date < todayKey,
        daysAway: daysBetween(today, at),
        onWeekend: day === 0 || day === 6,
      };
    });

  return {
    semester,
    thisSemester: entries.filter(
      (entry) => entry.date >= semester.startKey && entry.date <= semester.endKey,
    ),
    next: entries.find((entry) => !entry.past) ?? null,
    afterSemester: entries
      .filter((entry) => entry.date > semester.endKey)
      .slice(0, afterSemesterLimit),
  };
}

/** "Today", "Tomorrow", or "in 12 days" — for an upcoming holiday. */
export function formatDaysAway(daysAway: number): string {
  if (daysAway === 0) return 'Today';
  if (daysAway === 1) return 'Tomorrow';
  return `in ${daysAway} days`;
}
