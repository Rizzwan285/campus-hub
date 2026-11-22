import type { CourseOffering, MeetingDay, TimetableMeeting } from '@/engine/types';
import { findSlot, type SlotDefinitions } from '@/engine/courseSchedule';
import { firstYearBatch } from './academicProfile';
import { calendarDateKey } from './calendarDate';

/**
 * What a downloaded timetable contains, worked out once and drawn twice (PDF
 * and Excel). It is the semester's repeating week, not the week on screen: a
 * holiday this Thursday must not leave Thursday empty in a file someone keeps
 * until the end of term.
 *
 * The week is laid out like the institute's slot system sheet: days down the
 * side, slot times across the top, one table for Monday/Wednesday/Friday and
 * another for Tuesday/Thursday, whose slots run to different times.
 */

export type Rgb = [number, number, number];

/**
 * One colour per course so the same course reads as the same block on every
 * day. Flat and muted on purpose; the first is the app's own blue.
 */
export const COURSE_PALETTE: Rgb[] = [
  [37, 99, 235],
  [13, 148, 136],
  [217, 119, 6],
  [225, 29, 72],
  [124, 58, 237],
  [22, 163, 74],
  [2, 132, 199],
  [234, 88, 12],
  [192, 38, 211],
  [71, 85, 105],
];

/** A colour mixed towards white (amount 0–1), for a block's fill. */
export const tint = ([r, g, b]: Rgb, amount: number): Rgb => [
  Math.round(r + (255 - r) * amount),
  Math.round(g + (255 - g) * amount),
  Math.round(b + (255 - b) * amount),
];

/** A colour mixed towards black (amount 0–1), for text on its own tint. */
export const shade = ([r, g, b]: Rgb, amount: number): Rgb => [
  Math.round(r * (1 - amount)),
  Math.round(g * (1 - amount)),
  Math.round(b * (1 - amount)),
];

const DAY_ORDER: MeetingDay[] = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

/** The slot system's two weekday patterns, each its own table, as on the institute's sheet. */
const WEEKDAY_TABLES: MeetingDay[][] = [
  ['Monday', 'Wednesday', 'Friday'],
  ['Tuesday', 'Thursday'],
];
const WEEKEND: MeetingDay[] = ['Saturday', 'Sunday'];

/** The sheet's lunch column. */
const LUNCH_START = 13 * 60;
const LUNCH_END = 13 * 60 + 50;
/** A gap between two slot columns at least this long gets a column of its own. */
const BREAK_MINUTES = 40;

const TYPE_LABEL: Record<TimetableMeeting['type'], string> = {
  lecture: 'Lecture',
  lab: 'Lab',
  tutorial: 'Tutorial',
};

export interface ExportClass {
  courseCode: string;
  courseName: string;
  type: TimetableMeeting['type'];
  typeLabel: string;
  day: MeetingDay;
  /** Minutes from midnight. */
  start: number;
  end: number;
  startTime: string;
  endTime: string;
  room: string;
  instructors: string[];
  /** A class every other week rather than every week. */
  alternate: boolean;
  color: Rgb;
  /** The slot-system slot this class is in ("F", "PA2"); null for a class outside the slots. */
  slot: string | null;
}

export interface ExportOneOff {
  courseCode: string;
  courseName: string;
  typeLabel: string;
  /** YYYY-MM-DD */
  date: string;
  dateLabel: string;
  startTime: string;
  endTime: string;
  room: string;
  color: Rgb;
}

export interface ExportCourse {
  courseCode: string;
  courseName: string;
  /** The course's slots in the course lists' notation, e.g. "F + I [Fri]"; empty when none. */
  slot: string;
  credits: string;
  category: string;
  instructors: string[];
  /** One line per weekly class, e.g. "Mon 09:00-09:50 · Lecture · LHC 101". */
  sessions: string[];
  color: Rgb;
  /** The student's own timings rather than the official ones. */
  isPersonal: boolean;
}

