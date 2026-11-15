import crypto from 'crypto';
import type { PoolClient } from 'pg';
import { pool, query } from '../db';
import {
  expandSchedule,
  type CourseSchedule,
  type SemesterConfig,
  type SlotDefinitions,
} from '../../../src/engine/courseSchedule';
import { sameMeetings } from '../../../src/engine/courseTimings';
import type { TimetableMeeting } from '../../../src/engine/types';

/**
 * Semesters, their draft catalogues, and publishing.
 *
 * Two copies of a semester's timetable exist on purpose:
 *
 *   semester_courses                    the draft - imported, reviewed, edited
 *   course_offerings / course_meetings  the live copy students read
 *
 * Nothing done to the draft reaches a student until `publishSemester` copies
 * it across in one transaction and records the result as a numbered snapshot.
 * Changes made straight to the live copy (an approved change request, the old
 * slot editor) are written back into the draft by `syncDraftFromLive`, so the
 * draft is always the whole truth and a later publish cannot undo them.
 */

const UNDEFINED_TABLE = '42P01';
const UNDEFINED_COLUMN = '42703';

export type SemesterStatus = 'draft' | 'published' | 'active' | 'archived';

export interface Semester {
  id: number;
  code: string;
  name: string;
  status: SemesterStatus;
  startsOn: string | null;
  endsOn: string | null;
  slotDefinitions: SlotDefinitions;
  slotsConfirmed: boolean;
  config: SemesterConfig;
  publishedVersion: number;
  publishedAt: string | null;
  activatedAt: string | null;
  archivedAt: string | null;
  createdAt: string;
}

interface SemesterRow {
  id: number;
  code: string;
  name: string;
  status: SemesterStatus;
  starts_on: string | null;
  ends_on: string | null;
  slot_definitions: SlotDefinitions;
  slots_confirmed: boolean;
  config: SemesterConfig;
  published_version: number;
  published_at: Date | null;
  activated_at: Date | null;
  archived_at: Date | null;
  created_at: Date;
}

const SEMESTER_COLUMNS = `id, code, name, status,
  to_char(starts_on, 'YYYY-MM-DD') as starts_on, to_char(ends_on, 'YYYY-MM-DD') as ends_on,
  slot_definitions, slots_confirmed, config, published_version, published_at,
  activated_at, archived_at, created_at`;

function toSemester(row: SemesterRow): Semester {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    status: row.status,
    startsOn: row.starts_on,
    endsOn: row.ends_on,
    slotDefinitions: row.slot_definitions ?? {},
    slotsConfirmed: row.slots_confirmed,
    config: row.config ?? {},
    publishedVersion: row.published_version,
    publishedAt: row.published_at?.toISOString() ?? null,
    activatedAt: row.activated_at?.toISOString() ?? null,
    archivedAt: row.archived_at?.toISOString() ?? null,
    createdAt: row.created_at.toISOString(),
  };
}

export class SemesterError extends Error {
  constructor(message: string, readonly status = 400, readonly details?: unknown) {
    super(message);
  }
}

// ---------------------------------------------------------------- the active semester

let activeCache: { at: number; value: Semester | null } | null = null;
const ACTIVE_TTL_MS = 30_000;

export function forgetActiveSemester(): void {
  activeCache = null;
}

/**
 * The semester students are in now, or null.
 *
 * Null also covers a database that migration 012 has not reached: the API can
 * be deployed before the migration is run, and sign-in and the public
 * timetable read this on every request. Callers treat null as "no semesters
 * yet" and fall back to the unscoped queries that worked before.
 */
export async function getActiveSemester(): Promise<Semester | null> {
  if (activeCache && Date.now() - activeCache.at < ACTIVE_TTL_MS) return activeCache.value;
  let value: Semester | null = null;
  try {
    const rows = await query<SemesterRow>(
      `select ${SEMESTER_COLUMNS} from semesters where status = 'active' limit 1`,
    );
    value = rows[0] ? toSemester(rows[0]) : null;
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code !== UNDEFINED_TABLE && code !== UNDEFINED_COLUMN) throw error;
  }
  activeCache = { at: Date.now(), value };
  return value;
}

export async function getActiveSemesterId(): Promise<number | null> {
  return (await getActiveSemester())?.id ?? null;
}

// ---------------------------------------------------------------- semesters

export interface SemesterSummary extends Semester {
  courseCount: number;
  needsReview: number;
  invalid: number;
  unpublishedChanges: number;
  liveCourseCount: number;
}

export async function listSemesters(): Promise<SemesterSummary[]> {
  const rows = await query<SemesterRow & {
    course_count: number; needs_review: number; invalid: number; dirty: number; live_count: number;
  }>(
    `select s.*,
            (select count(*) from semester_courses c where c.semester_id = s.id and not c.removed)::int as course_count,
            (select count(*) from semester_courses c
              where c.semester_id = s.id and not c.removed and c.review_status = 'needs_review')::int as needs_review,
            (select count(*) from semester_courses c
              where c.semester_id = s.id and not c.removed and c.review_status = 'invalid')::int as invalid,
            (select count(*) from semester_courses c where c.semester_id = s.id and c.dirty)::int as dirty,
            (select count(*) from course_offerings o where o.semester_id = s.id)::int as live_count
       from (select ${SEMESTER_COLUMNS} from semesters) s
      order by coalesce(s.starts_on, to_char(s.created_at, 'YYYY-MM-DD')) desc, s.id desc`,
  );
  return rows.map((row) => ({
    ...toSemester(row),
    courseCount: row.course_count,
    needsReview: row.needs_review,
    invalid: row.invalid,
    unpublishedChanges: row.dirty,
    liveCourseCount: row.live_count,
  }));
}

export async function getSemester(id: number, client?: PoolClient): Promise<Semester | null> {
  const sql = `select ${SEMESTER_COLUMNS} from semesters where id = $1`;
  const rows = client ? (await client.query<SemesterRow>(sql, [id])).rows : await query<SemesterRow>(sql, [id]);
  return rows[0] ? toSemester(rows[0]) : null;
}

export async function getSemesterByCode(code: string): Promise<Semester | null> {
  const rows = await query<SemesterRow>(`select ${SEMESTER_COLUMNS} from semesters where code = $1`, [code]);
  return rows[0] ? toSemester(rows[0]) : null;
}

