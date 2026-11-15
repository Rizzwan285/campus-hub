/**
 * /admin → Semesters: creating a semester, importing the institute's files,
 * reviewing and correcting courses, and publishing.
 */
import { apiFetch, apiUpload } from './api';
import type { CourseSchedule, SemesterConfig, SlotDefinitions } from '@/engine/courseSchedule';
import type { TimetableMeeting } from '@/engine/types';

export type SemesterStatus = 'draft' | 'published' | 'active' | 'archived';
export type ReviewStatus = 'ok' | 'needs_review' | 'invalid';

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
}

export interface SemesterSummary extends Semester {
  courseCount: number;
  needsReview: number;
  invalid: number;
  unpublishedChanges: number;
  liveCourseCount: number;
}

export interface SemesterFile {
  id: number;
  name: string;
  kind: 'workbook' | 'slots';
  program: string | null;
  branch: string | null;
  size: number;
  uploadedAt: string;
}

export interface CourseIssue {
  code: string;
  severity: 'blocking' | 'review' | 'info';
  message: string;
  origin: 'parser' | 'schedule' | 'import';
  resolved?: boolean;
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
  slots: { status: string; adopted: boolean; differs: string[]; issues: Array<{ slot: string | null; message: string }> };
  warnings: Array<{ file: string | null; sheet: string | null; row: number | null; message: string }>;
}

export interface CourseListItem {
  id: number;
  program: string;
  branch: string;
  courseCode: string;
  courseName: string;
  credits: string | null;
  category: string | null;
  rawSlot: string | null;
  origin: 'import' | 'manual' | 'legacy';
  meetings: TimetableMeeting[];
  /** Open findings only. */
  issues: CourseIssue[];
  reviewStatus: ReviewStatus;
  manual: boolean;
  removed: boolean;
  dirty: boolean;
  importChange: string | null;
}

export interface SourceRow {
  file: string;
  sheet: string;
  row: number;
  cells: Record<string, string>;
}

export interface CatalogueCourse extends Omit<CourseListItem, 'issues'> {
  instructors: string[];
  sourceRows: SourceRow[];
  parsed: { schedule: CourseSchedule; courseName: string } | null;
  schedule: CourseSchedule;
  issues: CourseIssue[];
  previousMeetings: TimetableMeeting[] | null;
}

export interface PublishCheck {
  ready: boolean;
  blocking: Array<{ id: number; key: string; issues: string[] }>;
  slotsConfirmed: boolean;
  courseCount: number;
  needsReview: number;
  unpublishedChanges: number;
}

export interface SemesterDetail {
  semester: Semester;
  files: SemesterFile[];
  latestImport: { id: number; summary: ImportSummary; createdAt: string; parserVersion: string | null } | null;
  publishCheck: PublishCheck;
  snapshots: Array<{ version: number; kind: string; courseCount: number; note: string | null; createdAt: string; createdBy: string | null }>;
}

const base = '/api/admin/semesters';

export const listSemesters = () => apiFetch<SemesterSummary[]>(base);
export const getSemester = (id: number) => apiFetch<SemesterDetail>(`${base}/${id}`);
export const createSemester = (body: { name: string; startsOn?: string | null; endsOn?: string | null }) =>
  apiFetch<Semester>(base, { method: 'POST', body });
export const updateSemester = (
  id: number,
  body: Partial<{ name: string; slotDefinitions: SlotDefinitions; slotsConfirmed: boolean; config: SemesterConfig }>,
) => apiFetch<Semester>(`${base}/${id}`, { method: 'PATCH', body });

export const uploadFile = (id: number, file: File) =>
  apiUpload<SemesterFile>(`${base}/${id}/files/${encodeURIComponent(file.name)}`, file);
export const setFileTarget = (id: number, fileId: number, program: string | null, branch: string | null) =>
  apiFetch<SemesterFile>(`${base}/${id}/files/${fileId}`, { method: 'PATCH', body: { program, branch } });
export const deleteFile = (id: number, fileId: number) =>
  apiFetch<void>(`${base}/${id}/files/${fileId}`, { method: 'DELETE' });

export const runImport = (id: number) =>
  apiFetch<ImportSummary>(`${base}/${id}/import`, { method: 'POST', timeoutMs: 120_000 });
export const importParsed = (id: number, parsed: unknown) =>
  apiFetch<ImportSummary>(`${base}/${id}/import-parsed`, { method: 'POST', body: parsed, timeoutMs: 120_000 });

export const listCourses = (id: number) => apiFetch<CourseListItem[]>(`${base}/${id}/courses`);
export const getCourse = (id: number, courseId: number) => apiFetch<CatalogueCourse>(`${base}/${id}/courses/${courseId}`);
export const saveCourse = (
  id: number,
  courseId: number,
  body: Partial<{
    courseCode: string; courseName: string; credits: string | null; category: string | null;
    instructors: string[]; schedule: CourseSchedule; resolveIssues: boolean; removed: boolean;
  }>,
) => apiFetch<CatalogueCourse>(`${base}/${id}/courses/${courseId}`, { method: 'PUT', body });
export const resetCourse = (id: number, courseId: number) =>
  apiFetch<CatalogueCourse>(`${base}/${id}/courses/${courseId}/reset`, { method: 'POST' });
export const createCourse = (
  id: number,
  body: { program: string; branch: string; courseCode: string; courseName: string },
) => apiFetch<CatalogueCourse>(`${base}/${id}/courses`, { method: 'POST', body });

export const publishSemester = (id: number, note: string) =>
  apiFetch<{ version: number; courses: number }>(`${base}/${id}/publish`, { method: 'POST', body: { note: note.trim() || undefined } });
export const rollbackSemester = (id: number, version: number) =>
  apiFetch<{ version: number; courses: number }>(`${base}/${id}/rollback`, { method: 'POST', body: { version } });
export const activateSemester = (id: number) =>
  apiFetch<{ semester: Semester; archived: Semester | null; closedRequests: number }>(`${base}/${id}/activate`, { method: 'POST' });
export const archiveSemester = (id: number) => apiFetch<Semester>(`${base}/${id}/archive`, { method: 'POST' });