/** One time column of a table. */
export interface GridColumn {
  /** Minutes from midnight. */
  start: number;
  end: number;
  startTime: string;
  endTime: string;
  /** A gap in the slot system, drawn shaded: the sheet's lunch column, or another long break. */
  kind: 'slot' | 'lunch' | 'break';
}

/** A class in its table: the columns it covers and its row within the day. */
export interface GridPlacement {
  item: ExportClass;
  /** First and last column it covers, inclusive. */
  first: number;
  last: number;
  /** Classes that would share a cell are stacked; this is its row within the day, from 0. */
  lane: number;
  /** "09:00-11:45" when its time is not what the column headings say; null when it is. */
  ownTime: string | null;
}

export interface GridDay {
  day: MeetingDay;
  /** How many stacked rows the day needs (at least 1). */
  lanes: number;
  placements: GridPlacement[];
}

export interface GridTable {
  days: GridDay[];
  columns: GridColumn[];
}

export interface TimetableExport {
  /** The semester's name, or a plain title when it is not known. */
  title: string;
  studentName: string;
  /** e.g. "UG · CSE · Year 1 · Batch B5" */
  studentDetail: string;
  generatedLabel: string;
  /** Monday/Wednesday/Friday, Tuesday/Thursday, then the weekend when it has classes. */
  tables: GridTable[];
  /** Every weekly class, in week order. */
  classes: ExportClass[];
  oneOff: ExportOneOff[];
  courses: ExportCourse[];
  fileBase: string;
}

export interface ExportProfile {
  name?: string | null;
  program?: string | null;
  branch?: string | null;
  yearOfStudy?: string | null;
  batchNo?: string | null;
}

export interface ExportInput {
  courses: CourseOffering[];
  profile?: ExportProfile | null;
  semesterName?: string | null;
  /** The semester's slot system. Without it the columns are plain hours and no slots are named. */
  slots?: SlotDefinitions | null;
  now: Date;
}

const toMinutes = (time: string | undefined | null): number | null => {
  const match = /^(\d{1,2}):(\d{2})$/.exec(time?.trim() ?? '');
  if (!match) return null;
  const minutes = Number(match[1]) * 60 + Number(match[2]);
  return minutes >= 0 && minutes <= 24 * 60 ? minutes : null;
};

