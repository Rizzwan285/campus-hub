import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SEMESTER_CONFIG, batchAllowed, expandSchedule, firstYearExclusions, inferSchedule, parseBatches,
  venueFor, type CourseSchedule, type SlotDefinitions,
} from './courseSchedule';
import {
  applyDelta, changeKind, deltaBetween, meetingProblem, meetingsFingerprint, weekdayOfDate,
} from './courseTimings';
import { TimetableEngine } from './timetableEngine';
import type { TimetableMeeting } from './types';

const SLOTS: SlotDefinitions = {
  B: {
    type: 'lecture',
    timings: [
      { day: 'Monday', startTime: '09:00', endTime: '09:50' },
      { day: 'Tuesday', startTime: '08:00', endTime: '08:50' },
      { day: 'Friday', startTime: '10:00', endTime: '10:50' },
    ],
  },
  I: { type: 'lecture', timings: [{ day: 'Monday', startTime: '14:00', endTime: '15:15' }, { day: 'Friday', startTime: '15:30', endTime: '16:45' }] },
  J: { type: 'lecture', timings: [{ day: 'Monday', startTime: '15:30', endTime: '16:45' }, { day: 'Friday', startTime: '14:00', endTime: '15:15' }] },
  PA1: { type: 'lab', timings: [{ day: 'Monday', startTime: '14:00', endTime: '16:45' }] },
};

const meeting = (day: TimetableMeeting['day'], startTime: string, endTime: string, room = 'A01-212', extra: Partial<TimetableMeeting> = {}): TimetableMeeting =>
  ({ type: 'lecture', day, startTime, endTime, room, instructors: [], recurrence: { type: 'weekly' }, ...extra });

const line = (m: TimetableMeeting) => `${m.slot ?? '-'} ${m.day.slice(0, 3)} ${m.startTime} ${m.room}${m.batches ? ` [${m.batches}]` : ''}`;
const expand = (schedule: Partial<CourseSchedule>) =>
  expandSchedule({ assignments: [], custom: [], ...schedule }, SLOTS);

describe('expandSchedule — the visual editor and publishing share this', () => {
  it('gives each slot its own venue (Database Systems: B in A01-212, PA1 in the lab)', () => {
    const { meetings, problems } = expand({
      assignments: [
        { slot: 'B', days: null, room: 'A01-212' },
        { slot: 'PA1', days: null, room: 'Nila CS Lab' },
      ],
    });
    expect(meetings.map(line)).toEqual([
      'B Mon 09:00 A01-212', 'PA1 Mon 14:00 Nila CS Lab', 'B Tue 08:00 A01-212', 'B Fri 10:00 A01-212',
    ]);
    expect(problems).toEqual([]);
  });

  it('keeps only the selected days of a slot', () => {
    expect(expand({ assignments: [{ slot: 'B', days: ['Monday'], room: 'A01-212' }] }).meetings.map(line))
      .toEqual(['B Mon 09:00 A01-212']);
    // "I + J (Monday)": all of I, only Monday's J.
    expect(expand({ assignments: [{ slot: 'I', days: null, room: '' }, { slot: 'J', days: ['Monday'], room: '' }] }).meetings)
      .toHaveLength(3);
  });

  it('lets two days of one slot use different rooms and times', () => {
    const { meetings } = expand({
      assignments: [{
        slot: 'B', days: ['Monday', 'Friday'], room: 'A01-212',
        overrides: { Friday: { room: 'A01-118', startTime: '10:30', endTime: '11:20' } },
      }],
    });
    expect(meetings.map(line)).toEqual(['B Mon 09:00 A01-212', 'B Fri 10:30 A01-118']);
  });

  it('expands a batch lab rotation into one session per batch', () => {
    const { meetings, problems } = expand({
      assignments: [
        { slot: 'PA1', days: null, room: 'Lab 1', batches: 'B1-B4' },
        { slot: 'PA1', days: null, room: 'Lab 2', batches: 'B5-B8' },
      ],
    });
    expect(meetings.map(line)).toEqual(['PA1 Mon 14:00 Lab 1 [B1-B4]', 'PA1 Mon 14:00 Lab 2 [B5-B8]']);
    expect(problems).toEqual([]); // different batches at the same time is not a clash
  });

  it('includes classes outside the slot system, weekly or on a date', () => {
    const { meetings, problems } = expand({
      assignments: [{ slot: 'B', days: ['Monday'], room: 'A01' }],
      custom: [
        meeting('Saturday', '10:00', '11:00', 'Seminar Hall'),
        meeting('Monday', '18:00', '19:00', 'A01', { recurrence: { type: 'once' }, date: '2026-11-21' }),
      ],
    });
    expect(meetings.map((m) => `${m.day} ${m.startTime}${m.date ? ` on ${m.date}` : ''}`)).toEqual([
      'Monday 09:00', 'Saturday 10:00', 'Saturday 18:00 on 2026-11-21', // 21 Nov 2026 is a Saturday
    ]);
    expect(problems).toEqual([]);
  });

  it('never invents a class: unknown slots and impossible days are blocking problems', () => {
    const unknown = expand({ assignments: [{ slot: 'ZZ', days: null, room: '' }] });
    expect(unknown.meetings).toEqual([]);
    expect(unknown.problems).toMatchObject([{ code: 'unknown_slot', severity: 'blocking' }]);

    const wrongDay = expand({ assignments: [{ slot: 'I', days: ['Tuesday'], room: '' }] });
    expect(wrongDay.meetings).toEqual([]);
    expect(wrongDay.problems.map((p) => p.code)).toEqual(['day_not_in_slot']);

    expect(expand({ assignments: [{ slot: 'B', days: [], room: '' }] }).problems.map((p) => p.code)).toEqual(['no_days']);
  });

  it('reports duplicate and overlapping classes for the same students', () => {
    const twice = expand({ assignments: [{ slot: 'B', days: ['Monday'], room: 'X' }, { slot: 'B', days: ['Monday'], room: 'X' }] });
    expect(twice.problems.map((p) => p.code)).toContain('duplicate_meeting');
    // I (Mon 14:00-15:15) inside PA1 (Mon 14:00-16:45), for everyone.
    const overlap = expand({ assignments: [{ slot: 'I', days: ['Monday'], room: 'X' }, { slot: 'PA1', days: null, room: 'Y' }] });
    expect(overlap.problems).toMatchObject([{ code: 'overlap', severity: 'review' }]);
  });
});

