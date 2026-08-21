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
import { sslConfig } from '../src/ssl';
import { resolveDepartMinutes } from '../src/utils/busTime';

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
    [
      'nila_to_sahyadri',
      schedule.nilaToSahyadri,
      schedule.multipleBusTimings?.nilaToSahyadri,
      schedule.multipleBusPositions?.nilaToSahyadri,
    ],
    [
      'sahyadri_to_nila',
      schedule.sahyadriToNila,
      schedule.multipleBusTimings?.sahyadriToNila,
      schedule.multipleBusPositions?.sahyadriToNila,
    ],
  ] as const;

  for (const [direction, times, multiple, positions] of directions) {
    const minutes = resolveDepartMinutes(times);
    // Prefer positions. Matching by string flags every occurrence of a time,
    // and a weekday has two 8:30s of which only the morning one is doubled —
    // that is how the evening bus ended up marked in the first place.
    const markedPositions = positions ? new Set<number>(positions) : null;
    const multipleSet = new Set(multiple ?? []);

    times.forEach((time, index) => {
      const isMultiple = markedPositions ? markedPositions.has(index) : multipleSet.has(time);
      departures.push([dayType, direction, time, minutes[index], index, isMultiple]);
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
interface SeedReport {
  table: string;
  written: number;
  preserved: number;
}

const report: SeedReport[] = [];

function note(table: string, written: number, preserved = 0) {
  report.push({ table, written, preserved });
}

/**
 * Upserts rows keyed by `conflict`, refreshing `update` columns.
 *
 * When `guarded` is set, a row already marked `source = 'admin'` keeps its
 * current values — that is what lets a reseed refresh the baseline without
 * discarding anything edited through the admin panel.
 */
async function upsert(
  client: Client,
  table: string,
  columns: string[],
  rows: unknown[][],
  conflict: string[],
  update: string[],
  guarded = false,
): Promise<number> {
  if (rows.length === 0) return 0;

  const setClause = update.map((c) => `${c} = excluded.${c}`).join(', ');
  const guard = guarded ? ` where ${table}.source = 'seed'` : '';
  let touched = 0;

  for (let start = 0; start < rows.length; start += 300) {
    const chunk = rows.slice(start, start + 300);
    const params: unknown[] = [];
    const tuples = chunk.map((row) => {
      const placeholders = row.map((value) => {
        params.push(value);
        return `$${params.length}`;
      });
      return `(${placeholders.join(', ')})`;
    });

    const result = await client.query(
      `insert into ${table} (${columns.join(', ')})
       values ${tuples.join(', ')}
       on conflict (${conflict.join(', ')}) do update set ${setClause}${guard}`,
      params,
    );
    touched += result.rowCount ?? 0;
  }

  return touched;
}

async function countCustomized(client: Client, table: string): Promise<number> {
  const { rows } = await client.query<{ n: string }>(
    `select count(*) n from ${table} where source = 'admin'`,
  );
  return Number(rows[0].n);
}

async function main() {
  const reset = process.argv.includes('--reset');
  const connectionString = config.DIRECT_URL ?? config.DATABASE_URL;
  const client = new Client({
    connectionString,
    ssl: sslConfig(connectionString),
  });

  await client.connect();

  if (reset) {
    console.log('Connected. RESET mode: discarding admin edits and reloading from src/data.\n');
  } else {
    console.log('Connected. Refreshing from src/data, keeping admin edits.\n');
  }

  try {
    await client.query('begin');

    if (reset) {
      // Deletes rather than truncates: truncate restarts identity, and
      // canteen_items / mess_menu_entries hang off those generated ids.
      await client.query(`
        delete from course_meetings;
        delete from canteen_items;
        delete from mess_menu_entries;
        delete from mess_common_items;
        delete from bus_departures;
        delete from bus_routes;
        delete from course_offerings;
        delete from canteen_sections;
        delete from mess_timings;
        delete from messes;
        delete from bus_day_types;
        delete from academic_days;
        delete from venue_overrides;
        delete from timetable_metadata;
      `);
    }

    // ---- messes -------------------------------------------------------
    // Upserted by slug so the generated ids survive; menu entries reference them.
    // week_cycle_flipped is deliberately absent from the update list: it is set
    // from the admin panel and must survive a reseed.
    await upsert(
      client,
      'messes',
      ['slug', 'name', 'caterer', 'has_week_cycle', 'sort_order'],
      [
        ['kedaram', 'Kedaram Mess', 'Ideal Catering', true, 0],
        ['nila', 'Nila Mess', 'Manu Catering', false, 1],
      ],
      ['slug'],
      ['name', 'caterer', 'has_week_cycle', 'sort_order'],
    );

    const { rows: messRows } = await client.query<{ id: number; slug: string }>(
      'select id, slug from messes',
    );
    const messId = Object.fromEntries(messRows.map((m) => [m.slug, m.id])) as Record<string, number>;
    note('messes', messRows.length);

    const commonRows = [
      ...MEALS.map((meal) => [
        messId.kedaram, meal, commonItems[meal.toLowerCase() as keyof typeof commonItems],
      ]),
      ...MEALS.map((meal) => [
        messId.nila, meal, nilaCommonItems[meal.toLowerCase() as keyof typeof nilaCommonItems],
      ]),
    ];
    await upsert(client, 'mess_common_items', ['mess_id', 'meal', 'items'], commonRows,
      ['mess_id', 'meal'], ['items']);
    note('mess_common_items', commonRows.length);

    // ---- mess menu (admin-editable) ------------------------------------
    const menuEntries = [
      ...menuRows(messId.kedaram, 'week13', week1and3Menu),
      ...menuRows(messId.kedaram, 'week24', week2and4Menu),
      ...menuRows(messId.nila, 'all', nilaMessMenu),
    ];
    const menuCustom = await countCustomized(client, 'mess_menu_entries');
    const menuWritten = await upsert(
      client, 'mess_menu_entries',
      ['mess_id', 'week_cycle', 'day_of_week', 'meal', 'items', 'veg', 'non_veg'],
      menuEntries,
      ['mess_id', 'week_cycle', 'day_of_week', 'meal'],
      ['items', 'veg', 'non_veg'],
      true,
    );
    note('mess_menu_entries', menuWritten, menuCustom);

    // ---- mess timings (admin-editable) ---------------------------------
    const timings = [...timingRows('weekday', weekdayTimings), ...timingRows('weekend', weekendTimings)];
    const timingCustom = await countCustomized(client, 'mess_timings');
    const timingWritten = await upsert(
      client, 'mess_timings', ['day_type', 'meal', 'timing', 'sort_order'], timings,
      ['day_type', 'meal'], ['timing', 'sort_order'], true,
    );
    note('mess_timings', timingWritten, timingCustom);

    // ---- bus (departures are admin-editable) ----------------------------
    const dayTypes: Array<[string, string, number, BusSchedule]> = [
      ['weekday', 'Monday – Thursday', 0, workingDaysBus],
      ['friday', 'Friday', 1, fridayBus],
      ['saturday_holiday', 'Saturday & Holidays', 2, saturdayHolidayBus],
      ['sunday', 'Sunday', 3, sundayBus],
    ];

    await upsert(client, 'bus_day_types', ['slug', 'label', 'sort_order'],
      dayTypes.map(([slug, label, order]) => [slug, label, order]),
      ['slug'], ['label', 'sort_order']);

    const allDepartures: unknown[][] = [];
    const allRoutes: unknown[][] = [];
    for (const [slug, , , schedule] of dayTypes) {
      const { departures, routes } = busRows(slug, schedule);
      allDepartures.push(...departures);
      allRoutes.push(...routes);
    }

    // A direction is edited as a whole list — order carries the AM/PM meaning —
    // so provenance is tracked per (day_type, direction) group, not per row.
    const { rows: editedGroups } = await client.query<{ day_type: string; direction: string }>(
      `select distinct day_type, direction from bus_departures where source = 'admin'`,
    );
    const preservedGroups = new Set(editedGroups.map((g) => `${g.day_type}|${g.direction}`));

    await client.query(
      `delete from bus_departures
        where (day_type, direction) not in (
          select distinct day_type, direction from bus_departures where source = 'admin'
        )`,
    );
    // Routes are edited a category at a time, so they get the same treatment.
    const { rows: editedRouteGroups } = await client.query<{ day_type: string; category: string }>(
      `select distinct day_type, category from bus_routes where source = 'admin'`,
    );
    const preservedRouteGroups = new Set(
      editedRouteGroups.map((g) => `${g.day_type}|${g.category}`),
    );

    await client.query(
      `delete from bus_routes
        where (day_type, category) not in (
          select distinct day_type, category from bus_routes where source = 'admin'
        )`,
    );

    const freshDepartures = allDepartures.filter(
      (row) => !preservedGroups.has(`${row[0]}|${row[1]}`),
    );
    const freshRoutes = allRoutes.filter(
      (row) => !preservedRouteGroups.has(`${row[0]}|${row[1]}`),
    );

    await bulkInsert(client, 'bus_departures',
      ['day_type', 'direction', 'depart_time', 'depart_minutes', 'sort_order', 'is_multiple_bus'],
      freshDepartures);
    await bulkInsert(client, 'bus_routes',
      ['day_type', 'category', 'description', 'sort_order'], freshRoutes);
    note('bus_departures', freshDepartures.length, allDepartures.length - freshDepartures.length);
    note('bus_routes', freshRoutes.length, allRoutes.length - freshRoutes.length);

    // ---- canteen (items are admin-editable) -----------------------------
    await upsert(client, 'canteen_sections',
      ['title', 'timing', 'start_hour', 'end_hour', 'sort_order'],
      canteenSections.map((s, i) => [s.title, s.timing, s.startHour, s.endHour, i]),
      ['title'], ['timing', 'start_hour', 'end_hour', 'sort_order']);

    const { rows: sectionRows } = await client.query<{ id: number; title: string }>(
      'select id, title from canteen_sections',
    );
    const sectionId = Object.fromEntries(sectionRows.map((s) => [s.title, s.id]));

    let itemsWritten = 0;
    let itemsPreserved = 0;
    const sectionsSkipped: string[] = [];
    for (const section of canteenSections) {
      const id = sectionId[section.title];
      if (id === undefined) continue;

      // Items have no stable natural key, so they are replaced as a set.
      // A section containing any hand-edited price is left untouched — coarse,
      // but it can never mismatch an edited price onto a different item.
      const { rows: custom } = await client.query<{ n: string }>(
        "select count(*) n from canteen_items where section_id = $1 and source = 'admin'",
        [id],
      );
      if (Number(custom[0].n) > 0) {
        itemsPreserved += Number(custom[0].n);
        sectionsSkipped.push(section.title);
        continue;
      }

      await client.query('delete from canteen_items where section_id = $1', [id]);
      itemsWritten += await bulkInsert(
        client, 'canteen_items', ['section_id', 'name', 'price', 'variant', 'sort_order'],
        section.items.map((item, i) => [id, item.name, item.price, item.variant ?? null, i]),
      );
    }
    note('canteen_sections', sectionRows.length);
    note('canteen_items', itemsWritten, itemsPreserved);
    if (sectionsSkipped.length > 0) {
      console.log(
        `  note: canteen sections left untouched because they contain edits: ${sectionsSkipped.join(', ')}\n`,
      );
    }

    // ---- academic calendar (admin-editable) ------------------------------
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
    const dayCustom = await countCustomized(client, 'academic_days');
    // Drops seed-owned days no longer in the files; admin-added days stay.
    await client.query(
      "delete from academic_days where source = 'seed' and not (date = any($1::date[]))",
      [[...byDate.keys()]],
    );
    const daysWritten = await upsert(client, 'academic_days', ['date', 'name', 'kind'],
      academicDays, ['date'], ['name', 'kind'], true);
    note('academic_days', daysWritten, dayCustom);

    // ---- timetable (schedules are admin-editable) ------------------------
    const metadata = JSON.parse(fs.readFileSync(path.join(TIMETABLE_DIR, 'metadata.json'), 'utf8'));
    const semester: string = metadata.semester ?? 'unknown';

    const offerings: unknown[][] = [];
    const meetingsByOffering = new Map<string, unknown[][]>();

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
            offeringId, program, branch, course.courseCode, course.courseName,
            course.credits ?? null, course.category ?? null, course.rawSlot ?? null, semester,
          ]);

          meetingsByOffering.set(
            offeringId,
            (course.meetings ?? []).map((meeting, index) => [
              offeringId, meeting.type, meeting.day, meeting.startTime, meeting.endTime,
              meeting.room ?? null, meeting.instructors ?? [],
              meeting.recurrence?.type ?? 'weekly', index,
            ]),
          );
        }
      }
    }

    const offeringCustom = await countCustomized(client, 'course_offerings');
    await upsert(
      client, 'course_offerings',
      ['id', 'program', 'branch', 'course_code', 'course_name', 'credits', 'category', 'raw_slot', 'semester'],
      offerings, ['id'],
      ['program', 'branch', 'course_code', 'course_name', 'credits', 'category', 'raw_slot', 'semester'],
      true,
    );

    // Meetings belong to their offering as a set, so the guard is per course:
    // a schedule edited in the admin panel is skipped entirely.
    const { rows: customized } = await client.query<{ id: string }>(
      "select id from course_offerings where source = 'admin'",
    );
    const skip = new Set(customized.map((r) => r.id));

    const meetingRows: unknown[][] = [];
    for (const [offeringId, rows] of meetingsByOffering) {
      if (!skip.has(offeringId)) meetingRows.push(...rows);
    }

    await client.query(
      "delete from course_meetings where offering_id in (select id from course_offerings where source = 'seed')",
    );
    await bulkInsert(
      client, 'course_meetings',
      ['offering_id', 'type', 'day', 'start_time', 'end_time', 'room', 'instructors', 'recurrence', 'sort_order'],
      meetingRows,
    );
    note('course_offerings', offerings.length, offeringCustom);
    note('course_meetings', meetingRows.length, skip.size);

    // ---- venue overrides & metadata (no admin editors) -------------------
    await client.query('delete from venue_overrides');
    await bulkInsert(client, 'venue_overrides',
      ['course_code', 'meeting_type', 'batch_min', 'batch_max', 'room'],
      VENUE_OVERRIDES.map((row) => [...row]));
    note('venue_overrides', VENUE_OVERRIDES.length);

    await upsert(client, 'timetable_metadata', ['key', 'value'],
      [
        ['semester', JSON.stringify(semester)],
        ['schemaVersion', JSON.stringify(metadata.schemaVersion ?? null)],
        ['generatedAt', JSON.stringify(metadata.generatedAt ?? null)],
        ['sourceWorkbooks', JSON.stringify(metadata.sourceWorkbooks ?? [])],
        // The admin UI expands slot codes into meetings, so it needs the
        // definitions server-side rather than only in the frontend bundle.
        ['slots', fs.readFileSync(path.join(TIMETABLE_DIR, 'slots.json'), 'utf8')],
      ],
      ['key'], ['value']);

    await client.query('commit');

    for (const row of report) {
      const kept = row.preserved > 0 ? `   (${row.preserved} kept from admin edits)` : '';
      console.log(`  ${row.table.padEnd(20)} ${String(row.written).padStart(5)}${kept}`);
    }

    const totalPreserved = report.reduce((sum, r) => sum + r.preserved, 0);
    console.log();
    if (reset) {
      console.log('Reset complete. Everything now matches src/data.');
    } else if (totalPreserved > 0) {
      console.log(`Seed complete. ${totalPreserved} admin-edited value(s) preserved.`);
      console.log('Run with --reset to discard those and match src/data exactly.');
    } else {
      console.log('Seed complete. No admin edits to preserve.');
    }
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
