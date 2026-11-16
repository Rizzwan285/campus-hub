import { WEEK_DAYS, compareMeetings, meetingKey, weekdayOfDate } from './courseTimings';
import type { MeetingDay, TimetableMeeting } from './types';

/**
 * A course's schedule as structure rather than as a slot string.
 *
 * The institute's workbooks say "D [Mon,Wed], E [Fri] + PA5"; this is what
 * that means, in a form an editor can show as dropdowns and day toggles and
 * the importer can fill in without anyone re-reading the text. `expandSchedule`
 * turns it into the concrete weekly meetings the timetable displays.
 *
 * Pure and shared: the admin editor's live preview and the API's publish step
 * both run this exact code, so what the preview shows is what gets published.
 */

export interface SlotTiming {
  day: MeetingDay;
  startTime: string;
  endTime: string;
}

export interface SlotDefinition {
  type: TimetableMeeting['type'];
  timings: SlotTiming[];
}

/** The semester's slot system, keyed by slot code ("A", "PA1", "CMN-A"). */
export type SlotDefinitions = Record<string, SlotDefinition>;

export interface SlotOccurrenceOverride {
  room?: string;
  startTime?: string;
  endTime?: string;
}

export interface SlotAssignment {
  slot: string;
  /** Which of the slot's weekly meetings apply. `null` means all of them. */
  days: MeetingDay[] | null;
  /** Venue for every meeting of this assignment, unless overridden per day. */
  room: string;
  /** Batches this assignment is for, e.g. "B1-B6". Empty means everyone. */
  batches?: string;
  /** Replaces the slot's own time on every selected day ("M (1 pm - 1:50 pm)"). */
  startTime?: string;
  endTime?: string;
  /** Replaces the slot's meeting type ("R1 (Tutorial)"). */
  type?: TimetableMeeting['type'];
  recurrence?: 'weekly' | 'biweekly_odd' | 'biweekly_even';
  /** Per-day exceptions: Monday's B in one room, Thursday's in another. */
  overrides?: Partial<Record<MeetingDay, SlotOccurrenceOverride>>;
  /** A remark from the source that was not interpreted. */
  note?: string;
}

export interface CourseSchedule {
  assignments: SlotAssignment[];
  /** Meetings outside the slot system: any day or date, any time. */
  custom: TimetableMeeting[];
}

export const EMPTY_SCHEDULE: CourseSchedule = { assignments: [], custom: [] };

export interface ScheduleProblem {
  code:
    | 'unknown_slot'
    | 'day_not_in_slot'
    | 'no_days'
    | 'invalid_time'
    | 'invalid_date'
    | 'duplicate_meeting'
    | 'overlap';
  /** `blocking` problems must be fixed before a semester can be published. */
  severity: 'blocking' | 'review';
  message: string;
}

const CLOCK_TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

// ---------------------------------------------------------------- batches

export interface BatchRange {
  min: number;
  max: number;
}

/** "B1-B6, B13-B18" → [{1,6},{13,18}]. A single "B7" is the range 7–7. */
export function parseBatches(text: string | undefined | null): BatchRange[] {
  const ranges: BatchRange[] = [];
  const pattern = /\bB(\d{1,2})(?:\s*-\s*B?(\d{1,2}))?\b/gi;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text ?? '')) !== null) {
    const min = Number(match[1]);
    const max = match[2] === undefined ? min : Number(match[2]);
    if (min >= 1 && max >= min) ranges.push({ min, max });
  }
  return ranges;
}

/** Whether a class marked for `batches` is for this batch. Unmarked classes are for everyone. */
export function batchAllowed(batches: string | undefined | null, batchNo: number): boolean {
  const ranges = parseBatches(batches);
  return ranges.length === 0 || ranges.some((range) => batchNo >= range.min && batchNo <= range.max);
}

function batchesOverlap(a: string | undefined, b: string | undefined): boolean {
  const left = parseBatches(a);
  const right = parseBatches(b);
  if (left.length === 0 || right.length === 0) return true;
  return left.some((x) => right.some((y) => x.min <= y.max && y.min <= x.max));
}

// ---------------------------------------------------------------- expansion

export function findSlot(slots: SlotDefinitions, code: string): [string, SlotDefinition] | null {
  if (slots[code]) return [code, slots[code]];
  const wanted = code.trim().toUpperCase();
  const hit = Object.keys(slots).find((name) => name.toUpperCase() === wanted);
  return hit ? [hit, slots[hit]] : null;
}

export interface ExpandOptions {
  /** Instructors for meetings that do not name their own. */
  instructors?: string[];
}