describe('inferSchedule — courses that predate structured slots', () => {
  it('turns meetings that match a slot back into assignments, with odd rooms as per-day overrides', () => {
    const schedule = inferSchedule([
      meeting('Monday', '09:00', '09:50', 'A01-212'),
      meeting('Friday', '10:00', '10:50', 'A01-118'),
      meeting('Tuesday', '08:00', '08:50', 'A01-212'),
      meeting('Saturday', '10:00', '11:00', 'Seminar Hall'),
    ], SLOTS);
    expect(schedule.assignments).toEqual([
      { slot: 'B', days: null, room: 'A01-212', overrides: { Friday: { room: 'A01-118' } } },
    ]);
    expect(schedule.custom.map((m) => m.day)).toEqual(['Saturday']);
    // Round trip: the same classes come back out.
    expect(expandSchedule(schedule, SLOTS).meetings.map((m) => `${m.day} ${m.startTime} ${m.room}`).sort())
      .toEqual(['Friday 10:00 A01-118', 'Monday 09:00 A01-212', 'Saturday 10:00 Seminar Hall', 'Tuesday 08:00 A01-212']);
  });
});

describe('batches and semester rules', () => {
  it('reads batch ranges', () => {
    expect(parseBatches('B1-B6, B13-B18')).toEqual([{ min: 1, max: 6 }, { min: 13, max: 18 }]);
    expect(batchAllowed('B1-B6', 6)).toBe(true);
    expect(batchAllowed('B1-B6', 7)).toBe(false);
    expect(batchAllowed(undefined, 7)).toBe(true); // unmarked classes are for everyone
  });

  it('reproduces the rules that used to be hardcoded for Aug–Dec 2026', () => {
    expect(firstYearExclusions(DEFAULT_SEMESTER_CONFIG, 3)).toEqual(['BT2010', 'CY1140', 'EE1110']);
    expect(firstYearExclusions(DEFAULT_SEMESTER_CONFIG, 20)).toEqual(['BT2010', 'PH1130', 'ME1150']);
    expect(venueFor(DEFAULT_SEMESTER_CONFIG, 'PH1030', 'lecture', 7)).toBe('C06-106');
    expect(venueFor(DEFAULT_SEMESTER_CONFIG, 'ME1130', 'lab', 22)).toBe('A01-112 (Drawing Hall)');
    expect(venueFor(DEFAULT_SEMESTER_CONFIG, 'ME1130', 'lecture', 22)).toBe('N305');
    expect(venueFor(DEFAULT_SEMESTER_CONFIG, 'CS101', 'lecture', 1)).toBeNull();
  });

  it('follows a different semester\'s rules without a code change', () => {
    const config = { firstYear: { excludedCodes: [], cohorts: [{ batchMin: 1, batchMax: 24, excludedCodes: ['XX1'] }] } };
    expect(firstYearExclusions(config, 5)).toEqual(['XX1']);
    expect(firstYearExclusions({}, 5)).toEqual([]);
  });
});

