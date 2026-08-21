/**
 * Resolves a display time ("7:45", "12:00") to minutes past midnight.
 *
 * Bus times carry no AM/PM marker, so the schedule is read in order and a
 * flag tracks whether we have crossed into the afternoon — the same rule
 * src/utils/dateUtils.ts uses on the client. Kept in sync deliberately: the
 * client still renders the raw strings, this only backfills a sortable value.
 *
 * Order is therefore part of the data. Reordering a list changes what the
 * times mean, which is why the admin editor rewrites a whole direction at once
 * rather than patching individual rows.
 */
export function resolveDepartMinutes(times: string[]): (number | null)[] {
  let isAfternoonOrLater = false;
  let prevHour = 0;

  return times.map((raw) => {
    const clean = raw.trim().toLowerCase();
    const match = clean.match(/(\d+):?(\d+)?/);
    if (!match) return null;

    let hours = parseInt(match[1], 10);
    const minutes = match[2] ? parseInt(match[2], 10) : 0;

    if (clean.includes('am')) {
      if (hours === 12) hours = 0;
    } else if (clean.includes('pm')) {
      if (hours !== 12) hours += 12;
      isAfternoonOrLater = true;
    } else if (hours >= 1 && hours <= 6) {
      hours += 12;
      isAfternoonOrLater = true;
    } else if (hours >= 7 && hours <= 11) {
      if (isAfternoonOrLater) hours += 12;
    } else if (hours === 12) {
      if (isAfternoonOrLater && prevHour >= 17 && minutes === 0) {
        hours = 24; // midnight, end of the schedule
      } else {
        isAfternoonOrLater = true;
      }
    }

    prevHour = hours;
    return hours * 60 + minutes;
  });
}
