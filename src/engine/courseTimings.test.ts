import { describe, it, expect } from 'vitest';
import {
  UNVERIFIED_BASE,
  diffMeetings,
  meetingProblem,
  meetingsFingerprint,
  overrideStatus,
  sameMeetings,
  type CourseOverride,
} from './courseTimings';
import type { TimetableMeeting } from './types';

const meeting = (overrides: Partial<TimetableMeeting> = {}): TimetableMeeting => ({
  type: 'lecture',
  day: 'Tuesday',
  startTime: '14:00',
  endTime: '15:15',
  room: 'B03-028',
  instructors: ['prof@iitpkd.ac.in'],
  recurrence: { type: 'weekly' },
  ...overrides,
});

const tuesday = meeting();
const thursday = meeting({ day: 'Thursday', startTime: '15:30', endTime: '16:45' });
const official = [tuesday, thursday];

const overrideOf = (meetings: TimetableMeeting[], base = official): CourseOverride => ({
  courseCode: 'BS6001',
  meetings,
  baseFingerprint: meetingsFingerprint(base),
  savedAt: '2026-09-29T10:00:00.000Z',
});

describe('meetingsFingerprint', () => {
  it('ignores the order meetings are listed in', () => {
    expect(meetingsFingerprint([thursday, tuesday])).toBe(meetingsFingerprint([tuesday, thursday]));
  });

  it('changes when a class moves', () => {
    const moved = [tuesday, { ...thursday, day: 'Friday' as const }];
    expect(meetingsFingerprint(moved)).not.toBe(meetingsFingerprint(official));
  });

  it('ignores instructors, which students never see', () => {
    const reassigned = [{ ...tuesday, instructors: [] }, thursday];
    expect(meetingsFingerprint(reassigned)).toBe(meetingsFingerprint(official));
  });
});

describe('sameMeetings', () => {
  it('treats a repeated class as distinct from a single one', () => {
    expect(sameMeetings([tuesday, tuesday], [tuesday, thursday])).toBe(false);
    expect(sameMeetings([tuesday, thursday], [thursday, tuesday])).toBe(true);
  });
});

describe('overrideStatus', () => {
  const moved = [tuesday, meeting({ day: 'Friday', startTime: '15:00', endTime: '16:15' })];

  it('applies a correction while the official timings are the ones it was made against', () => {
    expect(overrideStatus(overrideOf(moved), official, true)).toBe('active');
  });

  it('gives way once the official timings change underneath it', () => {
    // The developer approved someone's suggestion: Thursday's lecture is gone.
    const approved = [tuesday, meeting({ day: 'Wednesday', startTime: '10:00', endTime: '10:50' })];
    expect(overrideStatus(overrideOf(moved), approved, true)).toBe('superseded');
  });

  it('is redundant when the official timings now match it, e.g. after its own approval', () => {
    expect(overrideStatus(overrideOf(moved), moved, true)).toBe('redundant');
  });

  it('never gives way to fallback data, which can predate an approved change', () => {
    const bundled = [tuesday];
    expect(overrideStatus(overrideOf(moved), bundled, false)).toBe('active');
    expect(overrideStatus(overrideOf(moved), moved, false)).toBe('active');
  });

  it('is not overtaken when it was saved without the official timings in view', () => {
    // Saved over bundled data, which the real timings need not match.
    const unverified = { ...overrideOf(moved), baseFingerprint: UNVERIFIED_BASE };
    const real = [tuesday, meeting({ day: 'Wednesday', startTime: '10:00', endTime: '10:50' })];

    expect(overrideStatus(unverified, real, true)).toBe('active');
    expect(overrideStatus(unverified, moved, true)).toBe('redundant');
  });
});

describe('diffMeetings', () => {
  it('shows a moved class as one removal and one addition', () => {
    const friday = meeting({ day: 'Friday', startTime: '15:00', endTime: '16:15' });
    const changes = diffMeetings(official, [tuesday, friday]);

    expect(changes).toEqual([
      { kind: 'unchanged', meeting: tuesday },
      { kind: 'removed', meeting: thursday },
      { kind: 'added', meeting: friday },
    ]);
  });

  it('shows an extra copy of an existing class as an addition', () => {
    const changes = diffMeetings([tuesday], [tuesday, tuesday]);
    expect(changes.map((change) => change.kind)).toEqual(['unchanged', 'added']);
  });

  it('lists a new Saturday class after the weekdays', () => {
    const saturday = meeting({ day: 'Saturday', startTime: '09:00', endTime: '09:50' });
    const changes = diffMeetings(official, [...official, saturday]);
    expect(changes.at(-1)).toEqual({ kind: 'added', meeting: saturday });
  });
});

describe('meetingProblem', () => {
  it('accepts a well-formed class', () => {
    expect(meetingProblem(tuesday)).toBeNull();
  });

  it('rejects a class that ends before it starts', () => {
    expect(meetingProblem(meeting({ startTime: '15:00', endTime: '14:00' }))).toBe('Ends before it starts.');
  });

  it('rejects a missing time', () => {
    expect(meetingProblem(meeting({ endTime: '' }))).toBe('Enter a start and an end time.');
  });
});
