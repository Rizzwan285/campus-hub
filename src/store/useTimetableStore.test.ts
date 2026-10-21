import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useTimetableStore } from './useTimetableStore';
import { useUserStore } from './useUserStore';
import { TimetableLoader } from '../services/timetableLoader';
import { meetingsFingerprint } from '../engine/courseTimings';
import type { CourseOffering, TimetableMeeting } from '../engine/types';

// Mock the dependencies
vi.mock('../services/timetableLoader', () => ({
  TimetableLoader: {
    loadBranchData: vi.fn(),
    loadAllCourses: vi.fn(),
    loadCommonData: vi.fn(),
    loadHolidays: vi.fn(),
    refreshAllCourses: vi.fn(),
    refreshHolidays: vi.fn(),
    clearCache: vi.fn()
  }
}));

describe('useTimetableStore', () => {
  beforeEach(() => {
    // Reset store state
    useTimetableStore.setState({
      program: null,
      selectionContext: null,
      branch: null,
      selectedCourseIds: [],
      loadedCourses: [],
      loadedHolidays: [],
      resolvedEvents: [],
      collisions: [],
      holidaysEncountered: [],
      isLoading: false,
      error: null,
      previewDate: '2026-01-26T00:00:00Z',
      courseOverrides: {},
      courseOverridesUnsynced: false,
      coursesAuthoritative: false
    });

    vi.clearAllMocks();
  });

  it('should initialize timetable and recompute', async () => {
    const mockCourse: CourseOffering = {
      id: 'UG_CSE_CS101',
      courseCode: 'CS101',
      courseName: 'Intro to CS',
      credits: '3',
      category: 'core',
      meetings: [
        {
          type: 'lecture',
          day: 'Monday',
          startTime: '10:00',
          endTime: '11:00',
          room: 'A1',
          instructors: [],
          recurrence: { type: 'weekly' }
        }
      ]
    };

    // Setup mocks
    vi.mocked(TimetableLoader.loadAllCourses).mockResolvedValue([mockCourse]);
    vi.mocked(TimetableLoader.loadCommonData).mockResolvedValue([]);
    vi.mocked(TimetableLoader.loadHolidays).mockResolvedValue([]);

    // We start by pre-selecting the course ID so that recompute creates events
    useTimetableStore.setState({ selectedCourseIds: ['CS101'] });

    await useTimetableStore.getState().initializeTimetable('UG', 'CSE');

    const state = useTimetableStore.getState();
    expect(state.isLoading).toBe(false);
    expect(state.loadedCourses).toHaveLength(1);
    expect(state.resolvedEvents).toHaveLength(1); // Because it was selected
    expect(state.resolvedEvents[0].courseCode).toBe('CS101');
    expect(TimetableLoader.loadAllCourses).toHaveBeenCalled();
  });

  it('should not duplicate fetch if already initialized with same program/branch', async () => {
    useTimetableStore.setState({
      program: 'UG',
      branch: 'CSE',
      loadedCourses: [{ id: 'dummy', courseCode: 'DUMMY', courseName: 'Dummy', credits: '0', category: 'core', meetings: [] }] // simulate loaded
    });

    await useTimetableStore.getState().initializeTimetable('UG', 'CSE');

    // It should have called loader because the store delegates caching to the TimetableLoader service
    expect(TimetableLoader.loadAllCourses).toHaveBeenCalled();
  });

  it('should update selected courses and trigger recompute', () => {
    const mockCourse: CourseOffering = {
      id: 'UG_CSE_CS101',
      courseCode: 'CS101',
      courseName: 'Intro to CS',
      credits: '3',
      category: 'core',
      meetings: [
        {
          type: 'lecture',
          day: 'Monday',
          startTime: '10:00',
          endTime: '11:00',
          room: 'A1',
          instructors: [],
          recurrence: { type: 'weekly' }
        }
      ]
    };

    useTimetableStore.setState({
      loadedCourses: [mockCourse],
      loadedHolidays: [],
      previewDate: '2026-02-02T00:00:00Z' // not a holiday
    });

    const stateBefore = useTimetableStore.getState();
    expect(stateBefore.resolvedEvents).toHaveLength(0);

    stateBefore.updateSelectedCourses(['CS101']);

    const stateAfter = useTimetableStore.getState();
    expect(stateAfter.selectedCourseIds).toEqual(['CS101']);
    expect(stateAfter.resolvedEvents).toHaveLength(1);
  });
});

