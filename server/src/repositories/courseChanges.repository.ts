import crypto from 'crypto';
import type { PoolClient } from 'pg';
import { pool, query } from '../db';
import {
  applyDelta,
  changeKind,
  deltaBetween,
  meetingsFingerprint,
  sameMeetings,
  type ChangeKind,
  type MeetingDelta,
} from '../../../src/engine/courseTimings';
import type { TimetableMeeting as EngineMeeting } from '../../../src/engine/types';
import { getOfferingsByCodes, type CourseOffering, type TimetableMeeting } from './timetable.repository';
import { INSERT_MEETINGS_SQL, getActiveSemester, getActiveSemesterId, syncDraftFromLive } from './semesters.repository';
import { queueRequestEmail } from '../services/email.service';

/** How many suggestions one student may have waiting for review at once. */
export const MAX_OPEN_REQUESTS = 10;

const UNDEFINED_TABLE = '42P01';
const UNDEFINED_COLUMN = '42703';
const isMissingSchema = (error: unknown) =>
  [UNDEFINED_TABLE, UNDEFINED_COLUMN].includes((error as { code?: string }).code ?? '');

// The API's meeting type is the engine's with looser string fields; the shared
// comparison code only reads fields both have.
const asEngine = (meetings: TimetableMeeting[]) => meetings as unknown as EngineMeeting[];
const fromEngine = (meetings: EngineMeeting[]) => meetings as unknown as TimetableMeeting[];

export { sameMeetings as sameEngineMeetings };

export function sameMeetingLists(a: TimetableMeeting[], b: TimetableMeeting[]): boolean {
  return sameMeetings(asEngine(a), asEngine(b));
}

export function officialFingerprint(meetings: TimetableMeeting[]): string {
  return meetingsFingerprint(asEngine(meetings));
}

// ---------------------------------------------------------------- official timings

export interface OfficialSchedule {
  courseCode: string;
  courseName: string;
  meetings: TimetableMeeting[];
}

function chooseOfficial(offerings: CourseOffering[]): Map<string, CourseOffering> {
  const chosen = new Map<string, CourseOffering>();
  for (const offering of offerings) {
    const current = chosen.get(offering.courseCode);
    if (!current || offering.meetings.length > current.meetings.length) {
      chosen.set(offering.courseCode, offering);
    }
  }
  return chosen;
}

/**
 * Each course code's official meetings in a semester, as the timetable shows
 * them.
 *
 * 56 codes have several offerings, one per branch that lists the course. The
 * client merges them and keeps the first offering with the most meetings, in
 * API order; this picks the same one, so the list a student edited is the list
 * they were looking at.
 */
