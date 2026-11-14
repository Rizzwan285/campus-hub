import { calendarDateKey } from './calendarDate';
import type { SpecialService } from '@/data/specialServiceData';

export type ServiceStatus = 'upcoming' | 'running' | 'ended';

/**
 * Whether a service has buses on `date`.
 *
 * Compares wall-date keys rather than instants: YYYY-MM-DD strings order
 * correctly as text, and going through UTC can move an IST morning onto the
 * previous day (the same trap `getDayType` avoids).
 */
export function runsOn(service: SpecialService, date: Date): boolean {
  const key = calendarDateKey(date);
  if (key < service.startDate || key > service.endDate) return false;
  if (service.skipSundays && date.getDay() === 0) return false;
  return !service.skipDates.includes(key);
}

export function servicesRunningOn(services: SpecialService[], date: Date): SpecialService[] {
  return services.filter((service) => runsOn(service, date));
}

/** Where `date` falls relative to the whole window, ignoring skipped days. */
export function serviceStatus(service: SpecialService, date: Date): ServiceStatus {
  const key = calendarDateKey(date);
  if (key < service.startDate) return 'upcoming';
  if (key > service.endDate) return 'ended';
  return 'running';
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function parts(dateKey: string): { day: number; month: string } {
  const [, month, day] = dateKey.split('-').map(Number);
  return { day, month: MONTHS[month - 1] ?? '' };
}

/** "24 Nov" from "2026-11-24", without building a Date that could shift. */
export function formatDateKey(dateKey: string): string {
  const { day, month } = parts(dateKey);
  return `${day} ${month}`;
}

/** "16–28 Nov", "28 Nov – 3 Dec", or "16 Nov" for a single day. */
export function formatServiceWindow(service: SpecialService): string {
  const start = parts(service.startDate);
  const end = parts(service.endDate);

  if (service.startDate === service.endDate) return `${start.day} ${start.month}`;
  if (start.month === end.month) return `${start.day}–${end.day} ${end.month}`;
  return `${start.day} ${start.month} – ${end.day} ${end.month}`;
}

/** The days inside the window with no service, e.g. "Sundays and 24 Nov". */
export function formatServiceExceptions(service: SpecialService): string | null {
  const skipped = service.skipDates
    .filter((key) => key >= service.startDate && key <= service.endDate)
    .sort()
    .map(formatDateKey);
  const items = [...(service.skipSundays ? ['Sundays'] : []), ...skipped];

  if (items.length === 0) return null;
  if (items.length === 1) return items[0];
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}
