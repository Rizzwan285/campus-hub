import { toZonedTime } from 'date-fns-tz';
import { holidays2025, specialDays2025 } from '@/data/busData';

export const TIMEZONE = 'Asia/Kolkata';

export interface AcademicDaysData {
  holidays: Array<{ date: string; occasion: string }>;
  specialDays: Array<{ date: string; type: string; note: string }>;
}

// getDayType must stay synchronous (it runs in render paths), so server data
// arrives via this module-level swap — see useAcademicDaysSync().
let activeHolidays: AcademicDaysData['holidays'] = holidays2025;
let activeSpecialDays: AcademicDaysData['specialDays'] = specialDays2025;

export function setAcademicDays(data: AcademicDaysData): void {
  if (data.holidays?.length) activeHolidays = data.holidays;
  if (data.specialDays) activeSpecialDays = data.specialDays;
}

export function getCurrentTimeInKolkata(): Date {
  return toZonedTime(new Date(), TIMEZONE);
}

export function getDateInKolkata(date?: Date): Date {
  const targetDate = date || new Date();
  return toZonedTime(targetDate, TIMEZONE);
}

export type DayType = 'weekday' | 'friday' | 'saturday' | 'sunday';

export function getDayType(date: Date): DayType {
  const dayOfWeek = date.getDay();
  const dateStr = date.toISOString().split('T')[0];

  // Check if it's a special instructional day (treat as weekday)
  const isInstructionalDay = activeSpecialDays.some(
    special => special.date === dateStr && special.type === 'instructional'
  );

  if (isInstructionalDay) {
    return 'weekday';
  }

  // Check if it's a holiday
  const isHoliday = activeHolidays.some(holiday => holiday.date === dateStr);
  
  if (dayOfWeek === 0) return 'sunday';
  if (dayOfWeek === 6 || isHoliday) return 'saturday';
  if (dayOfWeek === 5) return 'friday';
  return 'weekday';
}

/**
 * Which half of the mess's two-week rotation `date` falls in.
 *
 * The alternation is anchored to a fixed semester start, so it never drifts on
 * its own — but it also cannot tell when the mess restarts its own count after
 * a break. `flipped` (an admin toggle, stored per mess) inverts the result to
 * realign the two without moving the anchor.
 */
export function getWeekCycle(date: Date, flipped = false): 'week13' | 'week24' {
  // Calculate week number from start of semester (July 30, 2025)
  const semesterStart = new Date('2025-07-30');
  const diffTime = Math.abs(date.getTime() - semesterStart.getTime());
  const diffWeeks = Math.floor(diffTime / (1000 * 60 * 60 * 24 * 7));

  // Week 1 & 3 for even diffWeeks, Week 2 & 4 for odd diffWeeks
  const isOdd = diffWeeks % 2 === 0;
  return isOdd !== flipped ? 'week13' : 'week24';
}

export interface Departure {
  /** Exactly as the schedule prints it, e.g. "12:00". */
  time: string;
  /** The instant that label resolves to, once position is taken into account. */
  at: Date;
}

/**
 * Resolves a whole direction's departures to real instants.
 *
 * Bus times carry no am/pm, so a label alone is ambiguous — "12:00" is noon in
 * the middle of a Sunday list and midnight at the end of a weekday one, and
 * "8:30" occurs both morning and evening. The only thing that disambiguates
 * them is their position in the ordered list, so the list is walked once and a
 * flag latches when the schedule crosses into the afternoon.
 *
 * This is the client twin of `resolveDepartMinutes` in
 * `server/src/utils/busTime.ts`; keep the two rules in step.
 *
 * Resolve once and carry the `Date` around. Re-deriving am/pm from a lone
 * label later is what made an 11:54 am countdown to the noon bus read as
 * twelve hours.
 */
export function resolveDepartures(times: string[], referenceDate: Date): Departure[] {
  const baseDate = new Date(referenceDate);
  baseDate.setHours(0, 0, 0, 0);

  // Whether the schedule has already crossed midday.
  let isAfternoonOrLater = false;
  // Resolves the trailing 12:00 (midnight) apart from a midday one.
  let prevParsedHour = 0;

  return times.map((timeStr) => {
    const cleanTime = timeStr.trim().toLowerCase();
    const isAM = cleanTime.includes('am');
    const isPM = cleanTime.includes('pm');

    const timeMatch = cleanTime.match(/(\d+):?(\d+)?/);
    if (!timeMatch) {
      return { time: timeStr, at: new Date(baseDate) };
    }

    let hours = parseInt(timeMatch[1], 10);
    const minutes = timeMatch[2] ? parseInt(timeMatch[2], 10) : 0;
    const at = new Date(baseDate);

    if (isAM) {
      if (hours === 12) hours = 0;
    } else if (isPM) {
      if (hours !== 12) hours += 12;
      isAfternoonOrLater = true;
    } else if (hours >= 1 && hours <= 6) {
      // 1–6 only ever appear in the afternoon half of a schedule.
      hours += 12;
      isAfternoonOrLater = true;
    } else if (hours >= 7 && hours <= 11) {
      // Morning until the list has been through midday, evening after.
      if (isAfternoonOrLater) hours += 12;
    } else if (hours === 12) {
      // Midnight only once the evening has been and gone; otherwise midday.
      if (isAfternoonOrLater && prevParsedHour >= 17 && minutes === 0) {
        hours = 0;
        at.setDate(at.getDate() + 1);
      } else {
        isAfternoonOrLater = true;
      }
    }

    at.setHours(hours, minutes, 0, 0);
    prevParsedHour = hours;
    return { time: timeStr, at };
  });
}

/** The departures still to come, in order, with their resolved instants. */
export function getUpcomingDepartures(times: string[], currentTime: Date): Departure[] {
  return resolveDepartures(times, currentTime).filter(({ at }) => at > currentTime);
}

export function getUpcomingBuses(times: string[], currentTime: Date): string[] {
  return getUpcomingDepartures(times, currentTime).map(({ time }) => time);
}

export function getNextDeparture(times: string[], currentTime: Date): Departure | null {
  return getUpcomingDepartures(times, currentTime)[0] ?? null;
}

export function getNextBus(times: string[], currentTime: Date): string | null {
  return getNextDeparture(times, currentTime)?.time ?? null;
}

/**
 * How long until an already-resolved departure. Takes the instant rather than
 * the label precisely so it cannot re-guess am/pm and disagree with the list
 * the reader is looking at.
 */
export function formatTimeUntil(at: Date, currentTime: Date): string {
  const diffMs = at.getTime() - currentTime.getTime();
  if (diffMs < 0) return 'Passed';

  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const remainingMins = diffMins % 60;

  return diffHours > 0 ? `${diffHours}h ${remainingMins}m` : `${diffMins}m`;
}

export function formatTime(date: Date): string {
  return date.toLocaleTimeString('en-IN', { 
    hour: '2-digit', 
    minute: '2-digit',
    hour12: true,
    timeZone: TIMEZONE 
  });
}

export function formatDate(date: Date): string {
  return date.toLocaleDateString('en-IN', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: TIMEZONE
  });
}