describe('own class timings', () => {
  const lecture = (day: TimetableMeeting['day'], room = 'A1'): TimetableMeeting => ({
    type: 'lecture',
    day,
    startTime: '10:00',
    endTime: '11:00',
    room,
    instructors: [],
    recurrence: { type: 'weekly' }
  });

  const course = (meetings: TimetableMeeting[], courseCode = 'CS101'): CourseOffering => ({
    id: courseCode,
    courseCode,
    courseName: 'Intro to CS',
    credits: '3',
    category: 'core',
    meetings
  });

  const official = [lecture('Monday'), lecture('Wednesday')];
  // The professor moved Wednesday's lecture to Friday.
  const moved = [lecture('Monday'), lecture('Friday')];

  const days = () =>
    useTimetableStore.getState().resolvedEvents.map(event => event.startTime.getDay()).sort();

  /** Swaps in new official data, as a reload after an approved change would. */
  const officialBecomes = (meetings: TimetableMeeting[], authoritative = true) => {
    useTimetableStore.setState({ loadedCourses: [course(meetings)], coursesAuthoritative: authoritative });
    useTimetableStore.getState().updateSelectedCourses(['CS101']);
  };

  beforeEach(() => {
    useTimetableStore.setState({
      loadedCourses: [course(official)],
      loadedHolidays: [],
      selectedCourseIds: ['CS101'],
      courseOverrides: {},
      courseOverridesUnsynced: false,
      coursesAuthoritative: true,
      previewDate: '2026-02-02T00:00:00Z' // a week without holidays
    });
  });

  afterEach(() => {
    useUserStore.setState({ profile: null });
  });

  it("shows the student's own timings, marked as theirs", () => {
    useTimetableStore.getState().saveCourseOverride('CS101', moved);

    expect(days()).toEqual([1, 5]); // Monday, Friday
    expect(useTimetableStore.getState().resolvedEvents.every(event => event.isPersonal)).toBe(true);
  });

  it('does not store a correction that matches the official timings', () => {
    useTimetableStore.getState().saveCourseOverride('CS101', [...official].reverse());
    expect(useTimetableStore.getState().courseOverrides).toEqual({});
  });

  it('lets an approved change reach a student who had corrected the course', () => {
    useTimetableStore.getState().saveCourseOverride('CS101', moved);

    // Someone else's suggestion was approved: Wednesday moves to Thursday instead.
    officialBecomes([lecture('Monday'), lecture('Thursday')]);

    expect(days()).toEqual([1, 4]);
    expect(useTimetableStore.getState().resolvedEvents.some(event => event.isPersonal)).toBe(false);
    // Kept, not deleted, so the student can choose to re-apply it.
    expect(useTimetableStore.getState().courseOverrides.CS101).toBeDefined();

    useTimetableStore.getState().keepCourseOverride('CS101');
    expect(days()).toEqual([1, 5]);
  });

  it('drops a correction once the official timings match it', () => {
    useTimetableStore.getState().saveCourseOverride('CS101', moved);
    officialBecomes(moved);

    expect(useTimetableStore.getState().courseOverrides).toEqual({});
    expect(days()).toEqual([1, 5]);
  });

  it('keeps applying a correction while bundled fallback data stands in for the API', () => {
    useTimetableStore.getState().saveCourseOverride('CS101', moved);
    officialBecomes([lecture('Monday')], false);

    expect(days()).toEqual([1, 5]);
    expect(useTimetableStore.getState().courseOverrides.CS101).toBeDefined();
  });

  it('keeps a correction saved over fallback data once the real timings arrive', () => {
    // A cold start: bundled data on screen, and the real timings differ from it
    // because a suggestion for this course was approved after the build.
    const real = [lecture('Monday'), lecture('Thursday')];
    useTimetableStore.setState({ coursesAuthoritative: false });
    useTimetableStore.getState().saveCourseOverride('CS101', moved);
    useTimetableStore.getState().markCourseOverridesSynced();

    officialBecomes(real);

    expect(days()).toEqual([1, 5]);
    expect(useTimetableStore.getState().resolvedEvents.every(event => event.isPersonal)).toBe(true);
    // Its base is now the timings it was first seen against, and the account is told.
    expect(useTimetableStore.getState().courseOverrides.CS101.baseFingerprint).toBe(meetingsFingerprint(real));
    expect(useTimetableStore.getState().courseOverridesUnsynced).toBe(true);

    // From then on an official change overtakes it like any other correction.
    officialBecomes([lecture('Tuesday')]);
    expect(days()).toEqual([2]);
  });

  it('fetches the official timings again without reloading the timetable', async () => {
    const approved = [lecture('Monday'), lecture('Thursday')];
    vi.mocked(TimetableLoader.refreshAllCourses).mockResolvedValue([{ ...course(approved), offeringId: 'UG_CSE_CS101' }]);

    expect(await useTimetableStore.getState().refreshCourses()).toBe(true);
    expect(days()).toEqual([1, 4]);

    // A correction saved now is made against the approved timings, so it holds.
    useTimetableStore.getState().saveCourseOverride('CS101', moved);
    expect(useTimetableStore.getState().courseOverrides.CS101.baseFingerprint).toBe(meetingsFingerprint(approved));
  });

  it('leaves the timetable alone when the API does not answer a refresh', async () => {
    vi.mocked(TimetableLoader.refreshAllCourses).mockResolvedValue(null);
    useTimetableStore.getState().updateSelectedCourses(['CS101']);

    expect(await useTimetableStore.getState().refreshCourses()).toBe(false);
    expect(days()).toEqual([1, 3]);
    expect(useTimetableStore.getState().coursesAuthoritative).toBe(true);
  });

  it('marks local edits as unsynced until the account confirms them', () => {
    const store = useTimetableStore.getState();
    store.saveCourseOverride('CS101', moved);
    expect(useTimetableStore.getState().courseOverridesUnsynced).toBe(true);

    useTimetableStore.getState().markCourseOverridesSynced();
    expect(useTimetableStore.getState().courseOverridesUnsynced).toBe(false);

    useTimetableStore.getState().removeCourseOverride('CS101');
    expect(useTimetableStore.getState().courseOverridesUnsynced).toBe(true);

    // Adopting the account's copy is by definition in sync.
    useTimetableStore.getState().setCourseOverrides([]);
    expect(useTimetableStore.getState().courseOverridesUnsynced).toBe(false);
  });

  it('marks an automatically dropped correction as unsynced, so the account drops it too', () => {
    useTimetableStore.getState().saveCourseOverride('CS101', moved);
    useTimetableStore.getState().markCourseOverridesSynced();
    officialBecomes(moved);
    expect(useTimetableStore.getState().courseOverridesUnsynced).toBe(true);
  });

  it("keeps a first year's typed room instead of the hardcoded batch venue", () => {
    useUserStore.setState({
      profile: { name: 'A', mess: 'Kedaram', program: 'UG', branch: 'CSE', yearOfStudy: '1', batchNo: 'B3' }
    });
    const batchRoom = 'C06-105 (B1-B6) | C06-106 (B7-B12)';
    useTimetableStore.setState({ loadedCourses: [course([lecture('Monday', batchRoom)], 'PH1030')] });
    useTimetableStore.getState().updateSelectedCourses(['PH1030']);
    expect(useTimetableStore.getState().resolvedEvents[0].room).toBe('C06-105');

    useTimetableStore.getState().saveCourseOverride('PH1030', [lecture('Monday', 'C06-110')]);
    expect(useTimetableStore.getState().resolvedEvents[0].room).toBe('C06-110');

    // A time change that leaves the official room alone still gets the batch venue.
    useTimetableStore.getState().saveCourseOverride('PH1030', [{ ...lecture('Tuesday', batchRoom) }]);
    expect(useTimetableStore.getState().resolvedEvents[0].room).toBe('C06-105');
  });
});

