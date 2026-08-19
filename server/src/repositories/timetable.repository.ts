import { query } from '../db';

export interface TimetableMeeting {
  type: string;
  day: string;
  startTime: string;
  endTime: string;
  room: string;
  instructors: string[];
  recurrence: { type: string };
}

export interface CourseOffering {
  /**
   * The bare course code, matching what the JSON files used to expose.
   * Kept as-is so course ids persisted in a user's localStorage stay valid.
   */
  id: string;
  /** Globally unique key: `${program}_${branch}_${courseCode}`. */
  offeringId: string;
  program: string;
  branch: string;
  courseCode: string;
  courseName: string;
  credits: string | null;
  category: string | null;
  rawSlot: string | null;
  meetings: TimetableMeeting[];
}

interface OfferingRow {
  id: string;
  program: string;
  branch: string;
  course_code: string;
  course_name: string;
  credits: string | null;
  category: string | null;
  raw_slot: string | null;
}

interface MeetingRow {
  offering_id: string;
  type: string;
  day: string;
  start_time: string;
  end_time: string;
  room: string | null;
  instructors: string[];
  recurrence: string;
}

async function buildOfferings(
  where: string,
  params: unknown[],
): Promise<CourseOffering[]> {
  const offerings = await query<OfferingRow>(
    `select id, program, branch, course_code, course_name, credits, category, raw_slot
       from course_offerings
      ${where}
      order by program, branch, course_code`,
    params,
  );

  if (offerings.length === 0) return [];

  const ids = offerings.map((row) => row.id);
  const meetings = await query<MeetingRow>(
    `select offering_id,
            type,
            day,
            to_char(start_time, 'HH24:MI') as start_time,
            to_char(end_time,   'HH24:MI') as end_time,
            room,
            instructors,
            recurrence
       from course_meetings
      where offering_id = any($1::text[])
      order by offering_id, sort_order`,
    [ids],
  );

  const byOffering = new Map<string, TimetableMeeting[]>();
  for (const row of meetings) {
    const list = byOffering.get(row.offering_id) ?? [];
    list.push({
      type: row.type,
      day: row.day,
      startTime: row.start_time,
      endTime: row.end_time,
      room: row.room ?? '',
      instructors: row.instructors ?? [],
      recurrence: { type: row.recurrence },
    });
    byOffering.set(row.offering_id, list);
  }

  return offerings.map((row) => ({
    id: row.course_code,
    offeringId: row.id,
    program: row.program,
    branch: row.branch,
    courseCode: row.course_code,
    courseName: row.course_name,
    credits: row.credits,
    category: row.category,
    rawSlot: row.raw_slot,
    meetings: byOffering.get(row.id) ?? [],
  }));
}

export async function getCoursesByBranch(program: string, branch: string) {
  return buildOfferings('where program = $1 and branch = $2', [program, branch]);
}

export async function getAllCourses() {
  return buildOfferings('', []);
}

export async function getBranches(): Promise<Record<string, string[]>> {
  const rows = await query<{ program: string; branch: string }>(
    'select distinct program, branch from course_offerings order by program, branch',
  );

  const grouped: Record<string, string[]> = {};
  for (const row of rows) {
    (grouped[row.program] ??= []).push(row.branch);
  }

  return grouped;
}

export async function getMetadata(): Promise<Record<string, unknown>> {
  const rows = await query<{ key: string; value: unknown }>(
    'select key, value from timetable_metadata',
  );

  return Object.fromEntries(rows.map((row) => [row.key, row.value]));
}

export interface VenueOverride {
  courseCode: string;
  meetingType: string | null;
  batchMin: number;
  batchMax: number;
  room: string;
}

export async function getVenueOverrides(): Promise<VenueOverride[]> {
  const rows = await query<{
    course_code: string;
    meeting_type: string | null;
    batch_min: number;
    batch_max: number;
    room: string;
  }>(
    `select course_code, meeting_type, batch_min, batch_max, room
       from venue_overrides
      order by course_code, meeting_type nulls last, batch_min`,
  );

  return rows.map((row) => ({
    courseCode: row.course_code,
    meetingType: row.meeting_type,
    batchMin: row.batch_min,
    batchMax: row.batch_max,
    room: row.room,
  }));
}

/**
 * Resolves the room for a course/meeting/batch combination.
 * A rule naming a meeting type wins over a rule that applies to any type,
 * matching the early return for labs in the original client-side function.
 */
export async function resolveVenue(
  courseCode: string,
  meetingType: string | null,
  batchNo: number,
): Promise<string | null> {
  const rows = await query<{ room: string }>(
    `select room
       from venue_overrides
      where course_code = $1
        and (meeting_type is null or meeting_type = $2)
        and $3 between batch_min and batch_max
      order by (meeting_type is not null) desc
      limit 1`,
    [courseCode, meetingType, batchNo],
  );

  return rows[0]?.room ?? null;
}
