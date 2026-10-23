import type { Departure } from '@/utils/dateUtils';

export type RideMode = 'bus' | 'buggy';

/**
 * A departure that still knows which schedule it came from and where it sat in
 * that schedule's own list.
 *
 * The index is carried rather than recomputed: once two directions' lists are
 * interleaved there is no way back to a position, and position is the only safe
 * identity for a doubled bus (see `multipleBusPositions` — "8:30" occurs twice
 * in a weekday and only the morning one is doubled).
 */
export interface Ride extends Departure {
  mode: RideMode;
  index: number;
}

export function toRides(departures: Departure[], mode: RideMode): Ride[] {
  return departures.map((departure, index) => ({ ...departure, mode, index }));
}

/**
 * Interleaves buses and buggies by the instants they already resolve to.
 *
 * Both lists must come from `resolveDepartures`, which is what turns a bare
 * label into a real moment — ordering by the label instead would scatter the
 * post-midnight trips back into the morning. Buses sort first on a tie so a
 * shared time reads bus-then-buggy consistently.
 */
export function mergeRides(bus: Ride[], buggy: Ride[]): Ride[] {
  return [...bus, ...buggy].sort((a, b) => {
    const byInstant = a.at.getTime() - b.at.getTime();
    if (byInstant !== 0) return byInstant;
    if (a.mode === b.mode) return a.index - b.index;
    return a.mode === 'bus' ? -1 : 1;
  });
}