export const formatMinutes = (minutes: number): string =>
  `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

const dateLabel = (date: Date, withWeekday = false): string =>
  date.toLocaleDateString('en-GB', {
    ...(withWeekday ? { weekday: 'short' } : {}),
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

function parseDateKey(key: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return calendarDateKey(date) === key ? date : null;
}

function studentDetail(profile?: ExportProfile | null): string {
  if (!profile) return '';
  const parts: string[] = [];
  if (profile.program) parts.push(profile.program);
  if (profile.branch) parts.push(profile.branch);
  if (profile.yearOfStudy) parts.push(`Year ${profile.yearOfStudy}`);
  if (profile.program === 'UG' && profile.yearOfStudy === '1') {
    const batch = firstYearBatch(profile.batchNo);
    if (batch) parts.push(`Batch B${batch}`);
  }
  return parts.join(' · ');
}

// ---------------------------------------------------------------- slots

const slotTimes = (slots: SlotDefinitions, code: string) =>
  (slots[code]?.timings ?? []).map((timing) => ({
    day: timing.day,
    start: toMinutes(timing.startTime),
    end: toMinutes(timing.endTime),
  }));

/**
 * The slot a class is in. A slot the data names is believed when the class is
 * at that slot's time, and, for the official timetable, also when it is only
 * moved within the slot's day (the sheets say "H (9-9:55)"). A student's own
 * timings keep the slot of the class they edited, so for them, and for data
 * that names no slot, the slot is the one whose time this is exactly.
 */
function slotOf(
  meeting: TimetableMeeting,
  start: number,
  end: number,
  slots: SlotDefinitions,
  personal: boolean,
): string | null {
  const at = (code: string) => slotTimes(slots, code).some((t) => t.day === meeting.day && t.start === start && t.end === end);
  const named = meeting.slot?.trim();
  if (named) {
    const code = findSlot(slots, named)?.[0] ?? null;
    if (code && at(code)) return code;
    if (!personal) {
      if (!code) return named;
      if (slotTimes(slots, code).some((t) => t.day === meeting.day)) return code;
    }
  }

  const matches = Object.keys(slots).filter(at);
  if (matches.length === 1) return matches[0];
  const sameKind = matches.filter((code) => (slots[code].type === 'lab') === (meeting.type === 'lab'));
  return sameKind.length === 1 ? sameKind[0] : null;
}

const shortDay = (day: MeetingDay) => day.slice(0, 3);

/**
 * A course's slots as the institute's course lists write them: lecture slots,
 * then labs, each in the order the week meets them, with the days in brackets
 * when the course uses only some of a slot's days ("F + I [Fri]").
 */
function courseSlotCode(classes: ExportClass[], slots: SlotDefinitions): string {
  const used = new Map<string, Set<MeetingDay>>();
  for (const item of classes) {
    if (!item.slot) continue;
    used.set(item.slot, (used.get(item.slot) ?? new Set()).add(item.day));
  }
  const isLab = (code: string) => slots[code]?.type === 'lab';
  return [...used.keys()]
    .sort((a, b) => Number(isLab(a)) - Number(isLab(b)))
    .map((code) => {
      const slotDays = new Set(slotTimes(slots, code).map((t) => t.day));
      const days = DAY_ORDER.filter((day) => used.get(code)!.has(day));
      const partial = slotDays.size > 0 && days.length < slotDays.size;
      return partial ? `${code} [${days.map(shortDay).join(', ')}]` : code;
    })
    .join(' + ');
}

// ---------------------------------------------------------------- columns

const column = (start: number, end: number, kind: GridColumn['kind'] = 'slot'): GridColumn => ({
  start,
  end,
  startTime: formatMinutes(start),
  endTime: formatMinutes(end),
  kind,
});

/**
 * The columns of one table, from the slot system: a time becomes a column when
 * it recurs across the table's days (09:00-09:50 is a slot on Monday, Wednesday
 * and Friday). A time only one day has, like Wednesday's Q at 14:00-14:50,
 * goes in the columns it falls within, as on the sheet. Labs span columns.
 */
function slotColumns(slots: SlotDefinitions, days: MeetingDay[]): GridColumn[] {
  const seen = new Map<string, { start: number; end: number; days: Set<MeetingDay> }>();
  for (const [code, definition] of Object.entries(slots)) {
    if (definition.type === 'lab') continue;
    for (const time of slotTimes(slots, code)) {
      if (!days.includes(time.day) || time.start === null || time.end === null || time.end <= time.start) continue;
      const key = `${time.start}-${time.end}`;
      const entry = seen.get(key) ?? { start: time.start, end: time.end, days: new Set<MeetingDay>() };
      entry.days.add(time.day);
      seen.set(key, entry);
    }
  }

  const needed = Math.min(2, days.length);
  const accepted: Array<{ start: number; end: number }> = [];
  [...seen.values()]
    .filter((entry) => entry.days.size >= needed)
    .sort((a, b) => b.days.size - a.days.size || a.end - a.start - (b.end - b.start) || a.start - b.start)
    .forEach((entry) => {
      if (!accepted.some((other) => other.start < entry.end && entry.start < other.end)) accepted.push(entry);
    });
  return accepted.sort((a, b) => a.start - b.start).map((entry) => column(entry.start, entry.end));
}

/** Plain hours, for a semester whose slot system is not known. */
function hourColumns(): GridColumn[] {
  return Array.from({ length: 10 }, (_, index) => column((8 + index) * 60, (9 + index) * 60));
}

/** Adds the lunch column, and hours before or after the slots for classes that fall there. */
function completeColumns(base: GridColumn[], classes: ExportClass[]): GridColumn[] {
  const columns: GridColumn[] = [];
  base.forEach((current, index) => {
    columns.push(current);
    const next = base[index + 1];
    if (!next || next.start - current.end < BREAK_MINUTES) return;
    const lunch = current.end <= LUNCH_START && next.start >= LUNCH_END;
    columns.push(lunch ? column(LUNCH_START, LUNCH_END, 'lunch') : column(current.end, next.start, 'break'));
  });

  if (classes.length === 0) return columns;
  const earliest = Math.min(...classes.map((item) => item.start));
  const latest = Math.max(...classes.map((item) => item.end));

  const before: GridColumn[] = [];
  for (let edge = columns[0].start; earliest < edge; ) {
    const start = edge % 60 === 0 ? edge - 60 : edge - (edge % 60);
    before.unshift(column(start, edge));
    edge = start;
  }
  const after: GridColumn[] = [];
  for (let edge = columns[columns.length - 1].end; latest > edge; ) {
    const end = Math.min(24 * 60, edge % 60 === 0 ? edge + 60 : edge + (60 - (edge % 60)));
    after.push(column(edge, end));
    if (end === edge) break;
    edge = end;
  }
  return [...before, ...columns, ...after];
}

/**
 * The columns a class covers: each column it fills at least half of. A class
 * that fills none (Wednesday's R3, 15:00-15:50, straddles two) goes in the one
 * it overlaps most, or failing that the nearest.
 */
export function columnSpan(columns: GridColumn[], start: number, end: number): { first: number; last: number } {
  const overlap = columns.map((c) => Math.max(0, Math.min(end, c.end) - Math.max(start, c.start)));
  const hits = columns.map((c, index) => index).filter((index) => overlap[index] * 2 >= columns[index].end - columns[index].start);
  if (hits.length > 0) return { first: Math.min(...hits), last: Math.max(...hits) };

  let best = 0;
  columns.forEach((c, index) => {
    const distance = (col: GridColumn) => Math.abs((col.start + col.end) / 2 - (start + end) / 2);
    if (overlap[index] > overlap[best] || (overlap[index] === overlap[best] && distance(c) < distance(columns[best]))) {
      best = index;
    }
  });
  return { first: best, last: best };
}

/** Whether no class in the table falls in this column (an empty lunch column is drawn as one cell). */
export function columnIsEmpty(table: GridTable, index: number): boolean {
  return !table.days.some((day) => day.placements.some((p) => p.first <= index && index <= p.last));
}

function placeDay(day: MeetingDay, classes: ExportClass[], columns: GridColumn[]): GridDay {
  const placements: GridPlacement[] = classes
    .filter((item) => item.day === day)
    .map((item) => {
      const { first, last } = columnSpan(columns, item.start, item.end);
      const asHeaded = item.start === columns[first].start && item.end === columns[last].end;
      return { item, first, last, lane: 0, ownTime: asHeaded ? null : `${item.startTime}-${item.endTime}` };
    })
    .sort((a, b) => a.first - b.first || b.last - a.last || a.item.start - b.item.start);

  // Two classes in the same cell, a clash or alternate weeks, sit one above the other.
  const laneEnds: number[] = [];
  for (const placement of placements) {
    let lane = laneEnds.findIndex((last) => last < placement.first);
    if (lane === -1) lane = laneEnds.length;
    laneEnds[lane] = placement.last;
    placement.lane = lane;
  }
  return { day, lanes: Math.max(1, laneEnds.length), placements };
}

function buildTables(classes: ExportClass[], slots: SlotDefinitions | null): GridTable[] {
  const fromSlots = (days: MeetingDay[]) => {
    const columns = slots ? slotColumns(slots, days) : [];
    return columns.length >= 2 ? columns : hourColumns();
  };
  const groups: Array<{ days: MeetingDay[]; base: GridColumn[] }> = WEEKDAY_TABLES.map((days) => ({
    days,
    base: fromSlots(days),
  }));
  // Saturday and Sunday have no slots; an extra class there is laid out on the Monday pattern.
  const weekend = WEEKEND.filter((day) => classes.some((item) => item.day === day));
  if (weekend.length > 0) groups.push({ days: weekend, base: groups[0].base });

  return groups.map(({ days, base }) => {
    const mine = classes.filter((item) => days.includes(item.day));
    const columns = completeColumns(base, mine);
    return { columns, days: days.map((day) => placeDay(day, mine, columns)) };
  });
}

const slug = (text: string) =>
  text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

export function buildTimetableExport({ courses, profile, semesterName, slots, now }: ExportInput): TimetableExport {
  const definitions = slots && Object.keys(slots).length > 0 ? slots : null;
  const ordered = [...courses].sort((a, b) => a.courseCode.localeCompare(b.courseCode));
  const todayKey = calendarDateKey(now);

  const classes: ExportClass[] = [];
  const oneOff: ExportOneOff[] = [];
  const courseRows: ExportCourse[] = [];

  ordered.forEach((course, courseIndex) => {
    const color = COURSE_PALETTE[courseIndex % COURSE_PALETTE.length];
    const instructors = new Set<string>();
    const mine: ExportClass[] = [];

    for (const meeting of course.meetings ?? []) {
      const start = toMinutes(meeting.startTime);
      const end = toMinutes(meeting.endTime);
      if (start === null || end === null || end <= start) continue;
      const room = meeting.room?.trim() || 'TBA';
      const typeLabel = TYPE_LABEL[meeting.type] ?? 'Class';
      const kind = meeting.recurrence?.type ?? 'weekly';

      if (kind === 'once') {
        // A single extra class: listed with its date while it is still ahead.
        const date = meeting.date ? parseDateKey(meeting.date) : null;
        if (!date || meeting.date! < todayKey) continue;
        (meeting.instructors ?? []).forEach((name) => name?.trim() && instructors.add(name.trim()));
        oneOff.push({
          courseCode: course.courseCode,
          courseName: course.courseName,
          typeLabel,
          date: meeting.date!,
          dateLabel: dateLabel(date, true),
          startTime: formatMinutes(start),
          endTime: formatMinutes(end),
          room,
          color,
        });
        continue;
      }

      // `custom` has no calendar behind it anywhere in the app; it never shows.
      if (kind === 'custom' || !DAY_ORDER.includes(meeting.day)) continue;
      (meeting.instructors ?? []).forEach((name) => name?.trim() && instructors.add(name.trim()));

      mine.push({
        courseCode: course.courseCode,
        courseName: course.courseName,
        type: meeting.type,
        typeLabel,
        day: meeting.day,
        start,
        end,
        startTime: formatMinutes(start),
        endTime: formatMinutes(end),
        room,
        instructors: (meeting.instructors ?? []).map((name) => name?.trim()).filter(Boolean),
        alternate: kind === 'biweekly_odd' || kind === 'biweekly_even',
        color,
        slot: definitions
          ? slotOf(meeting, start, end, definitions, course.isPersonal === true)
          : meeting.slot?.trim() || null,
      });
    }

    mine.sort((a, b) => DAY_ORDER.indexOf(a.day) - DAY_ORDER.indexOf(b.day) || a.start - b.start);
    classes.push(...mine);

    courseRows.push({
      courseCode: course.courseCode,
      courseName: course.courseName,
      slot: courseSlotCode(mine, definitions ?? {}),
      credits: course.credits ?? '',
      category: course.category ?? '',
      instructors: [...instructors],
      sessions: mine.map(
        (item) =>
          `${shortDay(item.day)} ${item.startTime}-${item.endTime} · ${item.typeLabel} · ${item.room}` +
          (item.alternate ? ' · alternate weeks' : ''),
      ),
      color,
      isPersonal: course.isPersonal === true,
    });
  });

  classes.sort((a, b) => DAY_ORDER.indexOf(a.day) - DAY_ORDER.indexOf(b.day) || a.start - b.start || a.end - b.end);
  oneOff.sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime));

  return {
    title: semesterName?.trim() || 'Weekly timetable',
    studentName: profile?.name?.trim() ?? '',
    studentDetail: studentDetail(profile),
    generatedLabel: dateLabel(now),
    tables: buildTables(classes, definitions),
    classes,
    oneOff,
    courses: courseRows,
    fileBase: `timetable-${slug(semesterName?.trim() || '') || calendarDateKey(now)}`,
  };
}