export async function getOfficialSchedules(
  courseCodes: string[],
  semesterId?: number | null,
): Promise<Map<string, OfficialSchedule>> {
  const schedules = new Map<string, OfficialSchedule>();
  for (const [code, offering] of chooseOfficial(await getOfferingsByCodes(courseCodes, semesterId))) {
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

/** A student's own timings for the current semester. Other semesters' are kept, not shown. */
export async function getOverrides(userId: string): Promise<CourseOverride[]> {
  const semesterId = await getActiveSemesterId();
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
        where user_id = $1 ${semesterId !== null ? 'and semester_id = $2' : ''}
        order by course_code`,
      semesterId !== null ? [userId, semesterId] : [userId],
    );
  } catch (error) {
    // Every sign-in and session restore reads this. If the API is deployed
    // before a migration has run against its database, a table or column does
    // not exist yet; answering "no overrides" keeps sign-in working through
    // that window instead of failing every login with a 500.
    if (isMissingSchema(error)) return [];
    throw error;
  }

  return rows.map((row) => ({
    courseCode: row.course_code,
    meetings: row.meetings,
    baseFingerprint: row.base_fingerprint,
    savedAt: row.saved_at.toISOString(),
  }));
}

export class OverrideContextError extends Error {}

/** Replaces the user's whole set of corrections for the current semester. */
export async function replaceOverrides(
  userId: string,
  overrides: CourseOverride[],
  clientSemesterId?: number | null,
): Promise<CourseOverride[]> {
  // One insert cannot touch the same row twice, so a repeated code keeps its last entry.
  const byCode = new Map(overrides.map((override) => [override.courseCode, override]));
  const semesterId = await getActiveSemesterId();
  if (clientSemesterId != null && clientSemesterId !== semesterId) {
    throw new OverrideContextError('The current semester changed. Reload before saving personal timings.');
  }

  const client = await pool.connect();
  try {
    await client.query('begin');
    if (semesterId !== null) {
      await client.query('delete from user_course_overrides where user_id = $1 and semester_id = $2', [
        userId, semesterId,
      ]);
    } else {
      await client.query('delete from user_course_overrides where user_id = $1', [userId]);
    }
    if (byCode.size > 0) {
      await client.query(
        `insert into user_course_overrides (user_id, course_code, meetings, base_fingerprint, saved_at${
          semesterId !== null ? ', semester_id' : ''
        })
         select $1, o->>'courseCode', o->'meetings', o->>'baseFingerprint', (o->>'savedAt')::timestamptz${
           semesterId !== null ? ', $3' : ''
         }
           from jsonb_array_elements($2::jsonb) as o`,
        semesterId !== null
          ? [userId, JSON.stringify([...byCode.values()]), semesterId]
          : [userId, JSON.stringify([...byCode.values()])],
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

// ---------------------------------------------------------------- requests

export type RequestStatus = 'pending' | 'approved' | 'rejected' | 'withdrawn' | 'superseded';
export type ApprovalMode = 'optional' | 'compulsory';
export type ProposalState = 'open' | 'official' | 'outdated' | 'closed';

export interface ChangeRequest {
  id: number;
  semesterId: number | null;
  courseCode: string;
  courseName: string | null;
  requesterRoll: string;
  note: string | null;
  baseMeetings: TimetableMeeting[];
  proposedMeetings: TimetableMeeting[];
  appliedMeetings: TimetableMeeting[] | null;
  status: RequestStatus;
  /** How it was approved; null until it is. */
  approvalMode: ApprovalMode | null;
  changeKind: ChangeKind | null;
  /** The change against the official timings at approval: classes removed and added. */
  delta: MeetingDelta | null;
  approvedBaseMeetings: TimetableMeeting[] | null;
  /** The developer edited the proposal before approving it. */
  corrected: boolean;
  proposalState: ProposalState | null;
  proposalStateNote: string | null;
  createdAt: string;
  decidedAt: string | null;
  decidedByRoll: string | null;
  decisionNote: string | null;
}

interface RequestRow {
  id: number;
  semester_id: number | null;
  course_code: string;
  course_name: string | null;
  requested_by: string | null;
  requester_roll: string;
  note: string | null;
  base_meetings: TimetableMeeting[];
  proposed_meetings: TimetableMeeting[];
  applied_meetings: TimetableMeeting[] | null;
  status: RequestStatus;
  approval_mode: ApprovalMode | null;
  change_kind: ChangeKind | null;
  delta: MeetingDelta | null;
  approved_base_meetings: TimetableMeeting[] | null;
  corrected: boolean;
  proposal_state: ProposalState | null;
  proposal_state_note: string | null;
  created_at: Date;
  decided_at: Date | null;
  decided_by_roll: string | null;
  decision_note: string | null;
}

const REQUEST_COLUMNS = [
  'id', 'semester_id', 'course_code', 'course_name', 'requested_by', 'requester_roll', 'note',
  'base_meetings', 'proposed_meetings', 'applied_meetings', 'status', 'approval_mode', 'change_kind',
  'delta', 'approved_base_meetings', 'corrected', 'proposal_state', 'proposal_state_note',
  'created_at', 'decided_at', 'decided_by_roll', 'decision_note',
];

/** The column list, qualified when the query joins another table. */
function requestColumns(alias?: string): string {
  return REQUEST_COLUMNS.map((column) => (alias ? `${alias}.${column}` : column)).join(', ');
}

function toRequest(row: RequestRow): ChangeRequest {
  return {
    id: row.id,
    semesterId: row.semester_id,
    courseCode: row.course_code,
    courseName: row.course_name,
    requesterRoll: row.requester_roll,
    note: row.note,
    baseMeetings: row.base_meetings,
    proposedMeetings: row.proposed_meetings,
    appliedMeetings: row.applied_meetings,
    status: row.status,
    approvalMode: row.approval_mode,
    changeKind: row.change_kind,
    delta: row.delta,
    approvedBaseMeetings: row.approved_base_meetings,
    corrected: row.corrected ?? false,
    proposalState: row.proposal_state,
    proposalStateNote: row.proposal_state_note,
    createdAt: row.created_at.toISOString(),
    decidedAt: row.decided_at?.toISOString() ?? null,
    decidedByRoll: row.decided_by_roll,
    decisionNote: row.decision_note,
  };
}

/**
 * Files a request, or replaces the student's open one for the same course -
 * a second thought should update the first, not queue behind it.
 *
 * The email to the developer is queued in the same transaction: the request
 * is safely stored before anything is sent, and a failed send is retried.
 */
export async function submitRequest(input: {
  userId: string;
  roll: string;
  requesterName: string | null;
  courseCode: string;
  courseName: string;
  note: string | null;
  baseMeetings: TimetableMeeting[];
  proposedMeetings: TimetableMeeting[];
}): Promise<ChangeRequest | 'too-many'> {
  const semester = await getActiveSemester();
  const delta = deltaBetween(asEngine(input.baseMeetings), asEngine(input.proposedMeetings));
  const kind = changeKind(delta);

  const client = await pool.connect();
  try {
    await client.query('begin');
    const open = await client.query<{ n: number }>(
      `select count(*)::int as n
         from course_change_requests
        where requested_by = $1 and status = 'pending' and course_code <> $2`,
      [input.userId, input.courseCode],
    );
    if (open.rows[0].n >= MAX_OPEN_REQUESTS) {
      await client.query('rollback');
      return 'too-many';
    }

    const saved = await client.query<RequestRow>(
      `insert into course_change_requests
         (course_code, course_name, requested_by, requester_roll, note, base_meetings, proposed_meetings,
          semester_id, change_kind)
       values ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8, $9)
       on conflict (requested_by, course_code) where status = 'pending'
       do update set course_name       = excluded.course_name,
                     requester_roll    = excluded.requester_roll,
                     note              = excluded.note,
                     base_meetings     = excluded.base_meetings,
                     proposed_meetings = excluded.proposed_meetings,
                     semester_id       = excluded.semester_id,
                     change_kind       = excluded.change_kind,
                     created_at        = now()
       returning ${requestColumns()}`,
      [
        input.courseCode, input.courseName, input.userId, input.roll, input.note,
        JSON.stringify(input.baseMeetings), JSON.stringify(input.proposedMeetings),
        semester?.id ?? null, kind,
      ],
    );
    const request = toRequest(saved.rows[0]);

    await queueRequestEmail(client, {
      requestId: request.id,
      courseCode: request.courseCode,
      courseName: request.courseName,
      semesterName: semester?.name ?? null,
      requesterRoll: input.roll,
      requesterName: input.requesterName,
      note: input.note,
      kind,
      delta,
      // A resubmission with different content is worth a second email; an
      // identical one is not.
      contentKey: crypto
        .createHash('sha1')
        .update(JSON.stringify([input.proposedMeetings, input.note]))
        .digest('hex')
        .slice(0, 16),
    });

    await client.query('commit');
    return request;
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
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

/** A student can take back a request only while it is still waiting. */
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
  semesterName: string | null;
  /** Students who currently have the course in their timetable. */
  enrolledCount: number;
  /** Of those, how many have their own timings for it. */
  personalEditCount: number;
  /**
   * The official meetings right now - what approval would change. Differs
   * from baseMeetings when the timings moved after the request was made.
   */
  currentMeetings: TimetableMeeting[] | null;
  /** How students answered an optional change. */
  responses: { accepted: number; rejected: number; notified: number };
  /** The email about this request: sent, pending, failed, or none queued. */
  emailStatus: string | null;
  emailError: string | null;
}

export async function listForReview(scope: 'pending' | 'decided'): Promise<ReviewItem[]> {
  const pending = scope === 'pending';
  const rows = await query<RequestRow & {
    requester_name: string | null; semester_name: string | null; enrolled: number; personal_edits: number;
    accepted: number; rejected: number; notified: number; email_status: string | null; email_error: string | null;
  }>(
    `select ${requestColumns('r')},
            p.name as requester_name,
            s.name as semester_name,
            -- user_courses stores the bare course code the client selects by.
            (select count(distinct uc.user_id) from user_courses uc
              where uc.offering_id = r.course_code and uc.semester_id is not distinct from r.semester_id)::int as enrolled,
            (select count(*) from user_course_overrides o
              where o.course_code = r.course_code and o.semester_id is not distinct from r.semester_id)::int as personal_edits,
            (select count(*) from user_notifications n
              where n.request_id = r.id and n.response = 'accepted')::int as accepted,
            (select count(*) from user_notifications n
              where n.request_id = r.id and n.response = 'rejected')::int as rejected,
            (select count(*) from user_notifications n
              where n.request_id = r.id and n.kind <> 'request_decision')::int as notified,
            (select e.status from email_outbox e where e.request_id = r.id order by e.id desc limit 1) as email_status,
            (select e.last_error from email_outbox e where e.request_id = r.id order by e.id desc limit 1) as email_error
       from course_change_requests r
       left join profiles p on p.id = r.requested_by
       left join semesters s on s.id = r.semester_id
      where ${pending ? "r.status = 'pending'" : "r.status <> 'pending'"}
      order by ${pending ? 'r.created_at asc' : 'coalesce(r.decided_at, r.created_at) desc'}
      limit 150`,
  );

  const official = new Map<string, OfficialSchedule>();
  if (pending) {
    const bySemester = new Map<number | null, Set<string>>();
    for (const row of rows) {
      bySemester.set(row.semester_id, (bySemester.get(row.semester_id) ?? new Set()).add(row.course_code));
    }
    for (const [semesterId, codes] of bySemester) {
      const found = await getOfficialSchedules([...codes], semesterId ?? undefined);
      for (const [code, schedule] of found) official.set(`${semesterId}|${code}`, schedule);
    }
  }

  return rows.map((row) => ({
    ...toRequest(row),
    requesterName: row.requester_name,
    semesterName: row.semester_name,
    enrolledCount: row.enrolled,
    personalEditCount: row.personal_edits,
    currentMeetings: official.get(`${row.semester_id}|${row.course_code}`)?.meetings ?? null,
    responses: { accepted: row.accepted, rejected: row.rejected, notified: row.notified },
    emailStatus: row.email_status,
    emailError: row.email_error,
  }));
}

export async function countPending(): Promise<number> {
  const [row] = await query<{ n: number }>(
    "select count(*)::int as n from course_change_requests where status = 'pending'",
  );
  return row.n;
}

// ---------------------------------------------------------------- decisions

export type Decision =
  | {
      ok: true;
      request: ChangeRequest;
      offeringIds: string[];
      alsoClosed: number;
      notified: number;
    }
  | { ok: false; status: 404 | 409; error: string };

/** One inbox entry per student who has the course. Never a second for the same request. */
async function notifyEnrolled(
  client: PoolClient,
  request: RequestRow,
  kind: 'optional_change' | 'official_change',
): Promise<number> {
  const inserted = await client.query(
    `insert into user_notifications (user_id, request_id, kind, alert)
     select distinct uc.user_id, $1::bigint, $2, true
       from user_courses uc
      where uc.offering_id = $3
        and uc.semester_id is not distinct from $4
        and uc.user_id is distinct from $5
     on conflict (user_id, request_id, kind) do nothing`,
    [request.id, kind, request.course_code, request.semester_id, request.requested_by],
  );
  return inserted.rowCount ?? 0;
}

/** Tells the student who filed the request what became of it. */
async function notifyRequester(client: PoolClient, request: RequestRow): Promise<void> {
  if (!request.requested_by) return;
  await client.query(
    `insert into user_notifications (user_id, request_id, kind, alert)
     values ($1, $2, 'request_decision', false)
     on conflict (user_id, request_id, kind) do update set read_at = null, created_at = now()`,
    [request.requested_by, request.id],
  );
}

/**
 * Approves a request, in one of two ways.
 *
 * `compulsory` makes the change official: it is applied to every offering of
 * the course in the semester, for everyone who has it and everyone who picks
 * it up later. Each offering has only the affected classes changed, so a
 * branch's own rooms and other batches' sessions survive.
 *
 * `optional` changes nothing official. The request becomes a standing
 * proposal - the change as a delta against the official timings at this
 * moment - that each student accepts or declines for their own timetable.
 *
 * `expectedFingerprint` is the official timings the reviewer was looking at;
 * if they moved in the meantime the approval is refused rather than applied
 * to something the reviewer never saw. `meetings` lets the reviewer correct
 * the proposal first.
 */
export async function approveRequest(
  id: number,
  input: {
    adminRoll: string;
    note: string | null;
    mode: ApprovalMode;
    meetings?: TimetableMeeting[];
    expectedFingerprint?: string;
  },
): Promise<Decision> {
  // Resolved before the transaction opens: nothing below may borrow a second
  // connection while this one holds locks.
  const activeSemesterId = await getActiveSemesterId();
  const client = await pool.connect();
  const run = async <T>(text: string, params: unknown[] = []) => (await client.query(text, params)).rows as T[];
  try {
    await client.query('begin');

    // Locked so the same request cannot be decided twice.
    const found = await client.query<RequestRow>(
      `select ${requestColumns()} from course_change_requests where id = $1 for update`,
      [id],
    );
    const row = found.rows[0];
    if (!row) {
      await client.query('rollback');
      return { ok: false, status: 404, error: 'No such request.' };
    }
    if (row.status !== 'pending') {
      await client.query('rollback');
      return { ok: false, status: 409, error: `This request was already ${row.status}.` };
    }

    const semesterId = row.semester_id ?? activeSemesterId;
    // Offerings locked for the rest of the transaction: two approvals for one
    // course are applied one after the other, never interleaved.
    await client.query(
      `select id from course_offerings
        where course_code = $1 and semester_id is not distinct from $2
        order by id for update`,
      [row.course_code, semesterId],
    );
    const offerings = await getOfferingsByCodes([row.course_code], semesterId, run);
    const official = chooseOfficial(offerings).get(row.course_code);
    if (!official) {
      await client.query('rollback');
      return { ok: false, status: 404, error: `${row.course_code} is no longer in the timetable.` };
    }

    if (input.expectedFingerprint && input.expectedFingerprint !== officialFingerprint(official.meetings)) {
      await client.query('rollback');
      return {
        ok: false,
        status: 409,
        error: 'The official timings changed while this was open. Reload and review it against the current ones.',
      };
    }

    const applied = input.meetings ?? row.proposed_meetings;
    const corrected = input.meetings !== undefined && !sameMeetingLists(input.meetings, row.proposed_meetings);
    const delta = deltaBetween(asEngine(official.meetings), asEngine(applied));
    if (delta.remove.length === 0 && delta.add.length === 0) {
      await client.query('rollback');
      return {
        ok: false,
        status: 409,
        error: 'These are already the official timings, so there is nothing to approve. Reject it or correct it.',
      };
    }
    const kind = changeKind(delta);

    let offeringIds: string[] = [];
    let alsoClosed = 0;

    if (input.mode === 'compulsory') {
      offeringIds = offerings.map((offering) => offering.offeringId);
      for (const offering of offerings) {
        // Only the classes the change names are touched. An offering the
        // change does not fit (another branch's different timings, or an empty
        // placeholder) takes the new list whole, so no offering is left
        // serving the timings this replaces.
        const outcome = applyDelta(asEngine(offering.meetings), delta);
        const next = outcome.status === 'outdated' ? applied : fromEngine(outcome.meetings);
        await client.query('delete from course_meetings where offering_id = $1', [offering.offeringId]);
        await client.query(INSERT_MEETINGS_SQL, [[offering.offeringId], JSON.stringify(next)]);
      }
      // Marked 'admin' so a reseed keeps the change.
      await client.query(
        `update course_offerings set source = 'admin', customized_at = now() where id = any($1::text[])`,
        [offeringIds],
      );
      await syncDraftFromLive(client, offeringIds, input.adminRoll);
    }

    const decided = await client.query<RequestRow>(
      `update course_change_requests
          set status = 'approved', decided_at = now(), decided_by_roll = $2, decision_note = $3,
              applied_meetings = $4::jsonb, approval_mode = $5, change_kind = $6, delta = $7::jsonb,
              approved_base_meetings = $8::jsonb, corrected = $9,
              proposal_state = case when $5 = 'optional' then 'open' end,
              semester_id = coalesce(semester_id, $10)
        where id = $1
        returning ${requestColumns()}`,
      [
        id, input.adminRoll, input.note, JSON.stringify(applied), input.mode, kind, JSON.stringify(delta),
        JSON.stringify(official.meetings), corrected, semesterId,
      ],
    );
    const request = decided.rows[0];

    // Other open requests for the course.
    const others = await client.query<{ id: number; proposed_meetings: TimetableMeeting[] }>(
      `select id, proposed_meetings
         from course_change_requests
        where course_code = $1 and status = 'pending' and id <> $2
          and semester_id is not distinct from $3
        for update`,
      [row.course_code, id, row.semester_id],
    );
    const duplicates = others.rows.filter((other) => sameMeetingLists(other.proposed_meetings, applied)).map((o) => o.id);

    if (input.mode === 'compulsory') {
      // They were made against the timings just replaced. One proposing the
      // same meetings is the same fix; any other would undo this change if
      // approved later, so it is closed and its author can ask again.
      const superseded = others.rows.filter((other) => !duplicates.includes(other.id)).map((o) => o.id);
      if (duplicates.length > 0) {
        await client.query(
          `update course_change_requests
              set status = 'approved', decided_at = now(), decided_by_roll = $2, decision_note = $3,
                  applied_meetings = $4::jsonb, approval_mode = 'compulsory', change_kind = $5
            where id = any($1::bigint[])`,
          [duplicates, input.adminRoll, `Same change as request #${id}.`, JSON.stringify(applied), kind],
        );
      }
      if (superseded.length > 0) {
        await client.query(
          `update course_change_requests
              set status = 'superseded', decided_at = now(), decided_by_roll = $2, decision_note = $3
            where id = any($1::bigint[])`,
          [superseded, input.adminRoll, `The timings changed with request #${id}. Ask again if this still applies.`],
        );
      }
      alsoClosed = others.rows.length;
      await reconcileProposals(client, row.course_code, request.semester_id, applied, id);
    } else if (duplicates.length > 0) {
      // The same proposal twice would ask every student twice.
      await client.query(
        `update course_change_requests
            set status = 'superseded', decided_at = now(), decided_by_roll = $2, decision_note = $3
          where id = any($1::bigint[])`,
        [duplicates, input.adminRoll, `Same change as request #${id}, which is now an optional update.`],
      );
      alsoClosed = duplicates.length;
    }

    const notified = await notifyEnrolled(
      client, request, input.mode === 'optional' ? 'optional_change' : 'official_change',
    );
    await notifyRequester(client, request);

    await client.query('commit');
    return { ok: true, request: toRequest(request), offeringIds, alsoClosed, notified };
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * After the official timings change, settles every optional proposal still
 * open for the course: one that asked for exactly this is now official; one
 * that moves a class which no longer exists is outdated. A student holding
 * either can no longer accept it, and is told why instead.
 */