/**
 * The concrete meetings a schedule produces, in weekly order, with every
 * reason it could not be expanded cleanly. Never invents a meeting: an unknown
 * slot or a day the slot does not meet on yields a problem, not a class.
 */
export function expandSchedule(
  schedule: CourseSchedule,
  slots: SlotDefinitions,
  options: ExpandOptions = {},
): { meetings: TimetableMeeting[]; problems: ScheduleProblem[] } {
  const meetings: TimetableMeeting[] = [];
  const problems: ScheduleProblem[] = [];
  const instructors = options.instructors ?? [];

  for (const assignment of schedule.assignments ?? []) {
    const found = findSlot(slots, assignment.slot);
    if (!found) {
      problems.push({
        code: 'unknown_slot',
        severity: 'blocking',
        message: `Slot ${assignment.slot || '(none chosen)'} is not in this semester's slot system.`,
      });
      continue;
    }
    const [code, definition] = found;
    const slotDays = definition.timings.map((timing) => timing.day);
    const wanted = assignment.days;

    if (wanted) {
      const missing = wanted.filter((day) => !slotDays.includes(day));
      if (missing.length > 0) {
        problems.push({
          code: 'day_not_in_slot',
          severity: 'blocking',
          message: `Slot ${code} does not meet on ${missing.join(', ')}.`,
        });
      }
      if (wanted.length === 0) {
        problems.push({ code: 'no_days', severity: 'blocking', message: `No days are selected for slot ${code}.` });
      }
    }

    for (const timing of definition.timings) {
      if (wanted && !wanted.includes(timing.day)) continue;
      const override = assignment.overrides?.[timing.day] ?? {};
      const startTime = override.startTime ?? assignment.startTime ?? timing.startTime;
      const endTime = override.endTime ?? assignment.endTime ?? timing.endTime;

      if (!CLOCK_TIME.test(startTime) || !CLOCK_TIME.test(endTime) || endTime <= startTime) {
        problems.push({
          code: 'invalid_time',
          severity: 'blocking',
          message: `Slot ${code} on ${timing.day} has an invalid time (${startTime}–${endTime}).`,
        });
        continue;
      }

      const batches = assignment.batches?.trim();
      meetings.push({
        type: assignment.type ?? definition.type,
        day: timing.day,
        startTime,
        endTime,
        room: (override.room ?? assignment.room ?? '').trim(),
        instructors,
        recurrence: { type: assignment.recurrence ?? 'weekly' },
        slot: code,
        ...(batches ? { batches } : {}),
      });
    }
  }

  for (const custom of schedule.custom ?? []) {
    const once = custom.recurrence?.type === 'once';
    let day = custom.day;
    if (once) {
      const weekday = custom.date ? weekdayOfDate(custom.date) : null;
      if (!weekday) {
        problems.push({ code: 'invalid_date', severity: 'blocking', message: 'A one-time class has no valid date.' });
        continue;
      }
      day = weekday;
    }
    if (!CLOCK_TIME.test(custom.startTime) || !CLOCK_TIME.test(custom.endTime) || custom.endTime <= custom.startTime) {
      problems.push({
        code: 'invalid_time',
        severity: 'blocking',
        message: `The extra class on ${custom.date ?? custom.day} has an invalid time.`,
      });
      continue;
    }
    const batches = custom.batches?.trim();
    meetings.push({
      type: custom.type,
      day,
      startTime: custom.startTime,
      endTime: custom.endTime,
      room: (custom.room ?? '').trim(),
      instructors: custom.instructors?.length ? custom.instructors : instructors,
      recurrence: { type: custom.recurrence?.type ?? 'weekly' },
      ...(batches ? { batches } : {}),
      ...(once && custom.date ? { date: custom.date } : {}),
    });
  }

  meetings.sort(compareMeetings);
  problems.push(...meetingConflicts(meetings));
  return { meetings, problems };
}

