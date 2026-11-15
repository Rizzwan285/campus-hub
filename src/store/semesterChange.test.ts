import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TimetableMeta } from '../services/timetableLoader';
import type { CourseOffering, TimetableMeeting } from '../engine/types';

const loader = vi.hoisted(() => ({ meta: null as unknown }));

vi.mock('../services/api', () => ({ isApiConfigured: () => true }));
vi.mock('../services/timetableLoader', () => ({
  TimetableLoader: {
    loadAllCourses: vi.fn(),
    loadCommonData: vi.fn(),
    loadHolidays: vi.fn(),
    refreshAllCourses: vi.fn(),
    refreshHolidays: vi.fn(),
    clearCache: vi.fn(),
    getMeta: () => loader.meta,
  },
}));

import { TimetableLoader } from '../services/timetableLoader';
import { useTimetableStore } from './useTimetableStore';
import { useUserStore } from './useUserStore';
import { deltaBetween, meetingsFingerprint } from '../engine/courseTimings';

const meeting = (day: TimetableMeeting['day'], startTime: string, endTime: string, extra: Partial<TimetableMeeting> = {}): TimetableMeeting =>
  ({ type: 'lecture', day, startTime, endTime, room: 'A01', instructors: [], recurrence: { type: 'weekly' }, ...extra });
const course = (code: string, meetings: TimetableMeeting[], extra: Partial<CourseOffering> = {}): CourseOffering =>
  ({ id: code, offeringId: `x/${code}`, courseCode: code, courseName: code, credits: '3', category: 'core', meetings, ...extra });
const meta = (code: string, overrides: Partial<TimetableMeta> = {}): TimetableMeta => ({
  source: 'api', semester: { id: 1, code, name: code }, slots: null, config: null, savedAt: null, outdated: false, ...overrides,
});

const official = [meeting('Monday', '09:00', '09:50'), meeting('Friday', '10:00', '10:50')];

async function start(courses: CourseOffering[], withMeta: TimetableMeta, common: CourseOffering[] = []) {
  loader.meta = withMeta;
  vi.mocked(TimetableLoader.loadAllCourses).mockResolvedValue(courses);
  vi.mocked(TimetableLoader.loadCommonData).mockResolvedValue(common);
  vi.mocked(TimetableLoader.loadHolidays).mockResolvedValue([]);
  await useTimetableStore.getState().initializeTimetable('UG', 'CSE');
}

beforeEach(() => {
  useUserStore.setState({ profile: { name: 'T', mess: 'Nila', program: 'UG', branch: 'CSE', yearOfStudy: '2' } });
  useTimetableStore.setState({
    selectedCourseIds: [], selectionContext: null, courseOverrides: {}, courseOverridesUnsynced: false,
    semesterCode: null, loadedCourses: [], previewDate: new Date(2026, 10, 18).toISOString(),
  });
});

describe('a new current semester', () => {
  it('keeps an existing student\'s selection the first time the app learns the semester\'s name', async () => {
    useTimetableStore.setState({ selectedCourseIds: ['CS101'] });
    await start([course('CS101', official)], meta('aug-dec-2026'));
    expect(useTimetableStore.getState()).toMatchObject({ semesterCode: 'aug-dec-2026', selectedCourseIds: ['CS101'] });
  });

  it('sets last semester\'s selection and personal timings aside, even for a reused course code', async () => {
    await start([course('CS101', official)], meta('aug-dec-2026'));
    useTimetableStore.getState().updateSelectedCourses(['CS101']);
    useTimetableStore.getState().saveCourseOverride('CS101', [meeting('Tuesday', '16:00', '16:50')]);
    expect(Object.keys(useTimetableStore.getState().courseOverrides)).toEqual(['CS101']);

    // The developer activates Jan-May 2027, which also has a CS101.
    loader.meta = meta('jan-may-2027');
    const next = [course('CS101', [meeting('Wednesday', '11:00', '11:50')])];
    vi.mocked(TimetableLoader.refreshAllCourses).mockResolvedValue(next);
    vi.mocked(TimetableLoader.refreshHolidays).mockResolvedValue([]);
    vi.mocked(TimetableLoader.loadAllCourses).mockResolvedValue(next);
    await useTimetableStore.getState().refreshCourses();

    const state = useTimetableStore.getState();
    expect(state.semesterCode).toBe('jan-may-2027');
    expect(state.selectedCourseIds).toEqual([]);
    expect(state.courseOverrides).toEqual({});
    expect(state.resolvedEvents).toEqual([]);
  });

  it('does not treat a saved or built-in copy as an announcement of a new semester', async () => {
    await start([course('CS101', official)], meta('aug-dec-2026'));
    useTimetableStore.getState().updateSelectedCourses(['CS101']);
    await start([course('CS101', official)], meta('some-other-semester', { source: 'cache', savedAt: '2026-11-01T00:00:00Z' }));
    const state = useTimetableStore.getState();
    expect(state.semesterCode).toBe('aug-dec-2026');
    expect(state.selectedCourseIds).toEqual(['CS101']);
    // A saved copy can predate an approval, so it must not judge personal timings.
    expect(state.coursesAuthoritative).toBe(false);
    expect(state.timetableSource).toBe('cache');
  });

  it('shows no classes at all from a semester known to be over', async () => {
    useTimetableStore.setState({ selectedCourseIds: ['CS101'] });
    await start([course('CS101', official)], meta('aug-dec-2026', { source: 'bundled', outdated: true }));
    const state = useTimetableStore.getState();
    expect(state.timetableOutdated).toBe(true);
    expect(state.resolvedEvents).toEqual([]);
  });
});

