import { latestDue, mergeRides, rideStatus, type Ride } from './transitRides';

/**
 * What the bus card lists for today: the next ride and everything after it,
 * or the whole day with the times that have passed faded. Another date always
 * lists its whole day.
 */
export type BusView = 'next' | 'all';

export const BUS_VIEWS: ReadonlyArray<{ value: BusView; label: string }> = [
  { value: 'next', label: 'Next' },
  { value: 'all', label: 'All day' },
];

/**
 * The card opens on Next every time (user, 18 Nov 2026). The choice is not
 * remembered, so a past "All day" never hides the countdown on the next visit.
 */
export const DEFAULT_BUS_VIEW: BusView = 'next';

export interface LiveBoard {
  /** Rides whose time has just passed and which may still turn up late. */
  late: Ride[];
  /** The next bus and, when buggies are shown, the next buggy. */
  next: Ride[];
  /** The tiles listed under them. */
  grid: Ride[];
}

const isRide = (ride: Ride | undefined): ride is Ride => ride !== undefined;

/**
 * What one direction of the card shows for today.
 *
 * `buses` are the regular and extra buses merged; `buggies` is empty unless
 * buggies are switched on. Both must be the whole day, in time order:
 * `resolveDepartures` reads am/pm from a time's position, so lists are
 * resolved first and filtered here, never the other way round.
 */
export function liveBoard(buses: Ride[], buggies: Ride[], view: BusView, now: Date): LiveBoard {
  const isUpcoming = (ride: Ride) => rideStatus(ride, now) === 'upcoming';
  const next = [buses.find(isUpcoming), buggies.find(isUpcoming)].filter(isRide);
  const late = [latestDue(buses, now), latestDue(buggies, now)].filter(isRide);
  const wholeDay = mergeRides(buses, buggies);

  const grid =
    view === 'all'
      ? // Every ride, including the next ones: a timetable with a gap where the
        // next bus should be reads as if that bus does not run.
        wholeDay
      : // Everything still to come; the next ones are already shown above it.
        wholeDay.filter((ride) => isUpcoming(ride) && !next.includes(ride));

  return { late, next, grid };
}
