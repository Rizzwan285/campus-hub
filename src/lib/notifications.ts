import type { TimetableNotification } from '@/services/notifications';

/**
 * The rules for when a timetable update may interrupt a student.
 *
 * An update interrupts at most once, and only if the student already had the
 * course when the change was approved. Everything else - a course picked up
 * later, an update already seen or answered, a course since dropped - waits
 * quietly in the inbox.
 */

/** An optional change the student can still accept. Declining can be reversed; accepting is done. */
export function canAccept(notification: TimetableNotification): boolean {
  return (
    notification.kind === 'optional_change' &&
    notification.proposalState === 'open' &&
    notification.response !== 'accepted' &&
    notification.courseSelected
  );
}

/** Still waiting for a first answer. */
export function awaitsAnswer(notification: TimetableNotification): boolean {
  return canAccept(notification) && notification.response === null;
}

/** Should be shown as an interrupting alert the next time the app is open. */
export function needsAlert(notification: TimetableNotification): boolean {
  if (!notification.alert || notification.alertSeen || !notification.courseSelected) return false;
  if (notification.kind === 'optional_change') return awaitsAnswer(notification);
  return notification.kind === 'official_change';
}

export function alertsToShow(notifications: TimetableNotification[]): TimetableNotification[] {
  return notifications.filter(needsAlert);
}

/** The number on the bell: updates not looked at yet, for courses the student still has. */
export function unreadCount(notifications: TimetableNotification[]): number {
  return notifications.filter(
    (notification) =>
      !notification.read && (notification.courseSelected || notification.kind === 'request_decision'),
  ).length;
}

export type InboxFilter = 'all' | 'to-answer' | 'official' | 'mine';

export function filterInbox(notifications: TimetableNotification[], filter: InboxFilter): TimetableNotification[] {
  switch (filter) {
    case 'to-answer':
      return notifications.filter(awaitsAnswer);
    case 'official':
      return notifications.filter((notification) => notification.kind === 'official_change');
    case 'mine':
      return notifications.filter((notification) => notification.kind === 'request_decision');
    default:
      return notifications;
  }
}

const KIND_TEXT = { addition: 'Class added', deletion: 'Class cancelled', modification: 'Class timing change' } as const;

export function changeTitle(notification: TimetableNotification): string {
  const what = notification.changeKind ? KIND_TEXT[notification.changeKind] : 'Timetable change';
  return `${notification.courseName || notification.courseCode} — ${what}`;
}

/** Who says so. Never implies the professor confirmed anything through the app. */
export function provenance(notification: TimetableNotification): string {
  if (notification.kind === 'request_decision') {
    if (notification.requestStatus === 'rejected') return 'Your request was not approved.';
    return notification.approvalMode === 'compulsory'
      ? 'Your request was approved and now applies to everyone taking the course.'
      : 'Your request was approved as an optional update: each student chooses whether to use it.';
  }
  const who = notification.reportedBy ?? 'A student';
  const edited = notification.corrected ? ', with corrections,' : '';
  return `Reported by ${who} and approved${edited} by the developer.`;
}
