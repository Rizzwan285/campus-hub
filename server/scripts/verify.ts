/**
 * Compares what the API returns against the static data the app used to
 * bundle, field by field. Proves a reseed did not lose or reshape anything.
 *
 *   npm run verify              # checks http://localhost:4000
 *   API=https://... npm run verify
 */
import fs from 'fs';
import path from 'path';

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
} from '../../src/data/messData';
import { canteenSections } from '../../src/data/canteenData';

const API = process.env.API ?? 'http://localhost:4000';
const TIMETABLE_DIR = path.resolve(__dirname, '../../src/data/timetable');
const MEALS = ['Breakfast', 'Lunch', 'Snacks', 'Dinner'] as const;

let failures = 0;
let checks = 0;

function check(label: string, actual: unknown, expected: unknown) {
  checks += 1;
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a !== b) {
    failures += 1;
    console.log(`  MISMATCH  ${label}`);
    console.log(`      api:    ${a?.slice(0, 160)}`);
    console.log(`      static: ${b?.slice(0, 160)}`);
  }
}

async function get<T>(path: string): Promise<T> {
  const response = await fetch(`${API}${path}`);
  if (!response.ok) throw new Error(`GET ${path} -> ${response.status}`);
  return (await response.json()) as T;
}

function checkWeekMenu(label: string, actual: WeekMenu, expected: WeekMenu) {
  for (const [day, dayMenu] of Object.entries(expected)) {
    for (const meal of MEALS) {
      const expectedEntries = dayMenu?.[meal];
      if (!expectedEntries?.length) continue;

      const actualEntry = actual?.[day]?.[meal]?.[0];
      const expectedEntry = expectedEntries[0];

      check(`${label} ${day} ${meal} items`, actualEntry?.items, expectedEntry.items);
      check(`${label} ${day} ${meal} veg`, actualEntry?.veg, expectedEntry.veg);
      check(`${label} ${day} ${meal} nonVeg`, actualEntry?.nonVeg, expectedEntry.nonVeg);
    }
  }
}

function checkBus(label: string, actual: BusSchedule, expected: BusSchedule) {
  check(`${label} nilaToSahyadri`, actual?.nilaToSahyadri, expected.nilaToSahyadri);
  check(`${label} sahyadriToNila`, actual?.sahyadriToNila, expected.sahyadriToNila);
  check(`${label} palakkadTown`, actual?.palakkadTown, expected.palakkadTown ?? []);
  check(`${label} wisePark`, actual?.wisePark, expected.wisePark ?? []);

  // Duplicate display times collapse to one entry on the way out, so compare sets.
  const expectedMultiple = expected.multipleBusTimings ?? { nilaToSahyadri: [], sahyadriToNila: [] };
  const expectedPositions = expected.multipleBusPositions ?? { nilaToSahyadri: [], sahyadriToNila: [] };
  for (const direction of ['nilaToSahyadri', 'sahyadriToNila'] as const) {
    check(
      `${label} multipleBusTimings.${direction}`,
      [...new Set(actual?.multipleBusTimings?.[direction] ?? [])].sort(),
      [...new Set(expectedMultiple[direction] ?? [])].sort(),
    );
    // Positions are what the card actually badges, so they must match exactly.
    check(
      `${label} multipleBusPositions.${direction}`,
      actual?.multipleBusPositions?.[direction] ?? [],
      expectedPositions[direction] ?? [],
    );
  }
}