async function reconcileProposals(
  client: PoolClient,
  courseCode: string,
  semesterId: number | null,
  newOfficial: TimetableMeeting[],
  becauseOf: number,
): Promise<void> {
  const open = await client.query<{ id: number; delta: MeetingDelta | null; applied_meetings: TimetableMeeting[] | null }>(
    `select id, delta, applied_meetings
       from course_change_requests
      where course_code = $1 and semester_id is not distinct from $2
        and status = 'approved' and proposal_state = 'open' and id <> $3
      for update`,
    [courseCode, semesterId, becauseOf],
  );
  for (const proposal of open.rows) {
    const outcome = proposal.delta ? applyDelta(asEngine(newOfficial), proposal.delta) : { status: 'outdated' as const };
    // "Now official" means what the proposal asked for is what the timetable
    // says: the same list, or every class it adds already being there. A
    // proposal that only drops a class is not fulfilled by that class having
    // been moved somewhere else - it is simply out of date.
    const fulfilled =
      (proposal.applied_meetings !== null && sameMeetingLists(proposal.applied_meetings, newOfficial)) ||
      (outcome.status === 'already' && (proposal.delta?.add.length ?? 0) > 0);
    let state: ProposalState | null = null;
    let note = '';
    if (fulfilled) {
      state = 'official';
      note = `This change is now part of the official timetable (request #${becauseOf}).`;
    } else if (outcome.status !== 'applied') {
      state = 'outdated';
      note = `The official timings changed (request #${becauseOf}), so this proposal no longer applies.`;
    }
    if (state) {
      await client.query(
        'update course_change_requests set proposal_state = $2, proposal_state_note = $3 where id = $1',
        [proposal.id, state, note],
      );
    }
  }
}

