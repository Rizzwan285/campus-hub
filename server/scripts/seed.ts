/**
 * Loads the app's existing static data into Postgres.
 *
 * Reads straight from src/data/*.ts and src/data/timetable/*.json so the seed
 * cannot drift from what the app shipped before. Re-running replaces all
 * content rows; profiles are left alone.
 *
 *   npm run seed
 */
import fs from 'fs';
import path from 'path';
import { Client } from 'pg';
import { config } from '../src/config';

import {
  workingDaysBus,
  fridayBus,
  saturdayHolidayBus,
  sundayBus,
  holidays2025,
  specialDays2025,
  type BusSchedule,
} from '../../src/data/busData';
import {
  commonItems,
  nilaCommonItems,
  week1and3Menu,
  week2and4Menu,
  nilaMessMenu,
  weekdayTimings,
  weekendTimings,
  type WeekMenu,
  type MessTimings,
} from '../../src/data/messData';
import { canteenSections } from '../../src/data/canteenData';

const TIMETABLE_DIR = path.resolve(__dirname, '../../src/data/timetable');
const MEALS = ['Breakfast', 'Lunch', 'Snacks', 'Dinner'] as const;

type Meal = (typeof MEALS)[number];

interface RawMeeting {
  type: string;
  day: string;
  startTime: string;
  endTime: string;
  room?: string;
  instructors?: string[];
  recurrence?: { type?: string };
}

interface RawCourse {
  id: string;
  courseCode: string;
  courseName: string;
  credits?: string;
  category?: string;
  rawSlot?: string;
  meetings?: RawMeeting[];
}

/**
 * Resolves a display time ("7:45", "12:00") to minutes past midnight.
 *
 * Bus times carry no AM/PM marker, so the schedule is read in order and a
 * flag tracks whether we have crossed into the afternoon — the same rule
 * src/utils/dateUtils.ts uses on the client. Kept in sync deliberately: the
 * client still renders the raw strings, this only backfills a sortable value.
 */
