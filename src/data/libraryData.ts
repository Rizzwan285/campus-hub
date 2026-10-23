export interface Library {
  name: string;
  /** Which half of the campus it serves. */
  campus: string;
  description: string;
}

export const libraries: Library[] = [
  {
    name: 'Nila Library',
    campus: 'Nila Campus',
    description: 'Hostel-side library, next to the first-year blocks',
  },
  {
    name: 'Sahyadri Library',
    campus: 'Sahyadri Campus',
    description: 'Main academic campus library',
  },
];

/** Both libraries keep the same hours, every day of the week. */
export const LIBRARY_OPEN_HOUR = 9;
export const LIBRARY_TIMINGS_LABEL = '9:00 AM – 12:00 AM (midnight)';
export const LIBRARY_DAYS_LABEL = 'Every day, including weekends and holidays';

export interface LibraryStatus {
  open: boolean;
  /** When the state next flips, as an instant, so a countdown cannot re-guess it. */
  changesAt: Date;
}

/**
 * Open from 9:00 AM until midnight, so the only closed stretch is the small
 * hours of the same calendar day.
 *
 * Midnight is returned as the *next* day's 00:00 — the same rule the transport
 * schedules follow for their post-midnight trips, and what keeps a countdown at
 * 11:50 PM reading ten minutes rather than minus twenty-three hours.
 */
export function getLibraryStatus(now: Date): LibraryStatus {
  const changesAt = new Date(now);

  if (now.getHours() < LIBRARY_OPEN_HOUR) {
    changesAt.setHours(LIBRARY_OPEN_HOUR, 0, 0, 0);
    return { open: false, changesAt };
  }

  changesAt.setHours(24, 0, 0, 0);
  return { open: true, changesAt };
}