export function semesterCode(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Creates a draft. The slot system and rules are copied from `copyFrom` (by
 * default the active semester) as a starting point - the slot grid rarely
 * changes - but stay unconfirmed until the admin has checked them against the
 * new semester's document.
 */
export async function createSemester(input: {
  name: string;
  startsOn?: string | null;
  endsOn?: string | null;
  copyFromId?: number | null;
}): Promise<Semester> {
  const code = semesterCode(input.name);
  if (!code) throw new SemesterError('Give the semester a name, e.g. "Jan-May 2027".');

  const source = input.copyFromId ? await getSemester(input.copyFromId) : await getActiveSemester();
  try {
    const rows = await query<SemesterRow>(
      `insert into semesters (code, name, status, starts_on, ends_on, slot_definitions, slots_confirmed, config)
       values ($1, $2, 'draft', $3, $4, $5::jsonb, false, $6::jsonb)
       returning ${SEMESTER_COLUMNS}`,
      [
        code, input.name.trim(), input.startsOn ?? null, input.endsOn ?? null,
        JSON.stringify(source?.slotDefinitions ?? {}), JSON.stringify(source?.config ?? {}),
      ],
    );
    return toSemester(rows[0]);
  } catch (error) {
    if ((error as { code?: string }).code === '23505') {
      throw new SemesterError(`A semester called "${input.name.trim()}" already exists.`, 409);
    }
    throw error;
  }
}

export async function updateSemester(
  id: number,
  patch: {
    name?: string;
    startsOn?: string | null;
    endsOn?: string | null;
    slotDefinitions?: SlotDefinitions;
    slotsConfirmed?: boolean;
    config?: SemesterConfig;
  },
): Promise<Semester | null> {
  const client = await pool.connect();
  try {
    await client.query('begin');
    const rows = await client.query<SemesterRow>(
      `update semesters
          set name             = coalesce($2, name),
              starts_on        = case when $3::boolean then $4::date else starts_on end,
              ends_on          = case when $5::boolean then $6::date else ends_on end,
              slot_definitions = coalesce($7::jsonb, slot_definitions),
              slots_confirmed  = coalesce($8::boolean, slots_confirmed),
              config           = coalesce($9::jsonb, config)
        where id = $1
        returning ${SEMESTER_COLUMNS}`,
      [
        id,
        patch.name?.trim() || null,
        patch.startsOn !== undefined, patch.startsOn ?? null,
        patch.endsOn !== undefined, patch.endsOn ?? null,
        patch.slotDefinitions ? JSON.stringify(patch.slotDefinitions) : null,
        patch.slotsConfirmed ?? null,
        patch.config ? JSON.stringify(patch.config) : null,
      ],
    );
    const semester = rows.rows[0] ? toSemester(rows.rows[0]) : null;
    // A changed slot table changes what every slot-based course expands to.
    if (semester && patch.slotDefinitions) await reexpandCatalogue(client, semester);
    await client.query('commit');
    forgetActiveSemester();
    return semester;
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}

// ---------------------------------------------------------------- uploaded files

export interface SemesterFile {
  id: number;
  name: string;
  kind: 'workbook' | 'slots';
  program: string | null;
  branch: string | null;
  size: number;
  sha256: string;
  uploadedAt: string;
}

const FILE_COLUMNS = 'id, name, kind, program, branch, size_bytes, sha256, uploaded_at';

function toFile(row: {
  id: number; name: string; kind: 'workbook' | 'slots'; program: string | null; branch: string | null;
  size_bytes: number; sha256: string; uploaded_at: Date;
}): SemesterFile {
  return {
    id: row.id, name: row.name, kind: row.kind, program: row.program, branch: row.branch,
    size: row.size_bytes, sha256: row.sha256, uploadedAt: row.uploaded_at.toISOString(),
  };
}

export async function listFiles(semesterId: number): Promise<SemesterFile[]> {
  const rows = await query<Parameters<typeof toFile>[0]>(
    `select ${FILE_COLUMNS} from semester_files where semester_id = $1 order by name`,
    [semesterId],
  );
  return rows.map(toFile);
}

export async function saveFile(input: {
  semesterId: number; name: string; kind: 'workbook' | 'slots'; content: Buffer; uploadedBy: string;
}): Promise<SemesterFile> {
  const rows = await query<Parameters<typeof toFile>[0]>(
    `insert into semester_files (semester_id, name, kind, size_bytes, sha256, content, uploaded_by)
     values ($1, $2, $3, $4, $5, $6, $7)
     on conflict (semester_id, name)
     do update set kind = excluded.kind, size_bytes = excluded.size_bytes, sha256 = excluded.sha256,
                   content = excluded.content, uploaded_by = excluded.uploaded_by, uploaded_at = now()
     returning ${FILE_COLUMNS}`,
    [
      input.semesterId, input.name, input.kind, input.content.length,
      crypto.createHash('sha256').update(input.content).digest('hex'), input.content, input.uploadedBy,
    ],
  );
  return toFile(rows[0]);
}

export async function setFileTarget(
  semesterId: number, fileId: number, program: string | null, branch: string | null,
): Promise<SemesterFile | null> {
  const rows = await query<Parameters<typeof toFile>[0]>(
    `update semester_files set program = $3, branch = $4
      where semester_id = $1 and id = $2 returning ${FILE_COLUMNS}`,
    [semesterId, fileId, program, branch],
  );
  return rows[0] ? toFile(rows[0]) : null;
}

export async function deleteFile(semesterId: number, fileId: number): Promise<boolean> {
  const rows = await query('delete from semester_files where semester_id = $1 and id = $2 returning id', [
    semesterId, fileId,
  ]);
  return rows.length > 0;
}

export async function readFiles(semesterId: number) {
  return query<{ name: string; kind: string; program: string | null; branch: string | null; content: Buffer }>(
    'select name, kind, program, branch, content from semester_files where semester_id = $1 order by name',
    [semesterId],
  );
}

// ---------------------------------------------------------------- catalogue

export interface CourseIssue {
  code: string;
  severity: 'blocking' | 'review' | 'info';
  message: string;
  /** 'parser' came from the import; 'schedule' from expanding the schedule. */
  origin: 'parser' | 'schedule' | 'import';
  resolved?: boolean;
  detail?: Record<string, unknown>;
}

export type ReviewStatus = 'ok' | 'needs_review' | 'invalid';

export interface SourceRow {
  file: string;
  sheet: string;
  row: number;
  cells: Record<string, string>;
}

export interface CatalogueCourse {
  id: number;
  semesterId: number;
  program: string;
  branch: string;
  courseCode: string;
  courseName: string;
  credits: string | null;
  category: string | null;
  instructors: string[];
  rawSlot: string | null;
  origin: 'import' | 'manual' | 'legacy';
  sourceRows: SourceRow[];
  parsed: {
    schedule: CourseSchedule; courseName: string; credits: string; category: string; instructors: string[];
    /** What the parser found, kept apart from the course's live issue list. */
    issues?: CourseIssue[];
  } | null;
  schedule: CourseSchedule;
  meetings: TimetableMeeting[];
  issues: CourseIssue[];
  reviewStatus: ReviewStatus;
  manual: boolean;
  manualAt: string | null;
  removed: boolean;
  dirty: boolean;
  importChange: string | null;
  previousMeetings: TimetableMeeting[] | null;
  updatedAt: string;
}

interface CatalogueRow {
  id: number; semester_id: number; program: string; branch: string; course_code: string;
  course_name: string; credits: string | null; category: string | null; instructors: string[];
  raw_slot: string | null; origin: CatalogueCourse['origin']; source_rows: SourceRow[];
  source_hash: string | null; parsed: CatalogueCourse['parsed']; schedule: CourseSchedule;
  meetings: TimetableMeeting[]; issues: CourseIssue[]; review_status: ReviewStatus; manual: boolean;
  manual_source_hash: string | null; manual_at: Date | null; removed: boolean; dirty: boolean;
  import_change: string | null; previous_meetings: TimetableMeeting[] | null; updated_at: Date;
}

function toCourse(row: CatalogueRow): CatalogueCourse {
  return {
    id: row.id, semesterId: row.semester_id, program: row.program, branch: row.branch,
    courseCode: row.course_code, courseName: row.course_name, credits: row.credits,
    category: row.category, instructors: row.instructors ?? [], rawSlot: row.raw_slot,
    origin: row.origin, sourceRows: row.source_rows ?? [], parsed: row.parsed,
    schedule: { assignments: row.schedule?.assignments ?? [], custom: row.schedule?.custom ?? [] },
    meetings: row.meetings ?? [], issues: row.issues ?? [], reviewStatus: row.review_status,
    manual: row.manual, manualAt: row.manual_at?.toISOString() ?? null, removed: row.removed,
    dirty: row.dirty, importChange: row.import_change, previousMeetings: row.previous_meetings,
    updatedAt: row.updated_at.toISOString(),
  };
}

export function reviewStatusOf(issues: CourseIssue[]): ReviewStatus {
  const open = issues.filter((entry) => !entry.resolved);
  if (open.some((entry) => entry.severity === 'blocking')) return 'invalid';
  if (open.some((entry) => entry.severity === 'review')) return 'needs_review';
  return 'ok';
}

/** Expands a schedule and folds what went wrong into the course's issue list. */
function expandWithIssues(
  schedule: CourseSchedule,
  slots: SlotDefinitions,
  instructors: string[],
  otherIssues: CourseIssue[],
): { meetings: TimetableMeeting[]; issues: CourseIssue[] } {
  const { meetings, problems } = expandSchedule(schedule, slots, { instructors });
  const issues: CourseIssue[] = [
    ...otherIssues.filter((entry) => entry.origin !== 'schedule'),
    ...problems.map((problem) => ({ ...problem, origin: 'schedule' as const })),
  ];
  return { meetings, issues };
}

export async function listCourses(semesterId: number): Promise<CatalogueCourse[]> {
  const rows = await query<CatalogueRow>(
    `select * from semester_courses where semester_id = $1 order by program, branch, course_code`,
    [semesterId],
  );
  return rows.map(toCourse);
}

export async function getCourse(semesterId: number, courseId: number): Promise<CatalogueCourse | null> {
  const rows = await query<CatalogueRow>(
    'select * from semester_courses where semester_id = $1 and id = $2',
    [semesterId, courseId],
  );
  return rows[0] ? toCourse(rows[0]) : null;
}

export interface CourseEdit {
  courseCode?: string;
  courseName?: string;
  credits?: string | null;
  category?: string | null;
  instructors?: string[];
  schedule?: CourseSchedule;
  /** Marks every open parser finding as seen and dealt with. */
  resolveIssues?: boolean;
  removed?: boolean;
}

/**
 * Saves a manual correction. The course is marked `manual` against the source
 * it was corrected from, which is what keeps the correction through a
 * re-import of unchanged files.
 */
export async function saveCourse(
  semesterId: number,
  courseId: number,
  edit: CourseEdit,
  actor: string,
): Promise<CatalogueCourse | null> {
  const client = await pool.connect();
  try {
    await client.query('begin');
    const semester = await getSemester(semesterId, client);
    const found = await client.query<CatalogueRow>(
      'select * from semester_courses where semester_id = $1 and id = $2 for update',
      [semesterId, courseId],
    );
    const row = found.rows[0];
    if (!semester || !row) {
      await client.query('rollback');
      return null;
    }

    const instructors = edit.instructors ?? row.instructors ?? [];
    const schedule = edit.schedule ?? row.schedule;
    let issues: CourseIssue[] = row.issues ?? [];
    if (edit.resolveIssues || edit.schedule) {
      // Saving a correction is the review: the findings it answers are closed.
      issues = issues.map((entry) => (entry.origin === 'schedule' ? entry : { ...entry, resolved: true }));
    }
    if (edit.courseCode && !/^NOCODE-/.test(edit.courseCode)) {
      issues = issues.filter((entry) => entry.code !== 'missing_code');
    }
    if ((edit.courseName ?? row.course_name).trim()) {
      issues = issues.filter((entry) => entry.code !== 'missing_name');
    }
    const expanded = expandWithIssues(schedule, semester.slotDefinitions, instructors, issues);

    const code = (edit.courseCode ?? row.course_code).trim().toUpperCase().replace(/\s+/g, '');
    if (!code) throw new SemesterError('A course needs a code.');

    const updated = await client.query<CatalogueRow>(
      `update semester_courses
          set course_code = $3, course_name = $4, credits = $5, category = $6, instructors = $7,
              schedule = $8::jsonb, meetings = $9::jsonb, issues = $10::jsonb, review_status = $11,
              manual = true, manual_source_hash = source_hash, manual_at = now(), manual_by = $12,
              removed = $13, dirty = true
        where semester_id = $1 and id = $2
        returning *`,
      [
        semesterId, courseId, code,
        (edit.courseName ?? row.course_name).trim(),
        edit.credits !== undefined ? edit.credits : row.credits,
        edit.category !== undefined ? edit.category : row.category,
        instructors,
        JSON.stringify(schedule), JSON.stringify(expanded.meetings), JSON.stringify(expanded.issues),
        reviewStatusOf(expanded.issues), actor,
        edit.removed ?? row.removed,
      ],
    );
    await client.query('commit');
    return toCourse(updated.rows[0]);
  } catch (error) {
    await client.query('rollback');
    if ((error as { code?: string }).code === '23505') {
      throw new SemesterError('This branch already has a course with that code.', 409);
    }
    throw error;
  } finally {
    client.release();
  }
}

/** Throws away a manual correction and goes back to what the import produced. */
export async function resetCourseToParsed(
  semesterId: number,
  courseId: number,
): Promise<CatalogueCourse | null> {
  const client = await pool.connect();
  try {
    await client.query('begin');
    const semester = await getSemester(semesterId, client);
    const found = await client.query<CatalogueRow>(
      'select * from semester_courses where semester_id = $1 and id = $2 for update',
      [semesterId, courseId],
    );
    const row = found.rows[0];
    if (!semester || !row) {
      await client.query('rollback');
      return null;
    }
    if (!row.parsed) throw new SemesterError('This course was not imported, so there is nothing to go back to.');

    // The parser's own findings for the current source, reopened: going back
    // to the imported version means its problems are open again too.
    const issues = (row.parsed.issues ?? (row.issues ?? []).filter((entry) => entry.origin === 'parser'))
      .map(({ resolved: _resolved, ...entry }) => entry);
    const expanded = expandWithIssues(row.parsed.schedule, semester.slotDefinitions, row.parsed.instructors, issues);
    const updated = await client.query<CatalogueRow>(
      `update semester_courses
          set course_name = $3, credits = $4, category = $5, instructors = $6, schedule = $7::jsonb,
              meetings = $8::jsonb, issues = $9::jsonb, review_status = $10, manual = false,
              manual_source_hash = null, manual_at = null, manual_by = null, dirty = true
        where semester_id = $1 and id = $2
        returning *`,
      [
        semesterId, courseId, row.parsed.courseName, row.parsed.credits, row.parsed.category,
        row.parsed.instructors, JSON.stringify(row.parsed.schedule), JSON.stringify(expanded.meetings),
        JSON.stringify(expanded.issues), reviewStatusOf(expanded.issues),
      ],
    );
    await client.query('commit');
    return toCourse(updated.rows[0]);
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}

export async function createCourse(
  semesterId: number,
  input: { program: string; branch: string; courseCode: string; courseName: string; credits?: string; category?: string },
  actor: string,
): Promise<CatalogueCourse> {
  try {
    const rows = await query<CatalogueRow>(
      `insert into semester_courses
         (semester_id, program, branch, course_code, course_name, credits, category, origin,
          manual, manual_at, manual_by)
       values ($1, $2, $3, $4, $5, $6, $7, 'manual', true, now(), $8)
       returning *`,
      [
        semesterId, input.program, input.branch.trim(),
        input.courseCode.trim().toUpperCase().replace(/\s+/g, ''), input.courseName.trim(),
        input.credits ?? null, input.category ?? null, actor,
      ],
    );
    return toCourse(rows[0]);
  } catch (error) {
    if ((error as { code?: string }).code === '23505') {
      throw new SemesterError('This branch already has a course with that code.', 409);
    }
    throw error;
  }
}

/** Re-expands every slot-based course after the slot table changed. */
async function reexpandCatalogue(client: PoolClient, semester: Semester): Promise<void> {
  const rows = await client.query<CatalogueRow>(
    'select * from semester_courses where semester_id = $1 for update',
    [semester.id],
  );
  for (const row of rows.rows) {
    if (!row.schedule?.assignments?.length) continue;
    const expanded = expandWithIssues(row.schedule, semester.slotDefinitions, row.instructors ?? [], row.issues ?? []);
    if (sameMeetings(expanded.meetings, row.meetings ?? []) &&
        JSON.stringify(expanded.issues) === JSON.stringify(row.issues ?? [])) continue;
    await client.query(
      `update semester_courses
          set meetings = $2::jsonb, issues = $3::jsonb, review_status = $4, dirty = true
        where id = $1`,
      [row.id, JSON.stringify(expanded.meetings), JSON.stringify(expanded.issues), reviewStatusOf(expanded.issues)],
    );
  }
}

// ---------------------------------------------------------------- import

export interface ParsedCourse {
  program: string;
  branch: string;
  courseCode: string;
  courseName: string;
  credits: string;
  category: string;
  instructors: string[];
  rawSlot: string;
  remarks: string[];
  availability?: string;
  sourceRows: SourceRow[];
  schedule: CourseSchedule;
  issues: Array<Omit<CourseIssue, 'origin'>>;
}

export interface ParsedImport {
  parserVersion: string;
  semester?: string | null;
  slots: {
    status: 'parsed' | 'failed' | 'missing';
    definitions: SlotDefinitions;
    issues: Array<{ slot: string | null; message: string }>;
    file?: string | null;
  };
  files: Array<Record<string, unknown>>;
  courses: ParsedCourse[];
  warnings: Array<{ file: string | null; sheet: string | null; row: number | null; message: string }>;
}

export interface ImportSummary {
  importId: number;
  total: number;
  ok: number;
  needsReview: number;
  invalid: number;
  added: string[];
  modified: string[];
  removed: string[];
  unchanged: number;
  keptManual: string[];
  revalidate: string[];
  slots: {
    status: string;
    adopted: boolean;
    differs: string[];
    issues: Array<{ slot: string | null; message: string }>;
  };
  warnings: ParsedImport['warnings'];
}

/** Everything in the source that could change how a course is read. */
function sourceHash(course: ParsedCourse): string {
  return crypto
    .createHash('sha1')
    .update(JSON.stringify([
      course.courseName, course.credits, course.rawSlot, course.remarks,
      course.sourceRows.map((row) => [row.sheet, row.cells]),
    ]))
    .digest('hex');
}

function slotsDiffer(a: SlotDefinitions, b: SlotDefinitions): string[] {
  const codes = new Set([...Object.keys(a), ...Object.keys(b)]);
  return [...codes].filter((code) => JSON.stringify(a[code] ?? null) !== JSON.stringify(b[code] ?? null)).sort();
}

const courseKey = (c: { program: string; branch: string; courseCode: string }) =>
  `${c.program}/${c.branch}/${c.courseCode}`;

/**
 * Merges a parsed import into the semester's draft.
 *
 * A course the admin corrected by hand keeps the correction for as long as
 * its source rows are unchanged. If the institute changed those rows, the
 * correction is still kept - it is never silently replaced - but the course
 * is flagged so the admin decides which of the two stands.
 */
export async function applyImport(
  semesterId: number,
  parsed: ParsedImport,
  actor: string,
): Promise<ImportSummary> {
  const client = await pool.connect();
  try {
    await client.query('begin');
    const locked = await client.query<SemesterRow>(
      `select ${SEMESTER_COLUMNS} from semesters where id = $1 for update`,
      [semesterId],
    );
    if (!locked.rows[0]) throw new SemesterError('No such semester.', 404);
    let semester = toSemester(locked.rows[0]);
    if (semester.status === 'archived') throw new SemesterError('An archived semester cannot be re-imported.', 409);

    // ---- slots: adopt the document's only while nobody has confirmed a table.
    const documentSlots = parsed.slots.status === 'parsed' ? parsed.slots.definitions : null;
    const differs = documentSlots ? slotsDiffer(documentSlots, semester.slotDefinitions) : [];
    let adopted = false;
    if (documentSlots && differs.length > 0 && !semester.slotsConfirmed) {
      await client.query('update semesters set slot_definitions = $2::jsonb where id = $1', [
        semesterId, JSON.stringify(documentSlots),
      ]);
      semester = { ...semester, slotDefinitions: documentSlots };
      adopted = true;
    }
    const slots = semester.slotDefinitions;

    const existingRows = await client.query<CatalogueRow>(
      'select * from semester_courses where semester_id = $1 for update',
      [semesterId],
    );
    const existing = new Map(existingRows.rows.map((row) => [
      courseKey({ program: row.program, branch: row.branch, courseCode: row.course_code }), row,
    ]));

    const summary: ImportSummary = {
      importId: 0, total: parsed.courses.length, ok: 0, needsReview: 0, invalid: 0,
      added: [], modified: [], removed: [], unchanged: 0, keptManual: [], revalidate: [],
      slots: { status: parsed.slots.status, adopted, differs: adopted ? [] : differs, issues: parsed.slots.issues },
      warnings: parsed.warnings,
    };
    const seen = new Set<string>();

    for (const course of parsed.courses) {
      const key = courseKey(course);
      if (seen.has(key)) continue;
      seen.add(key);

      const hash = sourceHash(course);
      const parserIssues: CourseIssue[] = course.issues.map((entry) => ({ ...entry, origin: 'parser' }));
      const fresh = expandWithIssues(course.schedule, slots, course.instructors, parserIssues);
      const parsedCopy = {
        schedule: course.schedule, courseName: course.courseName, credits: course.credits,
        category: course.category, instructors: course.instructors, issues: parserIssues,
      };
      const row = existing.get(key);

      if (!row) {
        await client.query(
          `insert into semester_courses
             (semester_id, program, branch, course_code, course_name, credits, category, instructors, raw_slot,
              origin, source_rows, source_hash, parsed, schedule, meetings, issues, review_status, import_change)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9,'import',$10::jsonb,$11,$12::jsonb,$13::jsonb,$14::jsonb,$15::jsonb,$16,'added')`,
          [
            semesterId, course.program, course.branch, course.courseCode, course.courseName,
            course.credits || null, course.category || null, course.instructors, course.rawSlot || null,
            JSON.stringify(course.sourceRows), hash, JSON.stringify(parsedCopy),
            JSON.stringify(course.schedule), JSON.stringify(fresh.meetings), JSON.stringify(fresh.issues),
            reviewStatusOf(fresh.issues),
          ],
        );
        summary.added.push(key);
        continue;
      }

      if (row.manual) {
        // manual_source_hash is null for corrections that predate any import
        // (an approved change request, an edit in the old slot editor).
        const sourceChanged = row.manual_source_hash !== null && row.manual_source_hash !== hash;
        const firstSight = row.manual_source_hash === null && row.source_hash === null;
        const differsFromParse = !sameMeetings(row.meetings ?? [], fresh.meetings);
        let issues = (row.issues ?? []).filter((entry) => entry.code !== 'source_changed');
        const flag = sourceChanged || (firstSight && differsFromParse);
        if (flag) {
          issues = [...issues, {
            code: 'source_changed',
            severity: 'review',
            origin: 'import',
            message: sourceChanged
              ? 'The institute changed this course\'s row after you corrected it. Your correction was kept; ' +
                'check it against the new source, then keep it or go back to the imported version.'
              : 'This course was corrected by hand earlier and the import reads it differently. ' +
                'Your version was kept; compare the two.',
          }];
        }
        await client.query(
          `update semester_courses
              set source_rows = $2::jsonb, source_hash = $3, parsed = $4::jsonb, raw_slot = $5,
                  issues = $6::jsonb, review_status = $7, removed = false,
                  manual_source_hash = case when $8 then manual_source_hash else $3 end,
                  import_change = $9, previous_meetings = null
            where id = $1`,
          [
            row.id, JSON.stringify(course.sourceRows), hash, JSON.stringify(parsedCopy), course.rawSlot || null,
            JSON.stringify(issues), reviewStatusOf(issues), flag, flag ? 'revalidate' : 'kept_manual',
          ],
        );
        (flag ? summary.revalidate : summary.keptManual).push(key);
        continue;
      }

      const changed = !sameMeetings(row.meetings ?? [], fresh.meetings) ||
        row.course_name !== course.courseName || (row.credits ?? '') !== (course.credits ?? '');
      await client.query(
        `update semester_courses
            set course_name = $2, credits = $3, category = $4, instructors = $5, raw_slot = $6,
                source_rows = $7::jsonb, source_hash = $8, parsed = $9::jsonb, schedule = $10::jsonb,
                meetings = $11::jsonb, issues = $12::jsonb, review_status = $13, removed = false,
                origin = case when origin = 'manual' then origin else 'import' end,
                dirty = dirty or $14, import_change = $15,
                previous_meetings = case when $14 then meetings else null end
          where id = $1`,
        [
          row.id, course.courseName, course.credits || null, course.category || row.category,
          course.instructors, course.rawSlot || null, JSON.stringify(course.sourceRows), hash,
          JSON.stringify(parsedCopy), JSON.stringify(course.schedule), JSON.stringify(fresh.meetings),
          JSON.stringify(fresh.issues), reviewStatusOf(fresh.issues), changed || row.removed,
          changed ? 'modified' : 'unchanged',
        ],
      );
      if (changed) summary.modified.push(key);
      else summary.unchanged += 1;
    }

    // Courses the files no longer list. Hand-made ones are not the files' to remove.
    for (const [key, row] of existing) {
      if (seen.has(key) || row.removed || row.origin === 'manual') continue;
      await client.query(
        `update semester_courses set removed = true, dirty = true, import_change = 'removed' where id = $1`,
        [row.id],
      );
      summary.removed.push(key);
    }

    const counts = await client.query<{ review_status: ReviewStatus; n: number }>(
      `select review_status, count(*)::int as n from semester_courses
        where semester_id = $1 and not removed group by review_status`,
      [semesterId],
    );
    for (const entry of counts.rows) {
      if (entry.review_status === 'ok') summary.ok = entry.n;
      else if (entry.review_status === 'needs_review') summary.needsReview = entry.n;
      else summary.invalid = entry.n;
    }

    const saved = await client.query<{ id: number }>(
      `insert into semester_imports (semester_id, parser_version, files, summary, slot_report, warnings, created_by)
       values ($1, $2, $3::jsonb, $4::jsonb, $5::jsonb, $6::jsonb, $7)
       returning id`,
      [
        semesterId, parsed.parserVersion, JSON.stringify(parsed.files), JSON.stringify(summary),
        JSON.stringify({ ...parsed.slots, adopted, differs }), JSON.stringify(parsed.warnings), actor,
      ],
    );
    summary.importId = saved.rows[0].id;
    await client.query('update semester_imports set summary = $2::jsonb where id = $1', [
      summary.importId, JSON.stringify(summary),
    ]);

    await client.query('commit');
    forgetActiveSemester();
    return summary;
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}

export async function latestImport(semesterId: number) {
  const rows = await query<{
    id: number; parser_version: string | null; files: unknown; summary: ImportSummary;
    slot_report: Record<string, unknown>; created_at: Date; created_by: string | null;
  }>(
    `select id, parser_version, files, summary, slot_report, created_at, created_by
       from semester_imports where semester_id = $1 order by created_at desc, id desc limit 1`,
    [semesterId],
  );
  const row = rows[0];
  return row
    ? {
        id: row.id, parserVersion: row.parser_version, files: row.files, summary: row.summary,
        slotReport: row.slot_report, createdAt: row.created_at.toISOString(), createdBy: row.created_by,
      }
    : null;
}

// ---------------------------------------------------------------- publishing

interface SnapshotCourse {
  program: string;
  branch: string;
  courseCode: string;
  courseName: string;
  credits: string | null;
  category: string | null;
  instructors: string[];
  rawSlot: string | null;
  manual: boolean;
  schedule: CourseSchedule;
  meetings: TimetableMeeting[];
}

interface SnapshotPayload {
  semester: { code: string; name: string };
  slots: SlotDefinitions;
  config: SemesterConfig;
  courses: SnapshotCourse[];
}

/** The meetings of live offerings as the JSON the draft and the API both use. */
export const LIVE_MEETINGS_JSON = `
  select jsonb_agg(
           jsonb_strip_nulls(jsonb_build_object(
             'type', cm.type,
             'day', cm.day,
             'startTime', to_char(cm.start_time, 'HH24:MI'),
             'endTime', to_char(cm.end_time, 'HH24:MI'),
             'room', coalesce(cm.room, ''),
             'instructors', to_jsonb(cm.instructors),
             'recurrence', jsonb_build_object('type', cm.recurrence),
             'slot', cm.slot_code,
             'batches', cm.batches,
             'date', to_char(cm.on_date, 'YYYY-MM-DD')
           )) order by cm.sort_order)
    from course_meetings cm`;

/** Inserts `$2::jsonb` (a list of meetings) for every offering id in `$1::text[]`. */
export const INSERT_MEETINGS_SQL = `
  insert into course_meetings
    (offering_id, type, day, start_time, end_time, room, instructors, recurrence, sort_order,
     slot_code, batches, on_date)
  select o.id,
         e.m->>'type',
         e.m->>'day',
         (e.m->>'startTime')::time,
         (e.m->>'endTime')::time,
         nullif(btrim(e.m->>'room'), ''),
         coalesce(array(select jsonb_array_elements_text(
           case when jsonb_typeof(e.m->'instructors') = 'array' then e.m->'instructors' else '[]'::jsonb end
         )), '{}'::text[]),
         coalesce(e.m->'recurrence'->>'type', 'weekly'),
         (e.ord - 1)::smallint,
         nullif(e.m->>'slot', ''),
         nullif(btrim(e.m->>'batches'), ''),
         nullif(e.m->>'date', '')::date
    from unnest($1::text[]) as o(id)
   cross join jsonb_array_elements($2::jsonb) with ordinality as e(m, ord)`;

async function writeLive(client: PoolClient, semester: Semester, courses: SnapshotCourse[]): Promise<void> {
  // Offerings keep their ids across publications where they already had one.
  const current = await client.query<{ id: string; program: string; branch: string; course_code: string }>(
    'select id, program, branch, course_code from course_offerings where semester_id = $1',
    [semester.id],
  );
  const ids = new Map(current.rows.map((row) => [
    courseKey({ program: row.program, branch: row.branch, courseCode: row.course_code }), row.id,
  ]));

  await client.query('delete from course_offerings where semester_id = $1', [semester.id]);
  if (courses.length === 0) return;

  const rows = courses.map((course) => ({
    id: ids.get(courseKey(course)) ?? `${semester.code}/${course.program}_${course.branch}_${course.courseCode}`,
    program: course.program,
    branch: course.branch,
    course_code: course.courseCode,
    course_name: course.courseName,
    credits: course.credits,
    category: course.category,
    raw_slot: course.rawSlot,
    instructors: course.instructors ?? [],
    source: course.manual ? 'admin' : 'seed',
    meetings: course.meetings ?? [],
  }));

  await client.query(
    `insert into course_offerings
       (id, program, branch, course_code, course_name, credits, category, raw_slot, semester, semester_id,
        instructors, source, customized_at)
     select r->>'id', r->>'program', r->>'branch', r->>'course_code', r->>'course_name', r->>'credits',
            r->>'category', r->>'raw_slot', $2, $3,
            coalesce(array(select jsonb_array_elements_text(r->'instructors')), '{}'::text[]),
            r->>'source', case when r->>'source' = 'admin' then now() end
       from jsonb_array_elements($1::jsonb) as r`,
    [JSON.stringify(rows), semester.name, semester.id],
  );

  await client.query(
    `insert into course_meetings
       (offering_id, type, day, start_time, end_time, room, instructors, recurrence, sort_order,
        slot_code, batches, on_date)
     select r->>'id',
            e.m->>'type', e.m->>'day', (e.m->>'startTime')::time, (e.m->>'endTime')::time,
            nullif(btrim(e.m->>'room'), ''),
            coalesce(array(select jsonb_array_elements_text(
              case when jsonb_typeof(e.m->'instructors') = 'array' then e.m->'instructors' else '[]'::jsonb end
            )), '{}'::text[]),
            coalesce(e.m->'recurrence'->>'type', 'weekly'),
            (e.ord - 1)::smallint,
            nullif(e.m->>'slot', ''), nullif(btrim(e.m->>'batches'), ''), nullif(e.m->>'date', '')::date
       from jsonb_array_elements($1::jsonb) as r
      cross join jsonb_array_elements(r->'meetings') with ordinality as e(m, ord)`,
    [JSON.stringify(rows)],
  );
}

export interface PublishCheck {
  ready: boolean;
  blocking: Array<{ id: number; key: string; issues: string[] }>;
  slotsConfirmed: boolean;
  courseCount: number;
  needsReview: number;
  unpublishedChanges: number;
}

export async function checkPublishable(semesterId: number): Promise<PublishCheck | null> {
  const semester = await getSemester(semesterId);
  if (!semester) return null;
  const rows = await query<CatalogueRow>(
    'select * from semester_courses where semester_id = $1 and not removed',
    [semesterId],
  );
  const dirty = await query<{ n: number }>(
    'select count(*)::int as n from semester_courses where semester_id = $1 and dirty',
    [semesterId],
  );
  const blocking = rows
    .filter((row) => row.review_status === 'invalid')
    .map((row) => ({
      id: row.id,
      key: courseKey({ program: row.program, branch: row.branch, courseCode: row.course_code }),
      issues: (row.issues ?? [])
        .filter((entry) => entry.severity === 'blocking' && !entry.resolved)
        .map((entry) => entry.message),
    }));
  return {
    ready: blocking.length === 0 && semester.slotsConfirmed && rows.length > 0 && semester.status !== 'archived',
    blocking,
    slotsConfirmed: semester.slotsConfirmed,
    courseCount: rows.length,
    needsReview: rows.filter((row) => row.review_status === 'needs_review').length,
    unpublishedChanges: dirty[0].n,
  };
}

export interface PublishResult {
  semester: Semester;
  version: number;
  courses: number;
}

/**
 * Publishes the draft: one transaction replaces the semester's live offerings
 * and records exactly what was written as the next snapshot version. Either
 * all of it happens or none of it does. Only this semester's rows are touched.
 */
export async function publishSemester(
  semesterId: number,
  input: { actor: string; note?: string | null },
): Promise<PublishResult> {
  const client = await pool.connect();
  try {
    await client.query('begin');
    const locked = await client.query<SemesterRow>(
      `select ${SEMESTER_COLUMNS} from semesters where id = $1 for update`,
      [semesterId],
    );
    if (!locked.rows[0]) throw new SemesterError('No such semester.', 404);
    const semester = toSemester(locked.rows[0]);
    if (semester.status === 'archived') throw new SemesterError('An archived semester cannot be published.', 409);
    if (!semester.slotsConfirmed) {
      throw new SemesterError('Confirm the slot table before publishing.', 409);
    }

    const rows = await client.query<CatalogueRow>(
      `select * from semester_courses where semester_id = $1 and not removed
        order by program, branch, course_code for update`,
      [semesterId],
    );
    if (rows.rows.length === 0) throw new SemesterError('There are no courses to publish.', 409);

    const blocked = rows.rows.filter((row) => row.review_status === 'invalid');
    if (blocked.length > 0) {
      throw new SemesterError(
        `${blocked.length} course${blocked.length === 1 ? ' has' : 's have'} errors that must be fixed first.`,
        409,
        blocked.map((row) => ({ id: row.id, courseCode: row.course_code, branch: row.branch })),
      );
    }

    const courses: SnapshotCourse[] = rows.rows.map((row) => ({
      program: row.program, branch: row.branch, courseCode: row.course_code, courseName: row.course_name,
      credits: row.credits, category: row.category, instructors: row.instructors ?? [], rawSlot: row.raw_slot,
      manual: row.manual, schedule: row.schedule, meetings: row.meetings ?? [],
    }));
    const version = semester.publishedVersion + 1;
    const payload: SnapshotPayload = {
      semester: { code: semester.code, name: semester.name },
      slots: semester.slotDefinitions, config: semester.config, courses,
    };

    await client.query(
      `insert into semester_snapshots (semester_id, version, kind, payload, course_count, note, created_by)
       values ($1, $2, 'publish', $3::jsonb, $4, $5, $6)`,
      [semesterId, version, JSON.stringify(payload), courses.length, input.note ?? null, input.actor],
    );
    await writeLive(client, semester, courses);
    await client.query('update semester_courses set dirty = false where semester_id = $1', [semesterId]);
    const updated = await client.query<SemesterRow>(
      `update semesters
          set published_version = $2, published_at = now(),
              status = case when status = 'draft' then 'published' else status end
        where id = $1
        returning ${SEMESTER_COLUMNS}`,
      [semesterId, version],
    );
    // Old versions are kept for rollback, but not without limit.
    await client.query(
      'delete from semester_snapshots where semester_id = $1 and version <= $2',
      [semesterId, version - 12],
    );

    await client.query('commit');
    forgetActiveSemester();
    return { semester: toSemester(updated.rows[0]), version, courses: courses.length };
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}

export async function listSnapshots(semesterId: number) {
  const rows = await query<{
    version: number; kind: string; course_count: number; note: string | null; created_at: Date; created_by: string | null;
  }>(
    `select version, kind, course_count, note, created_at, created_by
       from semester_snapshots where semester_id = $1 order by version desc`,
    [semesterId],
  );
  return rows.map((row) => ({
    version: row.version, kind: row.kind, courseCount: row.course_count, note: row.note,
    createdAt: row.created_at.toISOString(), createdBy: row.created_by,
  }));
}

/**
 * Restores an earlier publication, as a new version: the draft and the live
 * timetable both go back to what that snapshot recorded, and the rollback is
 * itself recorded, so it can be undone the same way.
 */
export async function rollbackSemester(
  semesterId: number,
  version: number,
  actor: string,
): Promise<PublishResult> {
  const client = await pool.connect();
  try {
    await client.query('begin');
    const locked = await client.query<SemesterRow>(
      `select ${SEMESTER_COLUMNS} from semesters where id = $1 for update`,
      [semesterId],
    );
    if (!locked.rows[0]) throw new SemesterError('No such semester.', 404);
    const semester = toSemester(locked.rows[0]);
    const found = await client.query<{ payload: SnapshotPayload }>(
      'select payload from semester_snapshots where semester_id = $1 and version = $2',
      [semesterId, version],
    );
    if (!found.rows[0]) throw new SemesterError(`Version ${version} is not available.`, 404);
    const payload = found.rows[0].payload;
    const next = semester.publishedVersion + 1;

    const restored: Semester = { ...semester, slotDefinitions: payload.slots, config: payload.config };
    await client.query(
      `update semesters set slot_definitions = $2::jsonb, config = $3::jsonb,
              published_version = $4, published_at = now()
        where id = $1`,
      [semesterId, JSON.stringify(payload.slots), JSON.stringify(payload.config), next],
    );

    // The draft follows: a course the snapshot does not have is set aside, not deleted.
    await client.query(
      `update semester_courses sc set removed = true, dirty = false
        where sc.semester_id = $1
          and not exists (
            select 1 from jsonb_array_elements($2::jsonb) c
             where c->>'program' = sc.program and c->>'branch' = sc.branch and c->>'courseCode' = sc.course_code)`,
      [semesterId, JSON.stringify(payload.courses)],
    );
    await client.query(
      `insert into semester_courses
         (semester_id, program, branch, course_code, course_name, credits, category, instructors, raw_slot,
          origin, schedule, meetings, manual, manual_at, manual_by, dirty)
       select $1, c->>'program', c->>'branch', c->>'courseCode', c->>'courseName', c->>'credits', c->>'category',
              coalesce(array(select jsonb_array_elements_text(c->'instructors')), '{}'::text[]),
              c->>'rawSlot', 'manual', c->'schedule', c->'meetings', (c->>'manual')::boolean,
              case when (c->>'manual')::boolean then now() end, $3, false
         from jsonb_array_elements($2::jsonb) c
       on conflict (semester_id, program, branch, course_code)
       do update set course_name = excluded.course_name, credits = excluded.credits,
                     category = excluded.category, instructors = excluded.instructors,
                     schedule = excluded.schedule, meetings = excluded.meetings,
                     manual = excluded.manual, removed = false, dirty = false,
                     issues = '[]'::jsonb, review_status = 'ok'`,
      [semesterId, JSON.stringify(payload.courses), actor],
    );

    await client.query(
      `insert into semester_snapshots (semester_id, version, kind, payload, course_count, note, created_by)
       values ($1, $2, 'rollback', $3::jsonb, $4, $5, $6)`,
      [semesterId, next, JSON.stringify(payload), payload.courses.length, `Rolled back to version ${version}.`, actor],
    );
    await writeLive(client, restored, payload.courses);

    const updated = await client.query<SemesterRow>(
      `select ${SEMESTER_COLUMNS} from semesters where id = $1`,
      [semesterId],
    );
    await client.query('commit');
    forgetActiveSemester();
    return { semester: toSemester(updated.rows[0]), version: next, courses: payload.courses.length };
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Makes a published semester the current one. The semester it replaces is
 * archived, never deleted: its courses, and every student's selections and
 * personal timings for it, stay where they are.
 */
export async function activateSemester(semesterId: number, actor: string): Promise<{
  semester: Semester;
  archived: Semester | null;
  closedRequests: number;
}> {
  const client = await pool.connect();
  try {
    await client.query('begin');
    // Both rows locked in id order, so two activations cannot deadlock.
    await client.query(
      `select id from semesters where id = $1 or status = 'active' order by id for update`,
      [semesterId],
    );
    const target = await getSemester(semesterId, client);
    if (!target) throw new SemesterError('No such semester.', 404);
    if (target.status === 'active') throw new SemesterError(`${target.name} is already the current semester.`, 409);
    if (target.status === 'draft' || target.publishedVersion === 0) {
      throw new SemesterError('Publish the semester before making it current.', 409);
    }

    const previous = await client.query<SemesterRow>(
      `update semesters set status = 'archived', archived_at = now()
        where status = 'active' returning ${SEMESTER_COLUMNS}`,
    );
    const updated = await client.query<SemesterRow>(
      `update semesters set status = 'active', activated_at = now(), archived_at = null
        where id = $1 returning ${SEMESTER_COLUMNS}`,
      [semesterId],
    );

    let closedRequests = 0;
    if (previous.rows[0]) {
      // Requests against last semester's timetable can no longer be acted on.
      const closed = await client.query(
        `update course_change_requests
            set status = 'superseded', decided_at = now(), decided_by_roll = $2,
                decision_note = 'The semester ended before this was reviewed.'
          where semester_id = $1 and status = 'pending'`,
        [previous.rows[0].id, actor],
      );
      closedRequests = closed.rowCount ?? 0;
      await client.query(
        `update course_change_requests
            set proposal_state = 'closed', proposal_state_note = 'The semester ended.'
          where semester_id = $1 and proposal_state = 'open'`,
        [previous.rows[0].id],
      );
    }

    await client.query('commit');
    forgetActiveSemester();
    return {
      semester: toSemester(updated.rows[0]),
      archived: previous.rows[0] ? toSemester(previous.rows[0]) : null,
      closedRequests,
    };
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}

/** Takes an upcoming semester out of students' view without deleting anything. */
export async function archiveSemester(semesterId: number): Promise<Semester> {
  const rows = await query<SemesterRow>(
    `update semesters set status = 'archived', archived_at = now()
      where id = $1 and status in ('published', 'draft') returning ${SEMESTER_COLUMNS}`,
    [semesterId],
  );
  if (!rows[0]) {
    throw new SemesterError(
      'Only a draft or upcoming semester can be archived. Make another semester current to retire this one.',
      409,
    );
  }
  forgetActiveSemester();
  return toSemester(rows[0]);
}

/**
 * Copies live offerings back into the draft after something changed them
 * directly, and marks the draft rows as hand-corrected so neither a re-import
 * nor a publish undoes the change.
 */
export async function syncDraftFromLive(client: PoolClient, offeringIds: string[], actor: string): Promise<void> {
  if (offeringIds.length === 0) return;
  await client.query(
    `update semester_courses sc
        set meetings = live.meetings,
            schedule = jsonb_build_object('assignments', '[]'::jsonb, 'custom', live.meetings),
            issues = (select coalesce(jsonb_agg(i || '{"resolved": true}'::jsonb), '[]'::jsonb)
                        from jsonb_array_elements(sc.issues) i where i->>'origin' <> 'schedule'),
            review_status = 'ok',
            manual = true, manual_source_hash = sc.source_hash, manual_at = now(), manual_by = $2,
            removed = false, dirty = false
       from (
         select o.semester_id, o.program, o.branch, o.course_code,
                coalesce((${LIVE_MEETINGS_JSON} where cm.offering_id = o.id), '[]'::jsonb) as meetings
           from course_offerings o
          where o.id = any($1::text[]) and o.semester_id is not null
       ) live
      where sc.semester_id = live.semester_id and sc.program = live.program
        and sc.branch = live.branch and sc.course_code = live.course_code`,
    [offeringIds, actor],
  );
}

// ---------------------------------------------------------------- public reads

export interface PublicSemester {
  id: number;
  code: string;
  name: string;
  status: SemesterStatus;
  version: number;
  publishedAt: string | null;
  startsOn: string | null;
  endsOn: string | null;
}

export function toPublicSemester(semester: Semester): PublicSemester {
  return {
    id: semester.id, code: semester.code, name: semester.name, status: semester.status,
    version: semester.publishedVersion, publishedAt: semester.publishedAt,
    startsOn: semester.startsOn, endsOn: semester.endsOn,
  };
}

/** The current semester and any published ahead of it. Drafts are never listed. */
export async function listPublicSemesters(): Promise<PublicSemester[]> {
  const rows = await query<SemesterRow>(
    `select ${SEMESTER_COLUMNS} from semesters
      where status in ('active', 'published')
      order by (status = 'active') desc, coalesce(starts_on, created_at::date) desc`,
  );
  return rows.map((row) => toPublicSemester(toSemester(row)));
}

/** Ensures a semester row exists for the bundled timetable; used by the seed. */
export async function ensureSemesterForSeed(
  client: { query: PoolClient['query'] },
  name: string,
  slots: unknown,
  config: SemesterConfig,
): Promise<number> {
  const code = semesterCode(name);
  const existing = await client.query<{ id: number }>('select id from semesters where code = $1', [code]);
  if (existing.rows[0]) return existing.rows[0].id;

  const active = await client.query('select 1 from semesters where status = $1', ['active']);
  const created = await client.query<{ id: number }>(
    `insert into semesters
       (code, name, status, slot_definitions, slots_confirmed, config, published_version, published_at, activated_at)
     values ($1, $2, $3, $4::jsonb, true, $5::jsonb, 1, now(), case when $3 = 'active' then now() end)
     returning id`,
    [code, name, active.rows.length > 0 ? 'published' : 'active', JSON.stringify(slots), JSON.stringify(config)],
  );
  return created.rows[0].id;
}
