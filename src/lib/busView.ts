import { latestDue, mergeRides, rideStatus, type Ride } from './transitRides';

/**
 * What the bus card lists for today: only the next ride, everything still to
 * come, or the whole day with the times that have passed faded. Another date
 * always lists its whole day.
 */
export type BusView = 'next' | 'remaining' | 'all';

export const BUS_VIEWS: ReadonlyArray<{ value: BusView; label: string }> = [
  { value: 'next', label: 'Next' },
  { value: 'remaining', label: 'Remaining' },
  { value: 'all', label: 'All day' },
];

/** The whole day, so a bus that is running late never drops off the card. */
export const DEFAULT_BUS_VIEW: BusView = 'all';

const SAVED_KEY = 'campus-bus-view';

function isBusView(value: unknown): value is BusView {
  return BUS_VIEWS.some((option) => option.value === value);
}

/** The view last chosen on this device, or the default. */
export function readBusView(): BusView {
  try {
    const saved = localStorage.getItem(SAVED_KEY);
    return isBusView(saved) ? saved : DEFAULT_BUS_VIEW;
  } catch {
    return DEFAULT_BUS_VIEW;
  }
}

export function saveBusView(view: BusView): void {
  try {
    localStorage.setItem(SAVED_KEY, view);
  } catch {
    // Private mode or a full store: the choice lasts for this visit.
  }
}

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

  let grid: Ride[] = [];
  if (view === 'all') {
    // Every ride, including the next ones: a timetable with a gap where the
    // next bus should be reads as if that bus does not run.
    grid = wholeDay;
  } else if (view === 'remaining') {
    // The next ones are already shown above the list.
    grid = wholeDay.filter((ride) => isUpcoming(ride) && !next.includes(ride));
  }

  return { late, next, grid };
}
