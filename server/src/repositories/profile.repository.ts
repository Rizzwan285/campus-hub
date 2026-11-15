import { academicContext, firstYearBatch } from '../../../src/lib/academicProfile';
import { pool, query } from '../db';
import type { CourseOverride } from './courseChanges.repository';
import { getActiveSemesterId } from './semesters.repository';

export interface ProfileRow {
  id: string;
  roll_number: string;
  name: string | null;
  mess: string | null;
  program: string | null;
  branch: string | null;
  year_of_study: string | null;
  batch_no: string | null;
  role: string;
  password_hash: string | null;
}

export interface PublicProfile {
  id: string;
  rollNumber: string;
  name: string | null;
  mess: string | null;
  program: string | null;
  branch: string | null;
  yearOfStudy: string | null;
  batchNo: string | null;
  role: string;
  /** Course ids the user has selected, so one call restores their whole state. */
  selectedCourseIds: string[];
  /** The user's own timings for individual courses, which only they see. */
  courseOverrides: CourseOverride[];
  /**
   * The semester the selection and timings above belong to. Null on a
   * database that has no semesters yet.
   */
  semesterId: number | null;
}

const COLUMNS = `id, roll_number, name, mess, program, branch,
                 year_of_study, batch_no, role, password_hash`;

export function normalizeRoll(roll: string): string {
  return roll.trim().toUpperCase();
}

export async function findByRoll(roll: string): Promise<ProfileRow | null> {
  const rows = await query<ProfileRow>(
    `select ${COLUMNS} from profiles where roll_number = $1`,
    [normalizeRoll(roll)],
  );
  return rows[0] ?? null;
}

/** Creates the account on first sign-in. Concurrent first logins are safe. */
export async function findOrCreateByRoll(roll: string): Promise<ProfileRow> {
  const normalized = normalizeRoll(roll);
  const rows = await query<ProfileRow>(
    `insert into profiles (roll_number, role)
     values ($1, 'student')
     on conflict (roll_number) do update set roll_number = excluded.roll_number
     returning ${COLUMNS}`,
    [normalized],
  );
  return rows[0];
}

export async function touchLastSeen(id: string): Promise<void> {
  await query('update profiles set last_seen_at = now() where id = $1', [id]);
}

/**
 * The user's course selection for the current semester.
 *
 * Selections from earlier semesters stay in the table untouched; they are
 * simply not this semester's. `semesterId` null (no semesters in this database
 * yet, e.g. migration 012 still to run) reads the unscoped selection, exactly
 * as before - sign-in depends on this query.
 */
export async function getSelectedCourseIds(userId: string, semesterId?: number | null): Promise<string[]> {
  const semester = semesterId === undefined ? await getActiveSemesterId() : semesterId;
  const rows = await query<{ offering_id: string }>(
    semester === null
      ? 'select offering_id from user_courses where user_id = $1'
      : 'select offering_id from user_courses where user_id = $1 and semester_id = $2',
    semester === null ? [userId] : [userId, semester],
  );
  return rows.map((row) => row.offering_id);
}

export function toPublicProfile(
  row: ProfileRow,
  selectedCourseIds: string[],
  courseOverrides: CourseOverride[],
  semesterId: number | null = null,
): PublicProfile {
  return {
    id: row.id,
    rollNumber: row.roll_number,
    name: row.name,
    mess: row.mess,
    program: row.program,
    branch: row.branch,
    yearOfStudy: row.year_of_study,
    batchNo: row.batch_no,
    role: row.role,
    selectedCourseIds,
    courseOverrides,
    semesterId,
  };
}

export interface ProfilePatch {
  name?: string;
  mess?: string | null;
  program?: string | null;
  branch?: string | null;
  yearOfStudy?: string | null;
  batchNo?: string | null;
}

export class ProfileError extends Error {
  constructor(message: string, readonly status = 400) { super(message); }
}

function academicProfile(row: ProfileRow) {
  return { program: row.program, branch: row.branch, yearOfStudy: row.year_of_study, batchNo: row.batch_no };
}

