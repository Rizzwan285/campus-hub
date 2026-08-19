import { query } from '../db';

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

export async function getSelectedCourseIds(userId: string): Promise<string[]> {
  const rows = await query<{ offering_id: string }>(
    'select offering_id from user_courses where user_id = $1',
    [userId],
  );
  return rows.map((row) => row.offering_id);
}

export function toPublicProfile(row: ProfileRow, selectedCourseIds: string[]): PublicProfile {
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

export async function updateProfile(id: string, patch: ProfilePatch): Promise<ProfileRow | null> {
  const rows = await query<ProfileRow>(
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
  return rows[0] ?? null;
}

/** Replaces the user's whole selection in one transaction-free upsert pair. */
export async function setSelectedCourses(userId: string, offeringIds: string[]): Promise<string[]> {
  await query('delete from user_courses where user_id = $1', [userId]);

  if (offeringIds.length > 0) {
    // Stored verbatim: these are the client's own identifiers, and a course
    // the user picked should survive a semester reseed.
    await query(
      `insert into user_courses (user_id, offering_id)
       select $1, unnest($2::text[])
       on conflict do nothing`,
      [userId, [...new Set(offeringIds)]],
    );
  }

  return getSelectedCourseIds(userId);
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