async function main() {
  console.log(`Verifying ${API} against src/data\n`);

  // ---- mess ----------------------------------------------------------
  const mess = await get<any>('/api/mess');
  checkWeekMenu('kedaram week13', mess.messes.kedaram.menus.week13, week1and3Menu);
  checkWeekMenu('kedaram week24', mess.messes.kedaram.menus.week24, week2and4Menu);
  checkWeekMenu('nila', mess.messes.nila.menus.all, nilaMessMenu);

  for (const meal of MEALS) {
    const key = meal.toLowerCase() as keyof typeof commonItems;
    check(`kedaram commonItems.${key}`, mess.messes.kedaram.commonItems[meal], commonItems[key]);
    check(`nila commonItems.${key}`, mess.messes.nila.commonItems[meal], nilaCommonItems[key]);
    check(`weekdayTimings.${key}`, mess.timings.weekday[key], weekdayTimings[key]);
    check(`weekendTimings.${key}`, mess.timings.weekend[key], weekendTimings[key]);
  }

  // ---- bus -----------------------------------------------------------
  const bus = await get<Record<string, BusSchedule>>('/api/bus');
  checkBus('weekday', bus.weekday, workingDaysBus);
  checkBus('friday', bus.friday, fridayBus);
  checkBus('saturday_holiday', bus.saturday_holiday, saturdayHolidayBus);
  checkBus('sunday', bus.sunday, sundayBus);

  // ---- canteen -------------------------------------------------------
  const canteen = await get<any[]>('/api/canteen');
  check('canteen section count', canteen.length, canteenSections.length);
  canteenSections.forEach((expected, index) => {
    const actual = canteen[index];
    check(`canteen[${index}].title`, actual?.title, expected.title);
    check(`canteen[${index}].timing`, actual?.timing, expected.timing);
    check(`canteen[${index}].startHour`, actual?.startHour, expected.startHour);
    check(`canteen[${index}].endHour`, actual?.endHour, expected.endHour);
    check(
      `canteen[${index}].items`,
      actual?.items?.map((i: any) => ({ name: i.name, price: i.price, variant: i.variant })),
      expected.items.map((i) => ({ name: i.name, price: i.price, variant: i.variant })),
    );
  });

  // ---- academic days --------------------------------------------------
  const academic = await get<any>('/api/academic-days');
  const timetableHolidays: Array<{ date: string; name: string }> = JSON.parse(
    fs.readFileSync(path.join(TIMETABLE_DIR, 'holidays.json'), 'utf8'),
  );
  const expectedHolidays = [
    ...holidays2025,
    ...timetableHolidays.map((h) => ({ date: h.date, occasion: h.name })),
  ].sort((a, b) => a.date.localeCompare(b.date));

  check('holidays', academic.holidays, expectedHolidays);
  check(
    'specialDays',
    academic.specialDays,
    specialDays2025.map((s) => ({ date: s.date, type: s.type, note: s.note })),
  );

  // ---- timetable ------------------------------------------------------
  let courseCount = 0;
  for (const program of ['UG', 'PG']) {
    const dir = path.join(TIMETABLE_DIR, program);
    for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.json'))) {
      const branch = path.basename(file, '.json');
      const expected: any[] = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
      const actual = await get<any[]>(`/api/timetable/${program}/${branch}`);

      check(`${program}/${branch} course count`, actual.length, expected.length);

      const actualByCode = new Map(actual.map((c) => [c.courseCode, c]));
      for (const course of expected) {
        const got = actualByCode.get(course.courseCode);
        courseCount += 1;
        check(`${program}/${branch} ${course.courseCode} name`, got?.courseName, course.courseName);
        check(`${program}/${branch} ${course.courseCode} credits`, got?.credits, course.credits ?? null);
        check(
          `${program}/${branch} ${course.courseCode} meetings`,
          got?.meetings?.map((m: any) => ({
            type: m.type,
            day: m.day,
            startTime: m.startTime,
            endTime: m.endTime,
            room: m.room,
            instructors: m.instructors,
            recurrence: m.recurrence,
          })),
          (course.meetings ?? []).map((m: any) => ({
            type: m.type,
            day: m.day,
            startTime: m.startTime,
            endTime: m.endTime,
            room: m.room ?? '',
            instructors: m.instructors ?? [],
            recurrence: { type: m.recurrence?.type ?? 'weekly' },
          })),
        );
      }
    }
  }

  console.log(`\n${checks} checks across ${courseCount} courses.`);
  if (failures === 0) {
    console.log('All API responses match the bundled static data.');
  } else {
    console.log(`${failures} mismatch(es).`);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('\nVerification failed:', error instanceof Error ? error.message : error);
  process.exit(1);
});