function resolveDepartMinutes(times: string[]): (number | null)[] {
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

/** Inserts rows in chunks using a single multi-VALUES statement per chunk. */
async function bulkInsert(
  client: Client,
  table: string,
  columns: string[],
  rows: unknown[][],
  chunkSize = 400,
): Promise<number> {
  if (rows.length === 0) return 0;

  for (let start = 0; start < rows.length; start += chunkSize) {
    const chunk = rows.slice(start, start + chunkSize);
    const params: unknown[] = [];
    const tuples = chunk.map((row) => {
      const placeholders = row.map((value) => {
        params.push(value);
        return `$${params.length}`;
      });
      return `(${placeholders.join(', ')})`;
    });

    await client.query(
      `insert into ${table} (${columns.join(', ')}) values ${tuples.join(', ')}`,
      params,
    );
  }

  return rows.length;
}

function menuRows(messId: number, weekCycle: string, menu: WeekMenu): unknown[][] {
  const rows: unknown[][] = [];

  for (const [day, dayMenu] of Object.entries(menu)) {
    for (const meal of MEALS) {
      const entries = dayMenu?.[meal];
      if (!entries || entries.length === 0) continue;

      // The source type allows several entries per meal; in practice there is
      // always one. Merge defensively so nothing is silently dropped.
      const items = entries.flatMap((entry) => entry.items ?? []);
      const veg = entries.find((entry) => entry.veg)?.veg ?? null;
      const nonVeg = entries.find((entry) => entry.nonVeg)?.nonVeg ?? null;

      rows.push([messId, weekCycle, day, meal, items, veg, nonVeg]);
    }
  }

  return rows;
}

function timingRows(dayType: string, timings: MessTimings): unknown[][] {
  return MEALS.map((meal, index) => [
    dayType,
    meal,
    timings[meal.toLowerCase() as keyof MessTimings],
    index,
  ]);
}

function busRows(dayType: string, schedule: BusSchedule) {
  const departures: unknown[][] = [];
  const routes: unknown[][] = [];

  const directions = [
    ['nila_to_sahyadri', schedule.nilaToSahyadri, schedule.multipleBusTimings?.nilaToSahyadri],
    ['sahyadri_to_nila', schedule.sahyadriToNila, schedule.multipleBusTimings?.sahyadriToNila],
  ] as const;

  for (const [direction, times, multiple] of directions) {
    const minutes = resolveDepartMinutes(times);
    const multipleSet = new Set(multiple ?? []);

    times.forEach((time, index) => {
      departures.push([dayType, direction, time, minutes[index], index, multipleSet.has(time)]);
    });
  }

  const categories = [
    ['palakkad_town', schedule.palakkadTown],
    ['wise_park', schedule.wisePark],
  ] as const;

  for (const [category, list] of categories) {
    (list ?? []).forEach((route, index) => {
      routes.push([dayType, category, route.description, index]);
    });
  }

  return { departures, routes };
}

/**
 * The batch-number venue rules that used to live in useTimetableStore.
 * A row with a meeting_type wins over a row without one, matching the
 * original function's early return for labs.
 */
const VENUE_OVERRIDES: Array<[string, string | null, number, number, string]> = [
  ['PH1030', null, 1, 6, 'C06-105'],
  ['PH1030', null, 7, 12, 'C06-106'],
  ['PH1030', null, 13, 18, 'C06-107'],
  ['PH1030', null, 19, 999, 'C06-104'],
  ['MA1011A', null, 1, 6, 'C06-105'],
  ['MA1011A', null, 7, 12, 'C06-106'],
  ['MA1011A', null, 13, 18, 'C06-107'],
  ['MA1011A', null, 19, 999, 'C06-104'],
  ['ES1010', null, 1, 11, 'N203'],
  ['ES1010', null, 12, 18, 'N305'],
  ['ES1010', null, 19, 999, 'C06-104'],
  ['ME1130', 'lab', 1, 999, 'A01-112 (Drawing Hall)'],
  ['ME1130', null, 1, 5, 'C06-105'],
  ['ME1130', null, 6, 10, 'C06-106'],
  ['ME1130', null, 11, 15, 'C06-107'],
  ['ME1130', null, 16, 20, 'C06-104'],
  ['ME1130', null, 21, 999, 'N305'],
  ['ID1050A', 'lab', 1, 999, 'Nila CS-Lab'],
  ['ID1050A', null, 1, 999, 'A01-007'],
  ['ME1150', null, 1, 999, 'D-03 Workshop'],
  ['EE1110', null, 1, 999, 'C06-105 + C06 Electronics Lab'],
  ['PH1130', null, 1, 999, 'A01 Physics Lab'],
  ['CY1140', null, 1, 999, 'A01 Chemistry Lab'],
  ['GN1003', null, 1, 999, 'N-203/204 & Nila CS Lab'],
];

async function main() {
  const client = new Client({
    connectionString: config.DIRECT_URL ?? config.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });

  await client.connect();
  console.log('Connected. Seeding...\n');

  try {
    await client.query('begin');

    // Content only. profiles survives; user_courses is cleared by the cascade
    // from course_offerings, which is correct when the semester changes.
    await client.query(`
      truncate
        mess_common_items, mess_menu_entries, mess_timings, messes,
        bus_departures, bus_routes, bus_day_types,
        canteen_items, canteen_sections,
        academic_days,
        course_meetings, course_offerings, venue_overrides, timetable_metadata
      restart identity cascade
    `);

    // ---- messes -------------------------------------------------------
    const messRows = [
      ['kedaram', 'Kedaram Mess', 'Ideal Catering', true, 0],
      ['nila', 'Nila Mess', 'Manu Catering', false, 1],
    ];
    const { rows: insertedMesses } = await client.query<{ id: number; slug: string }>(
      `insert into messes (slug, name, caterer, has_week_cycle, sort_order)
       values ($1,$2,$3,$4,$5), ($6,$7,$8,$9,$10)
       returning id, slug`,
      messRows.flat(),
    );
    const messId = Object.fromEntries(insertedMesses.map((m) => [m.slug, m.id])) as Record<
      string,
      number
    >;
    console.log(`  messes                ${insertedMesses.length}`);

    const commonRows = [
      ...MEALS.map((meal) => [
        messId.kedaram,
        meal,
        commonItems[meal.toLowerCase() as keyof typeof commonItems],
      ]),
      ...MEALS.map((meal) => [
        messId.nila,
        meal,
        nilaCommonItems[meal.toLowerCase() as keyof typeof nilaCommonItems],
      ]),
    ];
    await bulkInsert(client, 'mess_common_items', ['mess_id', 'meal', 'items'], commonRows);
    console.log(`  mess_common_items     ${commonRows.length}`);

    const menuEntries = [
      ...menuRows(messId.kedaram, 'week13', week1and3Menu),
      ...menuRows(messId.kedaram, 'week24', week2and4Menu),
      ...menuRows(messId.nila, 'all', nilaMessMenu),
    ];
    await bulkInsert(
      client,
      'mess_menu_entries',
      ['mess_id', 'week_cycle', 'day_of_week', 'meal', 'items', 'veg', 'non_veg'],
      menuEntries,
    );
    console.log(`  mess_menu_entries     ${menuEntries.length}`);

    const timings = [...timingRows('weekday', weekdayTimings), ...timingRows('weekend', weekendTimings)];
    await bulkInsert(client, 'mess_timings', ['day_type', 'meal', 'timing', 'sort_order'], timings);
    console.log(`  mess_timings          ${timings.length}`);

    // ---- bus ----------------------------------------------------------
    const dayTypes: Array<[string, string, number, BusSchedule]> = [
      ['weekday', 'Monday – Thursday', 0, workingDaysBus],
      ['friday', 'Friday', 1, fridayBus],
      ['saturday_holiday', 'Saturday & Holidays', 2, saturdayHolidayBus],
      ['sunday', 'Sunday', 3, sundayBus],
    ];

    await bulkInsert(
      client,
      'bus_day_types',
      ['slug', 'label', 'sort_order'],
      dayTypes.map(([slug, label, order]) => [slug, label, order]),
    );

    const allDepartures: unknown[][] = [];
    const allRoutes: unknown[][] = [];
    for (const [slug, , , schedule] of dayTypes) {
      const { departures, routes } = busRows(slug, schedule);
      allDepartures.push(...departures);
      allRoutes.push(...routes);
    }

    await bulkInsert(
      client,
      'bus_departures',
      ['day_type', 'direction', 'depart_time', 'depart_minutes', 'sort_order', 'is_multiple_bus'],
      allDepartures,
    );
    await bulkInsert(
      client,
      'bus_routes',
      ['day_type', 'category', 'description', 'sort_order'],
      allRoutes,
    );
    console.log(`  bus_day_types         ${dayTypes.length}`);
    console.log(`  bus_departures        ${allDepartures.length}`);
    console.log(`  bus_routes            ${allRoutes.length}`);

    // ---- canteen ------------------------------------------------------
    let canteenItemCount = 0;
    for (const [index, section] of canteenSections.entries()) {
      const { rows } = await client.query<{ id: number }>(
        `insert into canteen_sections (title, timing, start_hour, end_hour, sort_order)
         values ($1,$2,$3,$4,$5) returning id`,
        [section.title, section.timing, section.startHour, section.endHour, index],
      );
      const sectionId = rows[0].id;

      const itemRows = section.items.map((item, itemIndex) => [
        sectionId,
        item.name,
        item.price,
        item.variant ?? null,
        itemIndex,
      ]);
      canteenItemCount += await bulkInsert(
        client,
        'canteen_items',
        ['section_id', 'name', 'price', 'variant', 'sort_order'],
        itemRows,
      );
    }
    console.log(`  canteen_sections      ${canteenSections.length}`);
    console.log(`  canteen_items         ${canteenItemCount}`);

    // ---- academic calendar --------------------------------------------
    const timetableHolidays: Array<{ date: string; name: string }> = JSON.parse(
      fs.readFileSync(path.join(TIMETABLE_DIR, 'holidays.json'), 'utf8'),
    );

    const byDate = new Map<string, unknown[]>();
    for (const holiday of holidays2025) byDate.set(holiday.date, [holiday.date, holiday.occasion, 'holiday']);
    for (const holiday of timetableHolidays) byDate.set(holiday.date, [holiday.date, holiday.name, 'holiday']);
    for (const special of specialDays2025) {
      byDate.set(special.date, [special.date, special.note, 'instructional']);
    }

    const academicDays = [...byDate.values()];
    await bulkInsert(client, 'academic_days', ['date', 'name', 'kind'], academicDays);
    console.log(`  academic_days         ${academicDays.length}`);

    // ---- timetable ----------------------------------------------------
    const metadata = JSON.parse(fs.readFileSync(path.join(TIMETABLE_DIR, 'metadata.json'), 'utf8'));
    const semester: string = metadata.semester ?? 'unknown';

    const offerings: unknown[][] = [];
    const meetings: unknown[][] = [];

    for (const program of ['UG', 'PG']) {
      const dir = path.join(TIMETABLE_DIR, program);
      if (!fs.existsSync(dir)) continue;

      for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort()) {
        const branch = path.basename(file, '.json');
        const courses: RawCourse[] = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));

        for (const course of courses) {
          // Course codes repeat across branches (56 of them), so the branch and
          // program are part of the key.
          const offeringId = `${program}_${branch}_${course.courseCode}`;

          offerings.push([
            offeringId,
            program,
            branch,
            course.courseCode,
            course.courseName,
            course.credits ?? null,
            course.category ?? null,
            course.rawSlot ?? null,
            semester,
          ]);

          (course.meetings ?? []).forEach((meeting, index) => {
            meetings.push([
              offeringId,
              meeting.type,
              meeting.day,
              meeting.startTime,
              meeting.endTime,
              meeting.room ?? null,
              meeting.instructors ?? [],
              meeting.recurrence?.type ?? 'weekly',
              index,
            ]);
          });
        }
      }
    }

    await bulkInsert(
      client,
      'course_offerings',
      ['id', 'program', 'branch', 'course_code', 'course_name', 'credits', 'category', 'raw_slot', 'semester'],
      offerings,
    );
    await bulkInsert(
      client,
      'course_meetings',
      ['offering_id', 'type', 'day', 'start_time', 'end_time', 'room', 'instructors', 'recurrence', 'sort_order'],
      meetings,
    );
    console.log(`  course_offerings      ${offerings.length}`);
    console.log(`  course_meetings       ${meetings.length}`);

    await bulkInsert(
      client,
      'venue_overrides',
      ['course_code', 'meeting_type', 'batch_min', 'batch_max', 'room'],
      VENUE_OVERRIDES.map((row) => [...row]),
    );
    console.log(`  venue_overrides       ${VENUE_OVERRIDES.length}`);

    await bulkInsert(
      client,
      'timetable_metadata',
      ['key', 'value'],
      [
        ['semester', JSON.stringify(semester)],
        ['schemaVersion', JSON.stringify(metadata.schemaVersion ?? null)],
        ['generatedAt', JSON.stringify(metadata.generatedAt ?? null)],
        ['sourceWorkbooks', JSON.stringify(metadata.sourceWorkbooks ?? [])],
      ],
    );

    await client.query('commit');
    console.log('\nSeed complete.');
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error('\nSeed failed:', error instanceof Error ? error.message : error);
  process.exit(1);
});
