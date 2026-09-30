import { pool, query } from '../db';
import { getOfferingsByCodes, type CourseOffering, type TimetableMeeting } from './timetable.repository';

/** How many suggestions one student may have waiting for review at once. */
export const MAX_OPEN_REQUESTS = 10;

// ---------------------------------------------------------------- official timings

/**
 * A meeting's identity for comparison: everything a student sees, nothing they
 * don't (instructors), and order-free. The client fingerprints the same fields.
 */
function meetingKey(meeting: TimetableMeeting): string {
  return [
    meeting.type,
    meeting.day,
    meeting.startTime,
    meeting.endTime,
    (meeting.room ?? '').trim(),
    meeting.recurrence?.type ?? 'weekly',
  ].join('|');
}

export function sameMeetings(a: TimetableMeeting[], b: TimetableMeeting[]): boolean {
  if (a.length !== b.length) return false;
  const left = a.map(meetingKey).sort();
  const right = b.map(meetingKey).sort();
  return left.every((key, index) => key === right[index]);
}

export interface OfficialSchedule {
  courseCode: string;
  courseName: string;
  meetings: TimetableMeeting[];
}

/**
 * Each course code's official meetings, as the timetable shows them.
 *
 * 56 codes have several offerings, one per branch that lists the course. The
 * client merges them and keeps the first offering with the most meetings, in
 * API order; this picks the same one, so the list a student edited is the list
 * they were looking at.
 */
export async function getOfficialSchedules(
  courseCodes: string[],
): Promise<Map<string, OfficialSchedule>> {
  const chosen = new Map<string, CourseOffering>();
  for (const offering of await getOfferingsByCodes(courseCodes)) {
    const current = chosen.get(offering.courseCode);
    if (!current || offering.meetings.length > current.meetings.length) {
      chosen.set(offering.courseCode, offering);
    }
  }

  const schedules = new Map<string, OfficialSchedule>();
  for (const [code, offering] of chosen) {
    schedules.set(code, { courseCode: code, courseName: offering.courseName, meetings: offering.meetings });
  }
  return schedules;
}

// ---------------------------------------------------------------- personal timings

export interface CourseOverride {
  courseCode: string;
  meetings: TimetableMeeting[];
  baseFingerprint: string;
  savedAt: string;
}

const UNDEFINED_TABLE = '42P01';

export async function getOverrides(userId: string): Promise<CourseOverride[]> {
  let rows: Array<{
    course_code: string;
    meetings: TimetableMeeting[];
    base_fingerprint: string;
    saved_at: Date;
  }>;
  try {
    rows = await query(
      `select course_code, meetings, base_fingerprint, saved_at
         from user_course_overrides
        where user_id = $1
        order by course_code`,
      [userId],
    );
  } catch (error) {
    // Every sign-in and session restore reads this. If the API is deployed
    // before migration 009 has run against its database, the table does not
    // exist yet; answering "no overrides" keeps sign-in working through that
    // window instead of failing every login with a 500.
    if ((error as { code?: string }).code === UNDEFINED_TABLE) return [];
    throw error;
  }

  return rows.map((row) => ({
    courseCode: row.course_code,
    meetings: row.meetings,
    baseFingerprint: row.base_fingerprint,
    savedAt: row.saved_at.toISOString(),
  }));
}

/** Replaces the user's whole set of corrections, as the course selection is. */
export async function replaceOverrides(
  userId: string,
  overrides: CourseOverride[],
): Promise<CourseOverride[]> {
  // One insert cannot touch the same row twice, so a repeated code keeps its last entry.
  const byCode = new Map(overrides.map((override) => [override.courseCode, override]));

  const client = await pool.connect();
  try {
    await client.query('begin');
    await client.query('delete from user_course_overrides where user_id = $1', [userId]);
    if (byCode.size > 0) {
      await client.query(
        `insert into user_course_overrides (user_id, course_code, meetings, base_fingerprint, saved_at)
         select $1, o->>'courseCode', o->'meetings', o->>'baseFingerprint', (o->>'savedAt')::timestamptz
           from jsonb_array_elements($2::jsonb) as o`,
        [userId, JSON.stringify([...byCode.values()])],
      );
    }
    await client.query('commit');
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }

  return getOverrides(userId);
}

