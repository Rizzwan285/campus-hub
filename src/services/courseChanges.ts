/**
 * Suggestions to change a course's official timings, and their review.
 *
 * Students file them; nothing reaches anyone else's timetable until the
 * developer approves one in /admin.
 */
import { apiFetch } from './api';
import type { TimetableMeeting } from '@/engine/types';

export type SuggestionStatus = 'pending' | 'approved' | 'rejected' | 'withdrawn' | 'superseded';

export interface CourseChangeRequest {
  id: number;
  courseCode: string;
  courseName: string | null;
  requesterRoll: string;
  note: string | null;
  /** The official meetings when the suggestion was made. */
  baseMeetings: TimetableMeeting[];
  proposedMeetings: TimetableMeeting[];
  /** What approval wrote, which the reviewer may have corrected. */
  appliedMeetings: TimetableMeeting[] | null;
  status: SuggestionStatus;
  createdAt: string;
  decidedAt: string | null;
  decidedByRoll: string | null;
  decisionNote: string | null;
}

export interface ReviewItem extends CourseChangeRequest {
  requesterName: string | null;
  enrolledCount: number;
  personalEditCount: number;
  /** The official meetings now, i.e. what approving would replace. */
  currentMeetings: TimetableMeeting[] | null;
}

export function listMySuggestions() {
  return apiFetch<CourseChangeRequest[]>('/api/course-changes/mine');
}

export function submitSuggestion(courseCode: string, meetings: TimetableMeeting[], note: string) {
  return apiFetch<CourseChangeRequest>('/api/course-changes', {
    method: 'POST',
    body: { courseCode, meetings, note: note.trim() || undefined },
  });
}

export function withdrawSuggestion(id: number) {
  return apiFetch<CourseChangeRequest>(`/api/course-changes/${id}`, { method: 'DELETE' });
}

export function listForReview(status: 'pending' | 'decided') {
  return apiFetch<ReviewItem[]>(`/api/admin/course-changes?status=${status}`);
}

export function countPendingSuggestions() {
  return apiFetch<{ pending: number }>('/api/admin/course-changes/count');
}

export function approveSuggestion(id: number, note: string, meetings?: TimetableMeeting[]) {
  return apiFetch<{ request: CourseChangeRequest; offeringsUpdated: number; alsoClosed: number }>(
    `/api/admin/course-changes/${id}/approve`,
    { method: 'POST', body: { note: note.trim() || undefined, meetings } },
  );
}

export function rejectSuggestion(id: number, note: string) {
  return apiFetch<{ request: CourseChangeRequest }>(`/api/admin/course-changes/${id}/reject`, {
    method: 'POST',
    body: { note: note.trim() || undefined },
  });
}