export async function updateProfile(id: string, patch: ProfilePatch): Promise<ProfileRow | null> {
  const semesterId = await getActiveSemesterId();
  const client = await pool.connect();
  try {
    await client.query('begin');
    const before = (await client.query<ProfileRow>(`select ${COLUMNS} from profiles where id = $1 for update`, [id])).rows[0];
    if (!before) { await client.query('rollback'); return null; }
    const next = { ...academicProfile(before), ...patch };
    if (next.program === 'UG' && next.yearOfStudy === '1') {
      const batch = firstYearBatch(next.batchNo);
      if (!batch) throw new ProfileError('Select a batch from B1 to B24 for first year.');
      patch = { ...patch, batchNo: `B${batch}` };
    } else {
      patch = { ...patch, batchNo: null };
    }
    const { rows } = await client.query<ProfileRow>(
      `update profiles
          set name          = coalesce($2, name),
              mess          = case when $3::boolean then $4  else mess end,
              program       = case when $5::boolean then $6  else program end,
              branch        = case when $7::boolean then $8  else branch end,
              year_of_study = case when $9::boolean then $10 else year_of_study end,
              batch_no      = case when $11::boolean then $12 else batch_no end
        where id = $1
        returning ${COLUMNS}`,
      [
        id,
        patch.name ?? null,
        patch.mess !== undefined, patch.mess ?? null,
        patch.program !== undefined, patch.program ?? null,
        patch.branch !== undefined, patch.branch ?? null,
        patch.yearOfStudy !== undefined, patch.yearOfStudy ?? null,
        patch.batchNo !== undefined, patch.batchNo ?? null,
      ],
    );
    if (academicContext(academicProfile(before)) !== academicContext(academicProfile(rows[0]))) {
      // Only this semester's picks are tied to the year and batch that changed.
      if (semesterId === null) {
        await client.query('delete from user_courses where user_id = $1', [id]);
      } else {
        await client.query('delete from user_courses where user_id = $1 and semester_id = $2', [id, semesterId]);
      }
    }
    await client.query('commit');
    return rows[0];
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}

export interface SelectionResult {
  selected: string[];
  /** Course codes that were not in the selection before this write. */
  added: string[];
  semesterId: number | null;
}

/**
 * Serializes selections with profile changes, rejecting writes from an old
 * year/batch - or from an old semester: a tab left open across a semester
 * change must not write last semester's courses into the new one.
 */
export async function setSelectedCourses(
  userId: string,
  offeringIds: string[],
  context: string,
  clientSemesterId?: number | null,
): Promise<SelectionResult> {
  const semesterId = await getActiveSemesterId();
  if (clientSemesterId !== undefined && clientSemesterId !== null && semesterId !== null &&
      clientSemesterId !== semesterId) {
    throw new ProfileError('A new semester has started. Reload to pick your courses for it.', 409);
  }

  const client = await pool.connect();
  try {
    await client.query('begin');
    const profile = (await client.query<ProfileRow>(`select ${COLUMNS} from profiles where id = $1 for update`, [userId])).rows[0];
    if (!profile) throw new ProfileError('Account not found.', 404);
    if (context !== academicContext(academicProfile(profile))) {
      throw new ProfileError('Your year or batch changed. Reload before selecting courses.', 409);
    }

    const scoped = semesterId !== null;
    const before = await client.query<{ offering_id: string }>(
      scoped
        ? 'delete from user_courses where user_id = $1 and semester_id = $2 returning offering_id'
        : 'delete from user_courses where user_id = $1 returning offering_id',
      scoped ? [userId, semesterId] : [userId],
    );
    const previous = new Set(before.rows.map((row) => row.offering_id));
    const selected = [...new Set(offeringIds)];
    if (selected.length) {
      await client.query(
        scoped
          ? `insert into user_courses (user_id, offering_id, semester_id)
             select $1, unnest($2::text[]), $3 on conflict do nothing`
          : `insert into user_courses (user_id, offering_id)
             select $1, unnest($2::text[]) on conflict do nothing`,
        scoped ? [userId, selected, semesterId] : [userId, selected],
      );
    }
    await client.query('commit');
    return { selected, added: selected.filter((code) => !previous.has(code)), semesterId };
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}

export async function ensureAdmin(roll: string, passwordHash: string): Promise<void> {
  await query(
    `insert into profiles (roll_number, role, password_hash)
     values ($1, 'admin', $2)
     on conflict (roll_number)
     do update set role = 'admin', password_hash = excluded.password_hash`,
    [normalizeRoll(roll), passwordHash],
  );
}

export async function recordAudit(entry: {
  actorId: string | null;
  actorRoll: string | null;
  action: string;
  target: string;
  before?: unknown;
  after?: unknown;
}): Promise<void> {
  await query(
    `insert into audit_log (actor_id, actor_roll, action, target, before, after)
     values ($1, $2, $3, $4, $5, $6)`,
    [
      entry.actorId,
      entry.actorRoll,
      entry.action,
      entry.target,
      entry.before === undefined ? null : JSON.stringify(entry.before),
      entry.after === undefined ? null : JSON.stringify(entry.after),
    ],
  );
}

export async function recentAudit(limit = 50) {
  return query<{
    id: number;
    actor_roll: string | null;
    action: string;
    target: string;
    created_at: string;
  }>(
    `select id, actor_roll, action, target, created_at
       from audit_log order by created_at desc limit $1`,
    [limit],
  );
}