// ---------------------------------------------------------------- suggestions

export type RequestStatus = 'pending' | 'approved' | 'rejected' | 'withdrawn' | 'superseded';

export interface ChangeRequest {
  id: number;
  courseCode: string;
  courseName: string | null;
  requesterRoll: string;
  note: string | null;
  baseMeetings: TimetableMeeting[];
  proposedMeetings: TimetableMeeting[];
  appliedMeetings: TimetableMeeting[] | null;
  status: RequestStatus;
  createdAt: string;
  decidedAt: string | null;
  decidedByRoll: string | null;
  decisionNote: string | null;
}

interface RequestRow {
  id: number;
  course_code: string;
  course_name: string | null;
  requester_roll: string;
  note: string | null;
  base_meetings: TimetableMeeting[];
  proposed_meetings: TimetableMeeting[];
  applied_meetings: TimetableMeeting[] | null;
  status: RequestStatus;
  created_at: Date;
  decided_at: Date | null;
  decided_by_roll: string | null;
  decision_note: string | null;
}

const REQUEST_COLUMNS = [
  'id', 'course_code', 'course_name', 'requester_roll', 'note', 'base_meetings',
  'proposed_meetings', 'applied_meetings', 'status', 'created_at', 'decided_at',
  'decided_by_roll', 'decision_note',
];

/** The column list, qualified when the query joins another table. */
function requestColumns(alias?: string): string {
  return REQUEST_COLUMNS.map((column) => (alias ? `${alias}.${column}` : column)).join(', ');
}

function toRequest(row: RequestRow): ChangeRequest {
  return {
    id: row.id,
    courseCode: row.course_code,
    courseName: row.course_name,
    requesterRoll: row.requester_roll,
    note: row.note,
    baseMeetings: row.base_meetings,
    proposedMeetings: row.proposed_meetings,
    appliedMeetings: row.applied_meetings,
    status: row.status,
    createdAt: row.created_at.toISOString(),
    decidedAt: row.decided_at?.toISOString() ?? null,
    decidedByRoll: row.decided_by_roll,
    decisionNote: row.decision_note,
  };
}

/**
 * Files a suggestion, or replaces the student's open one for the same course —
 * a second thought should update the first, not queue behind it.
 */
export async function submitRequest(input: {
  userId: string;
  roll: string;
  courseCode: string;
  courseName: string;
  note: string | null;
  baseMeetings: TimetableMeeting[];
  proposedMeetings: TimetableMeeting[];
}): Promise<ChangeRequest | 'too-many'> {
  const [open] = await query<{ n: number }>(
    `select count(*)::int as n
       from course_change_requests
      where requested_by = $1 and status = 'pending' and course_code <> $2`,
    [input.userId, input.courseCode],
  );
  if (open.n >= MAX_OPEN_REQUESTS) return 'too-many';

  const rows = await query<RequestRow>(
    `insert into course_change_requests
       (course_code, course_name, requested_by, requester_roll, note, base_meetings, proposed_meetings)
     values ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb)
     on conflict (requested_by, course_code) where status = 'pending'
     do update set course_name       = excluded.course_name,
                   requester_roll    = excluded.requester_roll,
                   note              = excluded.note,
                   base_meetings     = excluded.base_meetings,
                   proposed_meetings = excluded.proposed_meetings,
                   created_at        = now()
     returning ${requestColumns()}`,
    [
      input.courseCode,
      input.courseName,
      input.userId,
      input.roll,
      input.note,
      JSON.stringify(input.baseMeetings),
      JSON.stringify(input.proposedMeetings),
    ],
  );

  return toRequest(rows[0]);
}

export async function listRequestsByUser(userId: string, limit = 50): Promise<ChangeRequest[]> {
  const rows = await query<RequestRow>(
    `select ${requestColumns()}
       from course_change_requests
      where requested_by = $1
      order by created_at desc
      limit $2`,
    [userId, limit],
  );
  return rows.map(toRequest);
}