export async function rejectRequest(
  id: number,
  input: { adminRoll: string; note: string | null },
): Promise<Decision> {
  const client = await pool.connect();
  try {
    await client.query('begin');
    const rows = await client.query<RequestRow>(
      `update course_change_requests
          set status = 'rejected', decided_at = now(), decided_by_roll = $2, decision_note = $3
        where id = $1 and status = 'pending'
        returning ${requestColumns()}`,
      [id, input.adminRoll, input.note],
    );
    if (rows.rows[0]) {
      await notifyRequester(client, rows.rows[0]);
      await client.query('commit');
      return { ok: true, request: toRequest(rows.rows[0]), offeringIds: [], alsoClosed: 0, notified: 0 };
    }
    await client.query('rollback');
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }

  const existing = await query<{ status: string }>(
    'select status from course_change_requests where id = $1',
    [id],
  );
  return existing[0]
    ? { ok: false, status: 409, error: `This request was already ${existing[0].status}.` }
    : { ok: false, status: 404, error: 'No such request.' };
}

/** Stops an optional proposal from being offered to anyone else. Answers already given stand. */
export async function closeProposal(id: number, adminRoll: string, note: string | null): Promise<ChangeRequest | null> {
  const rows = await query<RequestRow>(
    `update course_change_requests
        set proposal_state = 'closed',
            proposal_state_note = coalesce($3, 'The developer withdrew this optional update.'),
            decided_by_roll = $2
      where id = $1 and status = 'approved' and approval_mode = 'optional' and proposal_state = 'open'
      returning ${requestColumns()}`,
    [id, adminRoll, note],
  );
  return rows[0] ? toRequest(rows[0]) : null;
}

