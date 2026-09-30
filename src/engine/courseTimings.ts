import type { MeetingDay, TimetableMeeting } from './types';

/**
 * A student's own timings for one course. They replace the official meetings
 * in that student's timetable only; changing a course for everyone goes
 * through a suggestion and the developer's approval instead.
 */
export interface CourseOverride {
  courseCode: string;
  /** The complete list of meetings, in the same shape as the official list. */
  meetings: TimetableMeeting[];
  /** meetingsFingerprint() of the official meetings when this was saved, or UNVERIFIED_BASE. */
  baseFingerprint: string;
  /** ISO timestamp. */
  savedAt: string;
}

/**
 * Stands in for `baseFingerprint` when a correction was saved without the
 * official timetable in view — the API was asleep and bundled data stood in.
 * Fingerprinting that data would retire the correction the moment the real
 * timings arrived, wherever the two differ (every course changed since the
 * app was built). The store swaps this for a real fingerprint as soon as it
 * loads the official timings.
 */
export const UNVERIFIED_BASE = 'unverified';

export type OverrideStatus =
  /** Applied: the student sees their own timings. */
  | 'active'
  /** The official timings changed after this was saved, so they win. */
  | 'superseded'
  /** Identical to the official timings, so there is nothing personal left in it. */
  | 'redundant';

export const WEEK_DAYS: MeetingDay[] = [
  'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday',
];

/**
 * A meeting's identity for comparison: everything a student sees and nothing
 * they don't (instructors). Must stay in step with meetingKey() in
 * server/src/repositories/courseChanges.repository.ts.
 */
function meetingKey(meeting: TimetableMeeting): string {
  return [
    meeting.type,
    meeting.day,
    meeting.startTime,
    meeting.endTime,
    (meeting.room ?? '').trim(),
    meeting.recurrence?.type ?? 'weekly',
  ].join('|');
}

/** cyrb53: a small, well-distributed 53-bit string hash. */
function hash(text: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

/** Identifies a list of meetings by content. Order does not matter. */
export function meetingsFingerprint(meetings: TimetableMeeting[]): string {
  return hash(meetings.map(meetingKey).sort().join('\n'));
}

export function sameMeetings(a: TimetableMeeting[], b: TimetableMeeting[]): boolean {
  if (a.length !== b.length) return false;
  const left = a.map(meetingKey).sort();
  const right = b.map(meetingKey).sort();
  return left.every((key, index) => key === right[index]);
}

/**
 * Whether a student's own timings for a course still apply.
 *
 * A correction is made against a particular version of the official timings.
 * Once those change — the developer approved a suggestion, or edited the
 * course — the correction is out of date and the new official timings win.
 * That is what lets an approved change reach everyone who has the course,
 * including students who had corrected it themselves.
 *
 * `authoritative` is false while the app shows its bundled fallback because
 * the API did not answer (Render cold-starts for up to a minute). That data
 * can predate an approved change, so it must never outvote, or discard, a
 * student's correction.
 */
export function overrideStatus(
  override: CourseOverride,
  officialMeetings: TimetableMeeting[],
  authoritative: boolean,
): OverrideStatus {
  if (!authoritative) return 'active';
  if (sameMeetings(override.meetings, officialMeetings)) return 'redundant';
  // Not made against any particular official version, so none can overtake it.
  if (override.baseFingerprint === UNVERIFIED_BASE) return 'active';
  if (meetingsFingerprint(officialMeetings) !== override.baseFingerprint) return 'superseded';
  return 'active';
}

/** Weekly order: day, then start time. */
export function compareMeetings(a: TimetableMeeting, b: TimetableMeeting): number {
  return (
    WEEK_DAYS.indexOf(a.day) - WEEK_DAYS.indexOf(b.day) ||
    a.startTime.localeCompare(b.startTime) ||
    a.endTime.localeCompare(b.endTime)
  );
}

export interface MeetingChange {
  kind: 'removed' | 'added' | 'unchanged';
  meeting: TimetableMeeting;
}

// Within one time slot: what stays, then the old version, then the new one —
// so a room change reads old → new.
const KIND_ORDER: Record<MeetingChange['kind'], number> = { unchanged: 0, removed: 1, added: 2 };

/**
 * What turning `before` into `after` does, class by class, in weekly order.
 * A class that moved shows as one removal and one addition.
 */
export function diffMeetings(before: TimetableMeeting[], after: TimetableMeeting[]): MeetingChange[] {
  const unmatched = new Map<string, number>();
  for (const meeting of after) {
    const key = meetingKey(meeting);
    unmatched.set(key, (unmatched.get(key) ?? 0) + 1);
  }

  const changes: MeetingChange[] = [];
  for (const meeting of before) {
    const key = meetingKey(meeting);
    const left = unmatched.get(key) ?? 0;
    if (left > 0) {
      unmatched.set(key, left - 1);
      changes.push({ kind: 'unchanged', meeting });
    } else {
      changes.push({ kind: 'removed', meeting });
    }
  }

  for (const meeting of after) {
    const key = meetingKey(meeting);
    const left = unmatched.get(key) ?? 0;
    if (left > 0) {
      unmatched.set(key, left - 1);
      changes.push({ kind: 'added', meeting });
    }
  }

  return changes.sort(
    (a, b) => compareMeetings(a.meeting, b.meeting) || KIND_ORDER[a.kind] - KIND_ORDER[b.kind],
  );
}

const CLOCK_TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Why a meeting cannot be saved, or null if it can. The server checks the same. */
export function meetingProblem(meeting: TimetableMeeting): string | null {
  if (!CLOCK_TIME.test(meeting.startTime) || !CLOCK_TIME.test(meeting.endTime)) {
    return 'Enter a start and an end time.';
  }
  if (meeting.endTime <= meeting.startTime) return 'Ends before it starts.';
  if (meeting.room.length > 120) return 'Room name is too long.';
  return null;
}
