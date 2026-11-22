import type { CourseOffering, MeetingDay, TimetableMeeting } from '@/engine/types';
import { firstYearBatch } from './academicProfile';
import { calendarDateKey } from './calendarDate';

/**
 * What a downloaded timetable contains, worked out once and drawn twice (PDF
 * and Excel). It is the semester's repeating week, not the week on screen: a
 * holiday this Thursday must not leave Thursday empty in a file someone keeps
 * until the end of term.
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
const ALWAYS_SHOWN = 5; // Monday–Friday, as the weekly grid does.

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
  /** Side-by-side position among classes that overlap it, and how many share the width. */
  lane: number;
  lanes: number;
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
  credits: string;
  category: string;
  instructors: string[];
  /** One line per weekly class, e.g. "Mon 09:00-09:50 · Lecture · LHC 101". */
  sessions: string[];
  color: Rgb;
  /** The student's own timings rather than the official ones. */
  isPersonal: boolean;
}

export interface TimetableExport {
  /** The semester's name, or a plain title when it is not known. */
  title: string;
  studentName: string;
  /** e.g. "UG · CSE · Year 1 · Batch B5" */
  studentDetail: string;
  generatedLabel: string;
  days: MeetingDay[];
  /** Whole hours bounding every class, in minutes from midnight. */
  startMin: number;
  endMin: number;
  classes: ExportClass[];
  oneOff: ExportOneOff[];
  courses: ExportCourse[];
  /** How many columns each day needs for its overlapping classes (at least 1). */
  dayLanes: Record<string, number>;
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
  now: Date;
}

const toMinutes = (time: string): number | null => {
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

/**
 * Gives overlapping classes of one day their own lanes, so two classes at the
 * same time sit side by side instead of one hiding the other.
 */
function assignLanes(dayClasses: ExportClass[]): number {
  const sorted = [...dayClasses].sort((a, b) => a.start - b.start || a.end - b.end);
  let dayMax = 1;
  let cluster: ExportClass[] = [];
  let clusterEnd = -1;
  let laneEnds: number[] = [];

  const closeCluster = () => {
    const lanes = Math.max(1, laneEnds.length);
    cluster.forEach((item) => { item.lanes = lanes; });
    dayMax = Math.max(dayMax, lanes);
    cluster = [];
    laneEnds = [];
  };

  for (const item of sorted) {
    if (cluster.length > 0 && item.start >= clusterEnd) closeCluster();
    let lane = laneEnds.findIndex((end) => end <= item.start);
    if (lane === -1) lane = laneEnds.length;
    laneEnds[lane] = item.end;
    item.lane = lane;
    cluster.push(item);
    clusterEnd = Math.max(clusterEnd, item.end);
  }
  if (cluster.length > 0) closeCluster();
  return dayMax;
}

const slug = (text: string) =>
  text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

export function buildTimetableExport({ courses, profile, semesterName, now }: ExportInput): TimetableExport {
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
        lane: 0,
        lanes: 1,
      });
    }

    mine.sort((a, b) => DAY_ORDER.indexOf(a.day) - DAY_ORDER.indexOf(b.day) || a.start - b.start);
    classes.push(...mine);

    courseRows.push({
      courseCode: course.courseCode,
      courseName: course.courseName,
      credits: course.credits ?? '',
      category: course.category ?? '',
      instructors: [...instructors],
      sessions: mine.map(
        (item) =>
          `${item.day.slice(0, 3)} ${item.startTime}-${item.endTime} · ${item.typeLabel} · ${item.room}` +
          (item.alternate ? ' · alternate weeks' : ''),
      ),
      color,
      isPersonal: course.isPersonal === true,
    });
  });

  const days = DAY_ORDER.filter(
    (day, index) => index < ALWAYS_SHOWN || classes.some((item) => item.day === day),
  );

  const dayLanes: Record<string, number> = {};
  for (const day of days) {
    dayLanes[day] = assignLanes(classes.filter((item) => item.day === day));
  }

  const earliest = classes.length ? Math.min(...classes.map((item) => item.start)) : 8 * 60;
  const latest = classes.length ? Math.max(...classes.map((item) => item.end)) : 18 * 60;

  oneOff.sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime));

  const title = semesterName?.trim() || 'Weekly timetable';

  return {
    title,
    studentName: profile?.name?.trim() ?? '',
    studentDetail: studentDetail(profile),
    generatedLabel: dateLabel(now),
    days,
    startMin: Math.floor(earliest / 60) * 60,
    endMin: Math.ceil(latest / 60) * 60,
    classes,
    oneOff,
    courses: courseRows,
    dayLanes,
    fileBase: `timetable-${slug(semesterName?.trim() || '') || calendarDateKey(now)}`,
  };
}

/** Where a class sits within its day, as a fraction of the day's width. */
export function laneSpan(item: ExportClass): { offset: number; width: number } {
  return { offset: item.lane / item.lanes, width: 1 / item.lanes };
}