/** A student can take back a suggestion only while it is still waiting. */
export async function withdrawRequest(id: number, userId: string): Promise<ChangeRequest | null> {
  const rows = await query<RequestRow>(
    `update course_change_requests
        set status = 'withdrawn', decided_at = now()
      where id = $1 and requested_by = $2 and status = 'pending'
      returning ${requestColumns()}`,
    [id, userId],
  );
  return rows[0] ? toRequest(rows[0]) : null;
}

export interface ReviewItem extends ChangeRequest {
  requesterName: string | null;
  /** Students who currently have the course in their timetable. */
  enrolledCount: number;
  /** Of those, how many have their own timings for it. */
  personalEditCount: number;
  /**
   * The official meetings right now — what approval would replace. Differs
   * from baseMeetings when the timings moved after the suggestion was made.
   */
  currentMeetings: TimetableMeeting[] | null;
}

export async function listForReview(scope: 'pending' | 'decided'): Promise<ReviewItem[]> {
  const pending = scope === 'pending';
  const rows = await query<RequestRow & { requester_name: string | null; enrolled: number; personal_edits: number }>(
    `select ${requestColumns('r')},
            p.name as requester_name,
            -- user_courses stores the bare course code the client selects by.
            (select count(distinct uc.user_id)
               from user_courses uc where uc.offering_id = r.course_code)::int as enrolled,
            (select count(*)
               from user_course_overrides o where o.course_code = r.course_code)::int as personal_edits
       from course_change_requests r
       left join profiles p on p.id = r.requested_by
      where ${pending ? "r.status = 'pending'" : "r.status <> 'pending'"}
      order by ${pending ? 'r.created_at asc' : 'coalesce(r.decided_at, r.created_at) desc'}
      limit 100`,
  );

  const official = pending
    ? await getOfficialSchedules([...new Set(rows.map((row) => row.course_code))])
    : new Map<string, OfficialSchedule>();

  return rows.map((row) => ({
    ...toRequest(row),
    requesterName: row.requester_name,
    enrolledCount: row.enrolled,
    personalEditCount: row.personal_edits,
    currentMeetings: official.get(row.course_code)?.meetings ?? null,
  }));
}

export async function countPending(): Promise<number> {
  const [row] = await query<{ n: number }>(
    "select count(*)::int as n from course_change_requests where status = 'pending'",
  );
  return row.n;
}

export type Decision =
  | { ok: true; request: ChangeRequest; offeringIds: string[]; alsoClosed: number }
  | { ok: false; status: 404 | 409; error: string };

/**
 * Approves a suggestion: its meetings become the official timings of every
 * offering of the course, for everyone who has it, in one transaction.
 *
 * `meetings` lets the reviewer correct the suggestion before applying it.
 */