// ---------------------------------------------------------------- notifications

export interface Notification {
  id: number;
  kind: 'optional_change' | 'official_change' | 'request_decision';
  requestId: number;
  courseCode: string;
  courseName: string | null;
  semesterId: number | null;
  semesterName: string | null;
  changeKind: ChangeKind | null;
  /** Compulsory changes are already in the timetable; optional ones wait for an answer. */
  approvalMode: ApprovalMode | null;
  requestStatus: RequestStatus;
  /** What the change removes and adds, against the official timings when it was approved. */
  delta: MeetingDelta | null;
  /** Shown as "reported by"; a name only, never a roll number. Null for the reader's own request. */
  reportedBy: string | null;
  mine: boolean;
  explanation: string | null;
  decisionNote: string | null;
  corrected: boolean;
  proposalState: ProposalState | null;
  proposalStateNote: string | null;
  decidedAt: string | null;
  /** Shown as an interrupting alert once; false for a course picked up after the approval. */
  alert: boolean;
  alertSeen: boolean;
  read: boolean;
  response: 'accepted' | 'rejected' | null;
  respondedAt: string | null;
  /** The reader still has this course selected. */
  courseSelected: boolean;
  createdAt: string;
}

interface NotificationRow {
  id: number; kind: Notification['kind']; request_id: number; alert: boolean; alert_seen_at: Date | null;
  read_at: Date | null; response: 'accepted' | 'rejected' | null; responded_at: Date | null; created_at: Date;
  course_code: string; course_name: string | null; semester_id: number | null; semester_name: string | null;
  change_kind: ChangeKind | null; approval_mode: ApprovalMode | null; status: RequestStatus;
  delta: MeetingDelta | null; base_meetings: TimetableMeeting[]; proposed_meetings: TimetableMeeting[];
  requester_name: string | null; requested_by: string | null; note: string | null; decision_note: string | null;
  corrected: boolean; proposal_state: ProposalState | null; proposal_state_note: string | null;
  decided_at: Date | null; course_selected: boolean;
}

