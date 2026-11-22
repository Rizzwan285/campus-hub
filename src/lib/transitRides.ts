import { resolveDepartures, type Departure } from '@/utils/dateUtils';
import type { SpecialService } from '@/data/specialServiceData';

export type RideMode = 'bus' | 'special' | 'buggy';

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
  /** For a special service: its title, e.g. "Exam shuttle". */
  label?: string;
}

export function toRides(departures: Departure[], mode: RideMode): Ride[] {
  return departures.map((departure, index) => ({ ...departure, mode, index }));
}

/**
 * The extra buses a day's special services add in one direction.
 *
 * Each service is resolved on its own before the lists are joined:
 * `resolveDepartures` latches "afternoon" and "past midnight" as it walks a
 * list, so feeding it two services back to back would let the first one's
 * evening push the second one's early-morning run onto the next day.
 */
export function specialRides(
  services: SpecialService[],
  direction: 'nilaToSahyadri' | 'sahyadriToNila',
  referenceDate: Date,
): Ride[] {
  return services
    .flatMap((service) =>
      resolveDepartures(service[direction], referenceDate).map((departure) => ({
        ...departure,
        label: service.title,
      })),
    )
    .map((departure, index) => ({ ...departure, mode: 'special' as const, index }));
}

/**
 * How long a ride still counts as "due" after its printed time, rather than
 * gone.
 *
 * Buses often reach the stop a minute or two late, so under All day a ride
 * keeps a quiet marker for a few minutes instead of fading the moment its time
 * passes. There is deliberately no written "it may be late" notice (user, 23
 * Nov 2026).
 */
export const LATE_GRACE_MINUTES = 10;

/**
 * Where a ride stands at a given moment. A ride at exactly that moment is
 * already due: "Leaves in" only ever counts down to the future.
 */
export type RideStatus = 'upcoming' | 'due' | 'departed';

export function rideStatus(ride: Departure, now: Date): RideStatus {
  const elapsed = now.getTime() - ride.at.getTime();
  if (elapsed < 0) return 'upcoming';
  return elapsed < LATE_GRACE_MINUTES * 60000 ? 'due' : 'departed';
}

// A shared time reads regular bus, then extra bus, then buggy.
const MODE_ORDER: Record<RideMode, number> = { bus: 0, special: 1, buggy: 2 };

/**
 * Interleaves schedules by the instants they already resolve to.
 *
 * Every list must come from `resolveDepartures`, which is what turns a bare
 * label into a real moment — ordering by the label instead would scatter the
 * post-midnight trips back into the morning.
 */
export function mergeRides(...schedules: Ride[][]): Ride[] {
  return schedules.flat().sort((a, b) => {
    const byInstant = a.at.getTime() - b.at.getTime();
    if (byInstant !== 0) return byInstant;
    if (a.mode === b.mode) return a.index - b.index;
    return MODE_ORDER[a.mode] - MODE_ORDER[b.mode];
  });
}