/** Classes of one course that repeat or overlap for the same students. */
export function meetingConflicts(meetings: TimetableMeeting[]): ScheduleProblem[] {
  const problems: ScheduleProblem[] = [];
  const seen = new Set<string>();

  meetings.forEach((meeting, index) => {
    const key = meetingKey(meeting);
    if (seen.has(key)) {
      problems.push({
        code: 'duplicate_meeting',
        severity: 'blocking',
        message: `${meeting.day} ${meeting.startTime}–${meeting.endTime} is listed twice.`,
      });
      return;
    }
    seen.add(key);

    for (const other of meetings.slice(0, index)) {
      if (other.day !== meeting.day) continue;
      if ((other.date ?? '') !== (meeting.date ?? '') && other.date && meeting.date) continue;
      if (other.endTime <= meeting.startTime || meeting.endTime <= other.startTime) continue;
      if (!batchesOverlap(other.batches, meeting.batches)) continue;
      // Alternate-week classes that take turns in one slot are not a clash.
      const parity = [other.recurrence?.type, meeting.recurrence?.type].sort().join('+');
      if (parity === 'biweekly_even+biweekly_odd') continue;
      if (meetingKey(other) === key) continue;
      problems.push({
        code: 'overlap',
        severity: 'review',
        message:
          `${meeting.day} ${other.startTime}–${other.endTime} and ${meeting.startTime}–${meeting.endTime} ` +
          'overlap for the same students.',
      });
      break;
    }
  });

  return problems;
}

// ---------------------------------------------------------------- inference

/**
 * Rebuilds slot assignments from a plain list of meetings, so a course that
 * only ever existed as meetings (every course from before semesters were
 * managed here) opens in the visual editor as slots rather than as a pile of
 * hand-entered rows. A meeting that matches no slot exactly stays custom.
 */
export function inferSchedule(meetings: TimetableMeeting[], slots: SlotDefinitions): CourseSchedule {
  const byTiming = new Map<string, string[]>();
  for (const [code, definition] of Object.entries(slots)) {
    for (const timing of definition.timings) {
      const key = `${definition.type}|${timing.day}|${timing.startTime}|${timing.endTime}`;
      byTiming.set(key, [...(byTiming.get(key) ?? []), code]);
    }
  }

  const groups = new Map<string, SlotAssignment & { rooms: Map<MeetingDay, string> }>();
  const custom: TimetableMeeting[] = [];

  for (const meeting of meetings) {
    const recurrence = meeting.recurrence?.type ?? 'weekly';
    const codes = byTiming.get(`${meeting.type}|${meeting.day}|${meeting.startTime}|${meeting.endTime}`) ?? [];
    if (codes.length !== 1 || recurrence === 'once' || recurrence === 'custom') {
      custom.push(meeting);
      continue;
    }
    const groupKey = `${codes[0]}|${meeting.batches ?? ''}|${recurrence}`;
    const group = groups.get(groupKey) ?? {
      slot: codes[0],
      days: [],
      room: '',
      ...(meeting.batches ? { batches: meeting.batches } : {}),
      ...(recurrence !== 'weekly' ? { recurrence: recurrence as SlotAssignment['recurrence'] } : {}),
      rooms: new Map<MeetingDay, string>(),
    };
    if (group.rooms.has(meeting.day)) {
      // Two classes in one slot occurrence (parallel rooms): keep it literal.
      custom.push(meeting);
      continue;
    }
    group.rooms.set(meeting.day, (meeting.room ?? '').trim());
    groups.set(groupKey, group);
  }

  const assignments: SlotAssignment[] = [];
  for (const { rooms, ...group } of groups.values()) {
    const days = WEEK_DAYS.filter((day) => rooms.has(day));
    const slotDays = slots[group.slot].timings.map((timing) => timing.day);
    const counts = new Map<string, number>();
    for (const room of rooms.values()) counts.set(room, (counts.get(room) ?? 0) + 1);
    const room = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';
    const overrides: SlotAssignment['overrides'] = {};
    for (const day of days) {
      if (rooms.get(day) !== room) overrides[day] = { room: rooms.get(day) };
    }
    assignments.push({
      ...group,
      days: days.length === slotDays.length ? null : days,
      room,
      ...(Object.keys(overrides).length > 0 ? { overrides } : {}),
    });
  }

  return { assignments, custom };
}

// ---------------------------------------------------------------- semester rules

export interface VenueRule {
  courseCode: string;
  /** Null applies to every meeting type; a typed rule wins over an untyped one. */
  meetingType: TimetableMeeting['type'] | null;
  batchMin: number;
  batchMax: number;
  room: string;
}

/**
 * The semester-specific rules that used to be hardcoded in the timetable
 * store: which core courses each first-year batch takes, and the rooms that
 * replace a batch-range room string.
 */
export interface SemesterConfig {
  firstYear?: {
    /** Core courses no first-year batch takes this semester. */
    excludedCodes?: string[];
    /** Batch ranges and the core courses each one does *not* take. */
    cohorts?: Array<{ batchMin: number; batchMax: number; excludedCodes: string[] }>;
    /** Extra courses added for a branch, e.g. { DS: ['DS1010'] }. */
    extraByBranch?: Record<string, string[]>;
  };
  venueRules?: VenueRule[];
}