const NOTIFICATION_SELECT = `
  select n.id, n.kind, n.request_id, n.alert, n.alert_seen_at, n.read_at, n.response, n.responded_at, n.created_at,
         r.course_code, r.course_name, r.semester_id, s.name as semester_name, r.change_kind, r.approval_mode,
         r.status, r.delta, r.base_meetings, r.proposed_meetings, p.name as requester_name, r.requested_by,
         r.note, r.decision_note, r.corrected, r.proposal_state, r.proposal_state_note, r.decided_at,
         exists (select 1 from user_courses uc
                  where uc.user_id = n.user_id and uc.offering_id = r.course_code
                    and uc.semester_id is not distinct from r.semester_id) as course_selected
    from user_notifications n
    join course_change_requests r on r.id = n.request_id
    left join profiles p on p.id = r.requested_by
    left join semesters s on s.id = r.semester_id`;

function toNotification(row: NotificationRow, userId: string): Notification {
  const mine = row.requested_by === userId;
  return {
    id: row.id,
    kind: row.kind,
    requestId: row.request_id,
    courseCode: row.course_code,
    courseName: row.course_name,
    semesterId: row.semester_id,
    semesterName: row.semester_name,
    changeKind: row.change_kind,
    approvalMode: row.approval_mode,
    requestStatus: row.status,
    // A rejected request was never approved, so it has no delta of its own.
    delta: row.delta ?? deltaBetween(asEngine(row.base_meetings), asEngine(row.proposed_meetings)),
    reportedBy: mine ? null : row.requester_name?.trim() || 'A student',
    mine,
    explanation: row.note,
    decisionNote: row.decision_note,
    corrected: row.corrected ?? false,
    proposalState: row.proposal_state,
    proposalStateNote: row.proposal_state_note,
    decidedAt: row.decided_at?.toISOString() ?? null,
    alert: row.alert,
    alertSeen: row.alert_seen_at !== null,
    read: row.read_at !== null,
    response: row.response,
    respondedAt: row.responded_at?.toISOString() ?? null,
    courseSelected: row.course_selected,
    createdAt: row.created_at.toISOString(),
  };
}