describe('changes as deltas — what accepting and approving actually apply', () => {
  const official = [meeting('Monday', '09:00', '09:50'), meeting('Tuesday', '08:00', '08:50'), meeting('Friday', '10:00', '10:50')];
  const moveFriday = deltaBetween(official, [official[0], official[1], meeting('Thursday', '14:00', '15:00', 'A01-118')]);

  it('names only the classes that change, and what kind of change it is', () => {
    expect(moveFriday.remove.map((m) => m.day)).toEqual(['Friday']);
    expect(moveFriday.add.map((m) => m.day)).toEqual(['Thursday']);
    expect(changeKind(moveFriday)).toBe('modification');
    expect(changeKind(deltaBetween(official, [...official, meeting('Saturday', '10:00', '11:00')]))).toBe('addition');
    expect(changeKind(deltaBetween(official, official.slice(1)))).toBe('deletion');
  });

  it('leaves a student\'s unrelated personal edits alone', () => {
    // The student had already moved Monday themselves and added a Saturday class.
    const own = [meeting('Monday', '16:00', '16:50', 'Hostel'), official[1], official[2], meeting('Saturday', '10:00', '11:00')];
    const outcome = applyDelta(own, moveFriday);
    expect(outcome.status).toBe('applied');
    if (outcome.status !== 'applied') return;
    expect(outcome.meetings.map((m) => `${m.day} ${m.startTime} ${m.room}`)).toEqual([
      'Monday 16:00 Hostel', 'Tuesday 08:00 A01-212', 'Thursday 14:00 A01-118', 'Saturday 10:00 A01-212',
    ]);
  });

  it('is idempotent: applying it again changes nothing', () => {
    const once = applyDelta(official, moveFriday);
    if (once.status !== 'applied') throw new Error('expected applied');
    expect(applyDelta(once.meetings, moveFriday).status).toBe('already');
  });

  it('refuses when the class it moves is no longer there', () => {
    // The student (or the official timetable) already moved Friday elsewhere.
    const changed = [official[0], official[1], meeting('Wednesday', '15:00', '15:50')];
    const outcome = applyDelta(changed, moveFriday);
    expect(outcome.status).toBe('outdated');
    if (outcome.status === 'outdated') expect(outcome.missing.map((m) => m.day)).toEqual(['Friday']);
  });

  it('finds the same class in another room, but never a different time', () => {
    const otherBranch = official.map((m) => ({ ...m, room: 'N305' }));
    const cancelTuesday = deltaBetween(official, [official[0], official[2]]);
    const outcome = applyDelta(otherBranch, cancelTuesday);
    expect(outcome.status).toBe('applied');
    if (outcome.status === 'applied') expect(outcome.meetings.map((m) => `${m.day} ${m.room}`)).toEqual(['Monday N305', 'Friday N305']);
  });

  it('keeps old fingerprints valid: the new optional fields change nothing when absent', () => {
    const plain = meetingsFingerprint(official);
    expect(meetingsFingerprint(official.map((m) => ({ ...m, slot: 'B' })))).toBe(plain); // a label, not identity
    expect(meetingsFingerprint(official.map((m) => ({ ...m, batches: 'B1-B6' })))).not.toBe(plain);
    expect(meetingsFingerprint([...official].reverse())).toBe(plain);
  });

  it('validates one-time classes', () => {
    expect(weekdayOfDate('2026-11-21')).toBe('Saturday');
    expect(weekdayOfDate('2026-02-30')).toBeNull();
    expect(meetingProblem(meeting('Monday', '10:00', '11:00', 'A', { recurrence: { type: 'once' } }))).toMatch(/date/);
    expect(meetingProblem(meeting('Saturday', '10:00', '11:00', 'A', { recurrence: { type: 'once' }, date: '2026-11-21' }))).toBeNull();
  });
});

describe('engine — one-time classes', () => {
  const course = (meetings: TimetableMeeting[]) => [{ id: 'CS101', courseCode: 'CS101', courseName: 'X', credits: '3', category: 'core', meetings }];
  const extra = meeting('Saturday', '10:00', '11:00', 'A01', { recurrence: { type: 'once' }, date: '2026-11-21' });

  it('shows a dated class only in the week of its date', () => {
    const inWeek = TimetableEngine.resolveWeek(course([extra]), [], { targetWeek: new Date(2026, 10, 18) });
    expect(inWeek.events).toHaveLength(1);
    expect(inWeek.events[0].startTime.getDate()).toBe(21);
    expect(TimetableEngine.resolveWeek(course([extra]), [], { targetWeek: new Date(2026, 10, 25) }).events).toHaveLength(0);
    expect(TimetableEngine.resolveWeek(course([extra]), [], { targetWeek: new Date(2026, 10, 11) }).events).toHaveLength(0);
  });

  it('keeps a dated class that was scheduled on a holiday, unlike a weekly one', () => {
    const holidays = [{ date: '2026-11-21', name: 'Holiday' }];
    const weekly = meeting('Saturday', '12:00', '13:00');
    const result = TimetableEngine.resolveWeek(course([extra, weekly]), holidays, { targetWeek: new Date(2026, 10, 18) });
    expect(result.events.map((event) => event.startTime.getHours())).toEqual([10]);
  });
});
