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
 * they don't (instructors). The API imports this module, so both sides
 * compare meetings the same way.
 */
export function meetingKey(meeting: TimetableMeeting): string {
  const parts = [
    meeting.type,
    meeting.day,
    meeting.startTime,
    meeting.endTime,
    (meeting.room ?? '').trim(),
    meeting.recurrence?.type ?? 'weekly',
  ];
  // Appended only when present, so the fingerprint of every meeting that
  // predates these fields is unchanged - students' saved corrections are
  // compared against fingerprints taken before they existed.
  if (meeting.date) parts.push(`on:${meeting.date}`);
  if (meeting.batches?.trim()) parts.push(`for:${meeting.batches.trim()}`);
  return parts.join('|');
}

/**
 * The same class regardless of where it is held: its type, day, time, how
 * often it meets and who it is for - everything in meetingKey() but the room.
 */
function sessionKey(meeting: TimetableMeeting): string {
  const parts = [
    meeting.type, meeting.day, meeting.startTime, meeting.endTime, meeting.recurrence?.type ?? 'weekly',
  ];
  if (meeting.date) parts.push(`on:${meeting.date}`);
  if (meeting.batches?.trim()) parts.push(`for:${meeting.batches.trim()}`);
  return parts.join('|');
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
    a.endTime.localeCompare(b.endTime) ||
    (a.date ?? '').localeCompare(b.date ?? '')
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
const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

/** The weekday a YYYY-MM-DD calendar date falls on, or null if it is not a real date. */
export function weekdayOfDate(date: string): MeetingDay | null {
  if (!DATE_KEY.test(date)) return null;
  const parsed = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) return null;
  return WEEK_DAYS[(parsed.getUTCDay() + 6) % 7];
}

/** Why a meeting cannot be saved, or null if it can. The server checks the same. */
export function meetingProblem(meeting: TimetableMeeting): string | null {
  if (!CLOCK_TIME.test(meeting.startTime) || !CLOCK_TIME.test(meeting.endTime)) {
    return 'Enter a start and an end time.';
  }
  if (meeting.endTime <= meeting.startTime) return 'Ends before it starts.';
  if (meeting.room.length > 120) return 'Room name is too long.';
  if (meeting.recurrence?.type === 'once') {
    if (!meeting.date || weekdayOfDate(meeting.date) === null) return 'Pick the date of this one-time class.';
  }
  return null;
}

// ---------------------------------------------------------------- changes as deltas

/**
 * A change to a course expressed as the classes it removes and the classes it
 * adds, rather than as a whole new list. That is what lets one change be
 * applied to a timetable that has moved on since - a student's own timings, or
 * another branch's offering - without wiping out what the change never touched.
 */
export interface MeetingDelta {
  remove: TimetableMeeting[];
  add: TimetableMeeting[];
}

export type ChangeKind = 'addition' | 'deletion' | 'modification';

export function deltaBetween(before: TimetableMeeting[], after: TimetableMeeting[]): MeetingDelta {
  const changes = diffMeetings(before, after);
  return {
    remove: changes.filter((change) => change.kind === 'removed').map((change) => change.meeting),
    add: changes.filter((change) => change.kind === 'added').map((change) => change.meeting),
  };
}

export function changeKind(delta: MeetingDelta): ChangeKind {
  if (delta.remove.length === 0) return 'addition';
  if (delta.add.length === 0) return 'deletion';
  return 'modification';
}

export type DeltaOutcome =
  /** Applied: `meetings` is the result. */
  | { status: 'applied'; meetings: TimetableMeeting[] }
  /** Every part of the change is already there; nothing to do. */
  | { status: 'already'; meetings: TimetableMeeting[] }
  /** A class the change moves or removes is no longer in the list. */
  | { status: 'outdated'; missing: TimetableMeeting[] };

/**
 * Applies a change to a list of meetings, touching only the classes it names.
 *
 * Refuses when a class the change removes is not in the list any more: the
 * change was written against timings that have since moved, and removing
 * "whatever is closest" would be a guess. Applying the same change twice is
 * safe - the second time reports `already`.
 *
 * A class to remove is found by its exact identity first. Failing that, by
 * its day and time alone, if exactly one class sits there: the same course is
 * listed by several branches in different rooms, and a student may have
 * renamed a room in their own copy, but "Tuesday 8:00 is cancelled" still
 * means that class.
 */
export function applyDelta(meetings: TimetableMeeting[], delta: MeetingDelta): DeltaOutcome {
  const remaining = [...meetings];
  const missing: TimetableMeeting[] = [];

  for (const gone of delta.remove) {
    let index = remaining.findIndex((meeting) => meetingKey(meeting) === meetingKey(gone));
    if (index === -1) {
      const sameSession = remaining
        .map((meeting, position) => (sessionKey(meeting) === sessionKey(gone) ? position : -1))
        .filter((position) => position !== -1);
      if (sameSession.length === 1) index = sameSession[0];
    }
    if (index === -1) missing.push(gone);
    else remaining.splice(index, 1);
  }

  const present = new Set(meetings.map(meetingKey));
  const toAdd = delta.add.filter((meeting) => !present.has(meetingKey(meeting)));

  if (missing.length > 0) {
    // Fully applied already: the removals are gone and the additions are in.
    if (missing.length === delta.remove.length && toAdd.length === 0) {
      return { status: 'already', meetings };
    }
    return { status: 'outdated', missing };
  }
  if (delta.remove.length === 0 && toAdd.length === 0) return { status: 'already', meetings };

  return { status: 'applied', meetings: [...remaining, ...toAdd].sort(compareMeetings) };
}