describe('semester rules come from data', () => {
  const firstYear = () => useUserStore.setState({ profile: { name: 'T', mess: 'Nila', program: 'UG', branch: 'CSE', yearOfStudy: '1', batchNo: 'B3' } });
  const cores = [course('PH1', official), course('CH1', official), course('MA1', official)];

  it('picks first-year cores by the semester\'s own batch groups', async () => {
    firstYear();
    await start(cores, meta('jan-may-2027', {
      config: { firstYear: { excludedCodes: ['MA1'], cohorts: [{ batchMin: 1, batchMax: 12, excludedCodes: ['CH1'] }] } },
    }), cores);
    expect(useTimetableStore.getState().selectedCourseIds).toEqual(['PH1']);
  });

  it('shows a first year only their batch\'s sessions, from the structured batches field', async () => {
    firstYear();
    const lab = course('LAB1', [
      meeting('Monday', '14:00', '16:45', { room: 'Lab 1', batches: 'B1-B4' }),
      meeting('Tuesday', '14:00', '16:45', { room: 'Lab 2', batches: 'B5-B8' }),
    ]);
    await start([lab], meta('jan-may-2027', { config: {} }), [lab]);
    const events = useTimetableStore.getState().resolvedEvents;
    expect(events.map((event) => event.room)).toEqual(['Lab 1']);
  });
});

describe('accepting an optional change', () => {
  it('previews the change on top of the student\'s own timings without saving anything', async () => {
    await start([course('CS101', official)], meta('aug-dec-2026'));
    useTimetableStore.getState().updateSelectedCourses(['CS101']);
    const delta = deltaBetween(official, [official[0], meeting('Thursday', '14:00', '15:00')]);

    const outcome = useTimetableStore.getState().previewProposal('CS101', delta);
    expect(outcome.status).toBe('applied');
    if (outcome.status !== 'applied') return;
    expect(outcome.meetings.map((m) => m.day)).toEqual(['Monday', 'Thursday']);
    expect(outcome.baseFingerprint).toBe(meetingsFingerprint(official));
    expect(useTimetableStore.getState().courseOverrides).toEqual({}); // nothing saved yet

    useTimetableStore.getState().saveCourseOverride('CS101', outcome.meetings);
    expect(useTimetableStore.getState().previewProposal('CS101', delta).status).toBe('already');
  });

  it('reports an outdated proposal instead of applying it to moved timings', async () => {
    const delta = deltaBetween(official, [official[0], meeting('Thursday', '14:00', '15:00')]);
    // The official Friday class has since moved to Wednesday.
    await start([course('CS101', [official[0], meeting('Wednesday', '15:00', '15:50')])], meta('aug-dec-2026'));
    expect(useTimetableStore.getState().previewProposal('CS101', delta).status).toBe('outdated');
    expect(useTimetableStore.getState().previewProposal('NOPE', delta).status).toBe('outdated');
  });
});
