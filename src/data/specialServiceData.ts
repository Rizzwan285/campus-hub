/**
 * Temporary bus services that run for a fixed stretch of dates on top of the
 * regular timetable — exam shuttles, convocation runs and the like.
 *
 * Unlike the regular schedule, these times carry an explicit AM/PM, so their
 * order in the list means nothing and they can be merged into the day by the
 * instant they resolve to.
 */
export interface SpecialService {
  id: number | string;
  /** Shown on the bus card and as the "next" hero label, e.g. "Exam shuttle". */
  title: string;
  note?: string | null;
  /** First and last day the service runs, inclusive, as YYYY-MM-DD. */
  startDate: string;
  endDate: string;
  /** Exam shuttles do not run on Sundays even when one falls inside the window. */
  skipSundays: boolean;
  /** Individual dates inside the window with no service, e.g. a holiday. */
  skipDates: string[];
  /** Departures written with AM/PM, e.g. "9:05 AM". */
  nilaToSahyadri: string[];
  sahyadriToNila: string[];
}

/**
 * The offline copy, used until the API answers and whenever it cannot.
 *
 * Nothing here needs deleting by hand: a service stops showing the day after
 * its `endDate`. Once the API is reachable its list wins outright (including
 * an empty one), so the Bus tab in /admin is where a service is added, edited
 * or pulled early.
 */
export const bundledSpecialServices: SpecialService[] = [
  {
    // Examination Team circular for the Aug–Dec 2026 end-semester exams.
    id: 'endsem-aug-dec-2026',
    title: 'Exam shuttle',
    note: 'End-semester examinations, Aug–Dec 2026',
    startDate: '2026-11-16',
    endDate: '2026-11-28',
    skipSundays: true,
    // 24 November is Guru Nanak's Birthday; the circular excludes it by name.
    skipDates: ['2026-11-24'],
    nilaToSahyadri: ['9:05 AM', '9:10 AM', '12:50 PM'],
    sahyadriToNila: ['9:05 AM', '12:50 PM'],
  },
];