describe('year and batch transitions', () => {
  const meeting = (room: string): TimetableMeeting => ({
    type: 'lab', day: 'Monday', startTime: '10:00', endTime: '11:00', room,
    instructors: [], recurrence: { type: 'weekly' },
  });
  const course = (courseCode: string, rooms: string[]): CourseOffering => ({
    id: courseCode, courseCode, courseName: courseCode, credits: '3',
    category: 'institute core', meetings: rooms.map(meeting),
  });
  const common = [
    course('ID1050A', ['Nila CS-Lab (B1-B12)', 'Nila CS-Lab (B13-B24)']),
    course('PH1130', ['Physics (B1-B12)']), course('ME1150', ['Workshop (B1-B12)']),
    course('CY1140', ['Chemistry (B13-B24)']), course('EE1110', ['Electronics (B13-B24)']),
  ];
  const profile = { name: 'Test', mess: 'Nila' as const, program: 'UG' as const, branch: 'CSE', yearOfStudy: '1', batchNo: 'B1' };

  beforeEach(() => {
    vi.clearAllMocks();
    useUserStore.setState({ profile });
    useTimetableStore.setState({
      selectionContext: null, selectedCourseIds: [], loadedCourses: [], loadedHolidays: [],
      resolvedEvents: [], collisions: [], courseOverrides: {}, previewDate: '2026-02-02T00:00:00Z',
    });
    vi.mocked(TimetableLoader.loadAllCourses).mockResolvedValue(common);
    vi.mocked(TimetableLoader.loadCommonData).mockResolvedValue(common);
    vi.mocked(TimetableLoader.loadHolidays).mockResolvedValue([]);
  });
  afterEach(() => useUserStore.setState({ profile: null }));

  it('loads only the selected cohort and batch sessions', async () => {
    await useTimetableStore.getState().initializeTimetable('UG', 'CSE');
    expect(useTimetableStore.getState().selectedCourseIds.sort()).toEqual(['ID1050A', 'ME1150', 'PH1130']);
    expect(useTimetableStore.getState().resolvedEvents).toHaveLength(3);
    useUserStore.setState({ profile: { ...profile, batchNo: 'B13' } });
    await useTimetableStore.getState().initializeTimetable('UG', 'CSE');
    expect(useTimetableStore.getState().selectedCourseIds.sort()).toEqual(['CY1140', 'EE1110', 'ID1050A']);
    expect(useTimetableStore.getState().resolvedEvents).toHaveLength(3);
  });

  it.each(['', 'B25', '1.5'])('does not show all batches for invalid batch %s', async batchNo => {
    useUserStore.setState({ profile: { ...profile, batchNo } });
    await useTimetableStore.getState().initializeTimetable('UG', 'CSE');
    expect(useTimetableStore.getState().selectedCourseIds).toEqual([]);
    useTimetableStore.getState().updateSelectedCourses(['ID1050A']);
    expect(useTimetableStore.getState().resolvedEvents).toEqual([]);
  });

  it('clears first-year courses on changing to fourth year and keeps them empty on reload', async () => {
    await useTimetableStore.getState().initializeTimetable('UG', 'CSE');
    useUserStore.setState({ profile: { ...profile, yearOfStudy: '4', batchNo: undefined } });
    await useTimetableStore.getState().initializeTimetable('UG', 'CSE');
    expect(useTimetableStore.getState().selectedCourseIds).toEqual([]);
    expect(useTimetableStore.getState().resolvedEvents).toEqual([]);
    await useTimetableStore.getState().initializeTimetable('UG', 'CSE');
    expect(useTimetableStore.getState().selectedCourseIds).toEqual([]);
  });

  it('preserves selections when only mess or name changes', async () => {
    useUserStore.setState({ profile: { ...profile, yearOfStudy: '4' } });
    await useTimetableStore.getState().initializeTimetable('UG', 'CSE');
    useTimetableStore.getState().updateSelectedCourses(['ID1050A']);
    useUserStore.setState({ profile: { ...profile, yearOfStudy: '4', name: 'Updated', mess: 'Kedaram' } });
    await useTimetableStore.getState().initializeTimetable('UG', 'CSE');
    expect(useTimetableStore.getState().selectedCourseIds).toEqual(['ID1050A']);
  });

  it('keeps an approved first-year room instead of replacing it with an old venue', async () => {
    await useTimetableStore.getState().initializeTimetable('UG', 'CSE');
    vi.mocked(TimetableLoader.refreshAllCourses).mockResolvedValue([
      { ...course('ID1050A', ['New Lab (B1-B12)']), offeringId: 'UG_CommonCourses_ID1050A', source: 'admin' },
    ]);
    vi.mocked(TimetableLoader.refreshHolidays).mockResolvedValue([]);
    await useTimetableStore.getState().refreshCourses();
    expect(useTimetableStore.getState().resolvedEvents[0].room).toBe('New Lab');
  });

  it('keeps an approved first-year room instead of using the legacy batch venue', () => {
    const approved = { ...course('ID1050A', ['New Lab (B1-B12)']), source: 'admin' as const };
    useTimetableStore.setState({ loadedCourses: [approved], loadedHolidays: [], selectedCourseIds: [] });
    useTimetableStore.getState().updateSelectedCourses(['ID1050A']);
    expect(useTimetableStore.getState().resolvedEvents[0].room).toBe('New Lab');
  });
});