export async function listNotifications(userId: string, limit = 100): Promise<Notification[]> {
  const rows = await query<NotificationRow>(
    `${NOTIFICATION_SELECT} where n.user_id = $1 order by n.created_at desc, n.id desc limit $2`,
    [userId, limit],
  );
  return rows.map((row) => toNotification(row, userId));
}

/**
 * Inbox entries for approved changes to courses a student has just added.
 *
 * These are never alerts: someone picking up three courses with three old
 * changes gets three quiet inbox entries and one unread badge, not three
 * popups. Optional changes are listed, not applied - accepting stays the
 * student's choice.
 */
export async function notifyForAddedCourses(
  userId: string,
  semesterId: number | null,
  courseCodes: string[],
): Promise<number> {
  if (courseCodes.length === 0) return 0;
  try {
    const rows = await query(
      `insert into user_notifications (user_id, request_id, kind, alert)
       select $1, r.id,
              case when r.approval_mode = 'optional' then 'optional_change' else 'official_change' end,
              false
         from course_change_requests r
        where r.course_code = any($2::text[])
          and r.semester_id is not distinct from $3
          and r.status = 'approved'
          and (r.approval_mode = 'compulsory' or r.proposal_state = 'open')
          and r.requested_by is distinct from $1
       on conflict (user_id, request_id, kind) do nothing
       returning id`,
      [userId, courseCodes, semesterId],
    );
    return rows.length;
  } catch (error) {
    // Runs after a course selection is saved; a database that migration 013
    // has not reached must not turn that save into an error.
    if (isMissingSchema(error)) return 0;
    throw error;
  }
}

