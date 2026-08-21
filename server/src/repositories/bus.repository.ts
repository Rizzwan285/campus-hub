import { pool, query } from '../db';
import { resolveDepartMinutes } from '../utils/busTime';

export interface BusRoute {
  description: string;
}

export interface BusSchedule {
  nilaToSahyadri: string[];
  sahyadriToNila: string[];
  palakkadTown: BusRoute[];
  wisePark: BusRoute[];
  /**
   * Ambiguous legacy view: a display time appears once even when only one of
   * its two daily occurrences is doubled. Kept for older clients.
   */
  multipleBusTimings: {
    nilaToSahyadri: string[];
    sahyadriToNila: string[];
  };
  /** Indices into each direction's list — unambiguous, preferred by the card. */
  multipleBusPositions: {
    nilaToSahyadri: number[];
    sahyadriToNila: number[];
  };
}

const DIRECTION_KEY = {
  nila_to_sahyadri: 'nilaToSahyadri',
  sahyadri_to_nila: 'sahyadriToNila',
} as const;

export type BusDirection = keyof typeof DIRECTION_KEY;

export interface DepartureInput {
  time: string;
  isMultipleBus?: boolean;
}

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
    multipleBusPositions: { nilaToSahyadri: [], sahyadriToNila: [] },
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
    // Rows arrive in sort_order, so the push index is the departure's position.
    const position = schedule[key].push(row.depart_time) - 1;
    if (row.is_multiple_bus) {
      schedule.multipleBusPositions[key].push(position);
      // The same display time can appear morning and evening; the legacy
      // string view can only list it once.
      if (!schedule.multipleBusTimings[key].includes(row.depart_time)) {
        schedule.multipleBusTimings[key].push(row.depart_time);
      }
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

export async function listDayTypes(): Promise<Array<{ slug: string; label: string }>> {
  return query<{ slug: string; label: string }>(
    'select slug, label from bus_day_types order by sort_order',
  );
}

/**
 * Replaces every departure for one (day_type, direction), in list order.
 *
 * A direction is rewritten wholesale rather than patched row by row because
 * position is data: depart_minutes is derived by walking the list and deciding
 * where the afternoon starts, so changing one time can change what the times
 * after it mean. Runs in a transaction so a failure cannot leave a direction
 * with a half-written schedule.
 *
 * Rows are marked `source = 'admin'`, which makes `npm run seed` leave this
 * direction alone on its next run.
 */
export async function replaceDepartures(
  dayType: string,
  direction: BusDirection,
  departures: DepartureInput[],
): Promise<string[]> {
  const times = departures.map((entry) => entry.time.trim());
  const minutes = resolveDepartMinutes(times);

  const client = await pool.connect();
  try {
    await client.query('begin');

    await client.query('delete from bus_departures where day_type = $1 and direction = $2', [
      dayType,
      direction,
    ]);

    for (const [index, time] of times.entries()) {
      await client.query(
        `insert into bus_departures
           (day_type, direction, depart_time, depart_minutes, sort_order,
            is_multiple_bus, source, customized_at)
         values ($1,$2,$3,$4,$5,$6,'admin',now())`,
        [dayType, direction, time, minutes[index], index, departures[index].isMultipleBus ?? false],
      );
    }

    await client.query('commit');
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }

  return times;
}

export type BusRouteCategory = keyof typeof CATEGORY_KEY;

export function isRouteCategory(value: string): value is BusRouteCategory {
  return value in CATEGORY_KEY;
}

/**
 * Replaces every route in one (day_type, category), in list order.
 *
 * Rewritten wholesale for the same reason as departures: the card numbers the
 * routes by their position, so "route 5" is defined by where it sits in the
 * list. Patching one row would silently renumber the rest.
 *
 * Rows are marked `source = 'admin'`, which makes `npm run seed` leave this
 * category alone on its next run.
 */
export async function replaceRoutes(
  dayType: string,
  category: BusRouteCategory,
  descriptions: string[],
): Promise<string[]> {
  const cleaned = descriptions.map((text) => text.trim()).filter(Boolean);

  const client = await pool.connect();
  try {
    await client.query('begin');

    await client.query('delete from bus_routes where day_type = $1 and category = $2', [
      dayType,
      category,
    ]);

    for (const [index, description] of cleaned.entries()) {
      await client.query(
        `insert into bus_routes
           (day_type, category, description, sort_order, source, customized_at)
         values ($1,$2,$3,$4,'admin',now())`,
        [dayType, category, description, index],
      );
    }

    await client.query('commit');
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }

  return cleaned;
}