/** Aug–Dec 2026, as the store hardcoded it. Used whenever the API sends no rules. */
export const DEFAULT_SEMESTER_CONFIG: SemesterConfig = {
  firstYear: {
    excludedCodes: ['BT2010'],
    cohorts: [
      { batchMin: 1, batchMax: 12, excludedCodes: ['CY1140', 'EE1110'] },
      { batchMin: 13, batchMax: 24, excludedCodes: ['PH1130', 'ME1150'] },
    ],
    extraByBranch: { DS: ['DS1010'] },
  },
  venueRules: [
    { courseCode: 'PH1030', meetingType: null, batchMin: 1, batchMax: 6, room: 'C06-105' },
    { courseCode: 'PH1030', meetingType: null, batchMin: 7, batchMax: 12, room: 'C06-106' },
    { courseCode: 'PH1030', meetingType: null, batchMin: 13, batchMax: 18, room: 'C06-107' },
    { courseCode: 'PH1030', meetingType: null, batchMin: 19, batchMax: 999, room: 'C06-104' },
    { courseCode: 'MA1011A', meetingType: null, batchMin: 1, batchMax: 6, room: 'C06-105' },
    { courseCode: 'MA1011A', meetingType: null, batchMin: 7, batchMax: 12, room: 'C06-106' },
    { courseCode: 'MA1011A', meetingType: null, batchMin: 13, batchMax: 18, room: 'C06-107' },
    { courseCode: 'MA1011A', meetingType: null, batchMin: 19, batchMax: 999, room: 'C06-104' },
    { courseCode: 'ES1010', meetingType: null, batchMin: 1, batchMax: 11, room: 'N203' },
    { courseCode: 'ES1010', meetingType: null, batchMin: 12, batchMax: 18, room: 'N305' },
    { courseCode: 'ES1010', meetingType: null, batchMin: 19, batchMax: 999, room: 'C06-104' },
    { courseCode: 'ME1130', meetingType: 'lab', batchMin: 1, batchMax: 999, room: 'A01-112 (Drawing Hall)' },
    { courseCode: 'ME1130', meetingType: null, batchMin: 1, batchMax: 5, room: 'C06-105' },
    { courseCode: 'ME1130', meetingType: null, batchMin: 6, batchMax: 10, room: 'C06-106' },
    { courseCode: 'ME1130', meetingType: null, batchMin: 11, batchMax: 15, room: 'C06-107' },
    { courseCode: 'ME1130', meetingType: null, batchMin: 16, batchMax: 20, room: 'C06-104' },
    { courseCode: 'ME1130', meetingType: null, batchMin: 21, batchMax: 999, room: 'N305' },
    { courseCode: 'ID1050A', meetingType: 'lab', batchMin: 1, batchMax: 999, room: 'Nila CS-Lab' },
    { courseCode: 'ID1050A', meetingType: null, batchMin: 1, batchMax: 999, room: 'A01-007' },
    { courseCode: 'ME1150', meetingType: null, batchMin: 1, batchMax: 999, room: 'D-03 Workshop' },
    { courseCode: 'EE1110', meetingType: null, batchMin: 1, batchMax: 999, room: 'C06-105 + C06 Electronics Lab' },
    { courseCode: 'PH1130', meetingType: null, batchMin: 1, batchMax: 999, room: 'A01 Physics Lab' },
    { courseCode: 'CY1140', meetingType: null, batchMin: 1, batchMax: 999, room: 'A01 Chemistry Lab' },
    { courseCode: 'GN1003', meetingType: null, batchMin: 1, batchMax: 999, room: 'N-203/204 & Nila CS Lab' },
  ],
};

/** The room a venue rule gives a batch for one class, or null when no rule applies. */
export function venueFor(
  config: SemesterConfig,
  courseCode: string,
  meetingType: string,
  batchNo: number,
): string | null {
  const rules = (config.venueRules ?? []).filter(
    (rule) => rule.courseCode === courseCode && batchNo >= rule.batchMin && batchNo <= rule.batchMax,
  );
  return (
    rules.find((rule) => rule.meetingType === meetingType)?.room ??
    rules.find((rule) => rule.meetingType === null)?.room ??
    null
  );
}

/** Core courses a first-year batch does not take, per the semester's rules. */
export function firstYearExclusions(config: SemesterConfig, batchNo: number | null): string[] {
  const rules = config.firstYear ?? {};
  const cohort = batchNo
    ? (rules.cohorts ?? []).find((entry) => batchNo >= entry.batchMin && batchNo <= entry.batchMax)
    : undefined;
  return [...(rules.excludedCodes ?? []), ...(cohort?.excludedCodes ?? [])];
}
