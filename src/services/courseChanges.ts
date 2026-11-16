/**
 * Suggestions to change a course's official timings, and their review.
 *
 * Students file them; nothing reaches anyone else's timetable until the
 * developer approves one in /admin.
 */
import { apiFetch } from './api';
import type { TimetableMeeting } from '@/engine/types';
import type { ChangeKind, MeetingDelta } from '@/engine/courseTimings';

/**
 * `optional`   each student who has the course accepts or declines it.
 * `compulsory` it becomes the official timetable for everyone.
 */
export type ApprovalMode = 'optional' | 'compulsory';

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
  semesterId?: number | null;
  approvalMode?: ApprovalMode | null;
  changeKind?: ChangeKind | null;
  /** The change against the official timings at approval. */
  delta?: MeetingDelta | null;
  corrected?: boolean;
  proposalState?: 'open' | 'official' | 'outdated' | 'closed' | null;
  proposalStateNote?: string | null;
}

export interface ReviewItem extends CourseChangeRequest {
  requesterName: string | null;
  semesterName?: string | null;
  enrolledCount: number;
  personalEditCount: number;
  /** The official meetings now, i.e. what approving would replace. */
  currentMeetings: TimetableMeeting[] | null;
  /** How students answered an optional change. */
  responses?: { accepted: number; rejected: number; notified: number };
  /** The email to the developer about this request: sent, pending, failed. */
  emailStatus?: string | null;
  emailError?: string | null;
}

export interface EmailStatus {
  provider: string;
  configured: boolean;
  missing: string[];
  /** ADMIN_NOTIFY_EMAIL on the API. */
  recipient?: string | null;
  /** Set when the provider, not the API, decides where email goes (Apps Script). */
  recipientNote?: string | null;
  appUrl?: string | null;
  outbox: Array<{
    id: number; requestId: number | null; subject: string; status: string; attempts: number;
    lastError: string | null; createdAt: string; sentAt: string | null;
  }>;
}

export function getEmailStatus() {
  return apiFetch<EmailStatus>('/api/admin/emails');
}

// Apps Script can take up to 30 seconds per email, so these wait longer than
// the usual 12 seconds before giving up on the answer.
export function retryEmails(id?: number) {
  return apiFetch<{ queued: number; sent: number; failed: number }>('/api/admin/emails/retry', {
    method: 'POST', body: id ? { id } : {}, timeoutMs: 90_000,
  });
}

export interface TestEmailResult {
  status: 'sent' | 'pending' | 'failed' | 'not_configured';
  id: number | null;
  error: string | null;
  message: string;
}

/** Sends a test email through the outbox and the configured provider. */
export function sendTestEmail() {
  return apiFetch<TestEmailResult>('/api/admin/emails/test', { method: 'POST', body: {}, timeoutMs: 60_000 });
}

export function closeOptionalChange(id: number, note: string) {
  return apiFetch<{ request: CourseChangeRequest }>(`/api/admin/course-changes/${id}/close`, {
    method: 'POST', body: { note: note.trim() || undefined },
  });
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

export function approveSuggestion(
  id: number,
  note: string,
  options: {
    mode: ApprovalMode;
    /** Corrected meetings to approve instead of the ones proposed. */
    meetings?: TimetableMeeting[];
    /** Fingerprint of the official timings the reviewer was shown. */
    expectedFingerprint?: string;
  },
) {
  return apiFetch<{ request: CourseChangeRequest; offeringsUpdated: number; alsoClosed: number; notified: number }>(
    `/api/admin/course-changes/${id}/approve`,
    { method: 'POST', body: { note: note.trim() || undefined, ...options } },
  );
}

export function rejectSuggestion(id: number, note: string) {
  return apiFetch<{ request: CourseChangeRequest }>(`/api/admin/course-changes/${id}/reject`, {
    method: 'POST',
    body: { note: note.trim() || undefined },
  });
}