/** Marks entries read and/or their alert as shown. Only ever the caller's own. */
export async function markNotifications(
  userId: string,
  ids: number[] | 'all',
  what: { read?: boolean; alertSeen?: boolean },
): Promise<number> {
  const rows = await query(
    `update user_notifications
        set read_at       = case when $3 then coalesce(read_at, now()) else read_at end,
            alert_seen_at = case when $4 then coalesce(alert_seen_at, now()) else alert_seen_at end
      where user_id = $1 and ($2::bigint[] is null or id = any($2::bigint[]))
      returning id`,
    [userId, ids === 'all' ? null : ids, what.read ?? false, what.alertSeen ?? false],
  );
  return rows.length;
}

export type ResponseResult =
  | { ok: true; notification: Notification; overrides: CourseOverride[] | null }
  | { ok: false; status: 404 | 409; error: string; state?: ProposalState | null };

/**
 * Records a student's answer to an optional change.
 *
 * Accepting carries the student's resulting meetings for the course: their
 * own current timings with this change applied to the classes it names and
 * nothing else. That list is saved as their personal timings in the same
 * transaction as the answer, so another device sees both or neither. Answering
 * again with the same answer changes nothing.
 */
export async function respondToNotification(
  userId: string,
  notificationId: number,
  input: {
    response: 'accepted' | 'rejected';
    override?: { meetings: TimetableMeeting[]; baseFingerprint: string };
  },
): Promise<ResponseResult> {
  let notification: Notification;
  let savedOverride = false;
  const client = await pool.connect();
  try {
    await client.query('begin');
    const found = await client.query<NotificationRow>(
      `${NOTIFICATION_SELECT} where n.user_id = $1 and n.id = $2 for update of n`,
      [userId, notificationId],
    );
    const row = found.rows[0];
    if (!row || row.kind !== 'optional_change') {
      await client.query('rollback');
      return { ok: false, status: 404, error: 'No such update to respond to.' };
    }

    const repeat = row.response === input.response;
    if (!repeat && row.proposal_state !== 'open') {
      await client.query('rollback');
      return {
        ok: false,
        status: 409,
        state: row.proposal_state,
        error: row.proposal_state_note ?? 'This update is no longer open.',
      };
    }

    if (!repeat) {
      if (input.response === 'accepted' && input.override) {
        await client.query(
          `delete from user_course_overrides
            where user_id = $1 and course_code = $2 and semester_id is not distinct from $3`,
          [userId, row.course_code, row.semester_id],
        );
        await client.query(
          `insert into user_course_overrides (user_id, course_code, meetings, base_fingerprint, saved_at, semester_id)
           values ($1, $2, $3::jsonb, $4, now(), $5)`,
          [userId, row.course_code, JSON.stringify(input.override.meetings), input.override.baseFingerprint, row.semester_id],
        );
      }
      await client.query(
        `update user_notifications
            set response = $2, responded_at = now(), read_at = coalesce(read_at, now()),
                alert_seen_at = coalesce(alert_seen_at, now())
          where id = $1`,
        [notificationId, input.response],
      );
    }

    const updated = await client.query<NotificationRow>(
      `${NOTIFICATION_SELECT} where n.user_id = $1 and n.id = $2`,
      [userId, notificationId],
    );
    await client.query('commit');
    notification = toNotification(updated.rows[0], userId);
    savedOverride = input.response === 'accepted' && Boolean(input.override) && !repeat;
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }

  return { ok: true, notification, overrides: savedOverride ? await getOverrides(userId) : null };
}