export async function approveRequest(
  id: number,
  input: { adminRoll: string; note: string | null; meetings?: TimetableMeeting[] },
): Promise<Decision> {
  const client = await pool.connect();
  try {
    await client.query('begin');

    // Locked so two reviewers cannot apply the same suggestion twice.
    const found = await client.query<RequestRow>(
      `select ${requestColumns()} from course_change_requests where id = $1 for update`,
      [id],
    );
    const row = found.rows[0];
    if (!row) {
      await client.query('rollback');
      return { ok: false, status: 404, error: 'No such suggestion.' };
    }
    if (row.status !== 'pending') {
      await client.query('rollback');
      return { ok: false, status: 409, error: `This suggestion was already ${row.status}.` };
    }

    const applied = input.meetings ?? row.proposed_meetings;

    // Every offering of the code, not only the one the student saw: the client
    // merges offerings by code, so one left behind could win the merge with the
    // old timings. Marked 'admin' so a reseed keeps the change.
    const offerings = await client.query<{ id: string }>(
      `update course_offerings
          set source = 'admin', customized_at = now()
        where course_code = $1
        returning id`,
      [row.course_code],
    );
    const offeringIds = offerings.rows.map((offering) => offering.id);
    if (offeringIds.length === 0) {
      await client.query('rollback');
      return { ok: false, status: 404, error: `${row.course_code} is no longer in the timetable.` };
    }

    await client.query('delete from course_meetings where offering_id = any($1::text[])', [offeringIds]);
    // One statement for every offering: a code can have a dozen offerings, and
    // a round trip per row to the database adds up to seconds.
    await client.query(
      `insert into course_meetings
         (offering_id, type, day, start_time, end_time, room, instructors, recurrence, sort_order)
       select o.id,
              e.m->>'type',
              e.m->>'day',
              (e.m->>'startTime')::time,
              (e.m->>'endTime')::time,
              nullif(btrim(e.m->>'room'), ''),
              coalesce(array(select jsonb_array_elements_text(e.m->'instructors')), '{}'::text[]),
              coalesce(e.m->'recurrence'->>'type', 'weekly'),
              (e.ord - 1)::smallint
         from unnest($1::text[]) as o(id)
        cross join jsonb_array_elements($2::jsonb) with ordinality as e(m, ord)`,
      [offeringIds, JSON.stringify(applied)],
    );

    const decided = await client.query<RequestRow>(
      `update course_change_requests
          set status = 'approved', decided_at = now(), decided_by_roll = $2,
              decision_note = $3, applied_meetings = $4::jsonb
        where id = $1
        returning ${requestColumns()}`,
      [id, input.adminRoll, input.note, JSON.stringify(applied)],
    );

    // Other open suggestions for the course were made against the timings just
    // replaced. One proposing the same meetings is the same fix, so it counts
    // as approved; any other would undo this change if approved later, so it
    // is closed and its author can suggest again against the new timings.
    const others = await client.query<{ id: number; proposed_meetings: TimetableMeeting[] }>(
      `select id, proposed_meetings
         from course_change_requests
        where course_code = $1 and status = 'pending' and id <> $2
        for update`,
      [row.course_code, id],
    );
    const duplicates = others.rows
      .filter((other) => sameMeetings(other.proposed_meetings, applied))
      .map((other) => other.id);
    const superseded = others.rows
      .filter((other) => !duplicates.includes(other.id))
      .map((other) => other.id);

    if (duplicates.length > 0) {
      await client.query(
        `update course_change_requests
            set status = 'approved', decided_at = now(), decided_by_roll = $2,
                decision_note = $3, applied_meetings = $4::jsonb
          where id = any($1::bigint[])`,
        [duplicates, input.adminRoll, `Same change as suggestion #${id}.`, JSON.stringify(applied)],
      );
    }
    if (superseded.length > 0) {
      await client.query(
        `update course_change_requests
            set status = 'superseded', decided_at = now(), decided_by_roll = $2, decision_note = $3
          where id = any($1::bigint[])`,
        [
          superseded,
          input.adminRoll,
          `The timings changed with suggestion #${id}. Suggest again if this still applies.`,
        ],
      );
    }

    await client.query('commit');
    return {
      ok: true,
      request: toRequest(decided.rows[0]),
      offeringIds,
      alsoClosed: others.rows.length,
    };
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}

export async function rejectRequest(
  id: number,
  input: { adminRoll: string; note: string | null },
): Promise<Decision> {
  const rows = await query<RequestRow>(
    `update course_change_requests
        set status = 'rejected', decided_at = now(), decided_by_roll = $2, decision_note = $3
      where id = $1 and status = 'pending'
      returning ${requestColumns()}`,
    [id, input.adminRoll, input.note],
  );
  if (rows[0]) return { ok: true, request: toRequest(rows[0]), offeringIds: [], alsoClosed: 0 };

  const existing = await query<{ status: string }>(
    'select status from course_change_requests where id = $1',
    [id],
  );
  return existing[0]
    ? { ok: false, status: 409, error: `This suggestion was already ${existing[0].status}.` }
    : { ok: false, status: 404, error: 'No such suggestion.' };
}
