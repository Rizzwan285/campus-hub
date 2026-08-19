import { query } from '../db';

export interface BusRoute {
  description: string;
}

export interface BusSchedule {
  nilaToSahyadri: string[];
  sahyadriToNila: string[];
  palakkadTown: BusRoute[];
  wisePark: BusRoute[];
  multipleBusTimings: {
    nilaToSahyadri: string[];
    sahyadriToNila: string[];
  };
}

const DIRECTION_KEY = {
  nila_to_sahyadri: 'nilaToSahyadri',
  sahyadri_to_nila: 'sahyadriToNila',
} as const;

const CATEGORY_KEY = {
  palakkad_town: 'palakkadTown',
  wise_park: 'wisePark',
} as const;

function emptySchedule(): BusSchedule {
  return {
    nilaToSahyadri: [],
    sahyadriToNila: [],
    palakkadTown: [],
    wisePark: [],
    multipleBusTimings: { nilaToSahyadri: [], sahyadriToNila: [] },
  };
}

/**
 * Returns all four day-type schedules keyed by slug.
 *
 * Departure times stay as display strings in schedule order: the client
 * resolves AM/PM from position in the list, so the ordering carries meaning.
 */
export async function getBusSchedules(): Promise<Record<string, BusSchedule>> {
  const [dayTypes, departures, routes] = await Promise.all([
    query<{ slug: string }>('select slug from bus_day_types order by sort_order'),
    query<{
      day_type: string;
      direction: keyof typeof DIRECTION_KEY;
      depart_time: string;
      is_multiple_bus: boolean;
    }>(
      `select day_type, direction, depart_time, is_multiple_bus
         from bus_departures
        order by day_type, direction, sort_order`,
    ),
    query<{ day_type: string; category: keyof typeof CATEGORY_KEY; description: string }>(
      `select day_type, category, description
         from bus_routes
        order by day_type, category, sort_order`,
    ),
  ]);

  const schedules: Record<string, BusSchedule> = {};
  for (const { slug } of dayTypes) {
    schedules[slug] = emptySchedule();
  }

  for (const row of departures) {
    const schedule = schedules[row.day_type];
    if (!schedule) continue;

    const key = DIRECTION_KEY[row.direction];
    schedule[key].push(row.depart_time);
    // The same display time can appear morning and evening; the client
    // matches by string, so list it once.
    if (row.is_multiple_bus && !schedule.multipleBusTimings[key].includes(row.depart_time)) {
      schedule.multipleBusTimings[key].push(row.depart_time);
    }
  }

  for (const row of routes) {
    const schedule = schedules[row.day_type];
    if (!schedule) continue;
    schedule[CATEGORY_KEY[row.category]].push({ description: row.description });
  }

  return schedules;
}

export async function getBusSchedule(dayType: string): Promise<BusSchedule | null> {
  const schedules = await getBusSchedules();
  return schedules[dayType] ?? null;
}

/**
 * Next departures at or after a given minute past midnight, using the
 * precomputed depart_minutes rather than re-deriving AM/PM.
 */
export async function getUpcomingDepartures(
  dayType: string,
  direction: keyof typeof DIRECTION_KEY,
  afterMinutes: number,
  limit = 5,
): Promise<Array<{ time: string; minutes: number; isMultipleBus: boolean }>> {
  const rows = await query<{ depart_time: string; depart_minutes: number; is_multiple_bus: boolean }>(
    `select depart_time, depart_minutes, is_multiple_bus
       from bus_departures
      where day_type = $1
        and direction = $2
        and depart_minutes >= $3
      order by depart_minutes
      limit $4`,
    [dayType, direction, afterMinutes, limit],
  );

  return rows.map((row) => ({
    time: row.depart_time,
    minutes: row.depart_minutes,
    isMultipleBus: row.is_multiple_bus,
  }));
}
