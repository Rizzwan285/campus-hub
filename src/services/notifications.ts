/**
 * A student's inbox of timetable updates: optional changes to accept or
 * decline, official changes to know about, and what became of their own
 * requests.
 */
import { apiFetch } from './api';
import type { ChangeKind, CourseOverride, MeetingDelta } from '@/engine/courseTimings';
import type { TimetableMeeting } from '@/engine/types';

export type NotificationKind = 'optional_change' | 'official_change' | 'request_decision';
export type ProposalState = 'open' | 'official' | 'outdated' | 'closed';

export interface TimetableNotification {
  id: number;
  kind: NotificationKind;
  requestId: number;
  courseCode: string;
  courseName: string | null;
  semesterId: number | null;
  semesterName: string | null;
  changeKind: ChangeKind | null;
  approvalMode: 'optional' | 'compulsory' | null;
  requestStatus: 'pending' | 'approved' | 'rejected' | 'withdrawn' | 'superseded';
  delta: MeetingDelta | null;
  /** A name, or "A student". Null when the reader filed the request. */
  reportedBy: string | null;
  mine: boolean;
  explanation: string | null;
  decisionNote: string | null;
  /** The developer adjusted the request before approving it. */
  corrected: boolean;
  proposalState: ProposalState | null;
  proposalStateNote: string | null;
  decidedAt: string | null;
  alert: boolean;
  alertSeen: boolean;
  read: boolean;
  response: 'accepted' | 'rejected' | null;
  respondedAt: string | null;
  courseSelected: boolean;
  createdAt: string;
}

export function listNotifications() {
  return apiFetch<TimetableNotification[]>('/api/notifications');
}

export function markNotifications(ids: number[] | 'all', what: { read?: boolean; alertSeen?: boolean }) {
  return apiFetch<{ updated: number }>('/api/notifications/mark', { method: 'POST', body: { ids, ...what } });
}

export function respondToNotification(
  id: number,
  response: 'accepted' | 'rejected',
  override?: { meetings: TimetableMeeting[]; baseFingerprint: string },
) {
  return apiFetch<{ notification: TimetableNotification; courseOverrides: CourseOverride[] | null }>(
    `/api/notifications/${id}/respond`,
    { method: 'POST', body: { response, override } },
  );
}
