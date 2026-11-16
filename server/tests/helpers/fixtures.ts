import type { Semester } from '../../src/repositories/semesters.repository';
import type { MeetingDay, TimetableMeeting } from '../../../src/engine/types';
import type { Harness } from './harness';

export const SLOTS = {
  A: {
    type: 'lecture',
    timings: [
      { day: 'Monday', startTime: '08:00', endTime: '08:50' },
      { day: 'Wednesday', startTime: '11:00', endTime: '11:50' },
      { day: 'Friday', startTime: '09:00', endTime: '09:50' },
    ],
  },
  B: {
    type: 'lecture',
    timings: [
      { day: 'Monday', startTime: '09:00', endTime: '09:50' },
      { day: 'Tuesday', startTime: '08:00', endTime: '08:50' },
      { day: 'Friday', startTime: '10:00', endTime: '10:50' },
    ],
  },
  J: {
    type: 'lecture',
    timings: [
      { day: 'Monday', startTime: '15:30', endTime: '16:45' },
      { day: 'Friday', startTime: '14:00', endTime: '15:15' },
    ],
  },
  PA1: { type: 'lab', timings: [{ day: 'Monday', startTime: '14:00', endTime: '16:45' }] },
} as const;

interface CourseInput {
  code: string;
  program?: 'UG' | 'PG';
  branch?: string;
  name?: string;
  rawSlot?: string;
  assignments?: Array<Record<string, unknown>>;
  issues?: Array<{ code: string; severity: 'blocking' | 'review' | 'info'; message: string }>;
  /** Changes the source row, as if the institute edited the workbook. */
  remark?: string;
}

export function parsedCourse(input: CourseInput) {
  const branch = input.branch ?? 'CSE';
  return {
    program: input.program ?? 'UG',
    branch,
    courseCode: input.code,
    courseName: input.name ?? `Course ${input.code}`,
    credits: '3-0-0-3',
    category: 'core',
    instructors: ['prof@example.test'],
    rawSlot: input.rawSlot ?? 'B',
    remarks: input.remark ? [input.remark] : [],
    sourceRows: [{
      file: `03_UG_${branch}_Jan-May-2027.xlsx`,
      sheet: 'Core',
      row: 6,
      cells: { Code: input.code, Slot: input.rawSlot ?? 'B', ...(input.remark ? { Remarks: input.remark } : {}) },
    }],
    schedule: {
      assignments: input.assignments ?? [{ slot: 'B', days: null, room: 'A01-212' }],
      custom: [],
    },
    issues: input.issues ?? [],
  };
}

export function parsedImport(courses: ReturnType<typeof parsedCourse>[], slots: unknown = SLOTS) {
  return {
    parserVersion: 'test',
    semester: null,
    slots: { status: 'parsed', definitions: slots, issues: [], file: '00_Slot_system.docx' },
    files: [{ name: '03_UG_CSE.xlsx', kind: 'workbook' }],
    courses,
    warnings: [],
  };
}

/** Creates, imports, confirms and publishes a semester; optionally makes it current. */
export async function publishSemester(
  h: Harness,
  adminToken: string,
  name: string,
  courses: ReturnType<typeof parsedCourse>[],
  options: { activate?: boolean } = {},
): Promise<{ id: number; code: string }> {
  const created = await h.api<Semester>('POST', '/api/admin/semesters', { token: adminToken, body: { name } });
  if (created.status !== 201) throw new Error(`create failed: ${JSON.stringify(created.body)}`);
  const id = created.body.id;
  const imported = await h.api('POST', `/api/admin/semesters/${id}/import-parsed`, {
    token: adminToken, body: parsedImport(courses),
  });
  if (imported.status !== 200) throw new Error(`import failed: ${JSON.stringify(imported.body)}`);
  await h.api('PATCH', `/api/admin/semesters/${id}`, { token: adminToken, body: { slotsConfirmed: true } });
  const published = await h.api('POST', `/api/admin/semesters/${id}/publish`, { token: adminToken, body: {} });
  if (published.status !== 200) throw new Error(`publish failed: ${JSON.stringify(published.body)}`);
  if (options.activate) {
    const activated = await h.api('POST', `/api/admin/semesters/${id}/activate`, { token: adminToken });
    if (activated.status !== 200) throw new Error(`activate failed: ${JSON.stringify(activated.body)}`);
  }
  return { id, code: created.body.code };
}

export const meeting = (
  day: MeetingDay, startTime: string, endTime: string, room = 'A01-212', extra: Partial<TimetableMeeting> = {},
): TimetableMeeting => ({ type: 'lecture', day, startTime, endTime, room, instructors: [], recurrence: { type: 'weekly' }, ...extra });
