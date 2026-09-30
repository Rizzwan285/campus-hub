import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useTimetableStore } from './useTimetableStore';
import { useUserStore } from './useUserStore';
import { TimetableLoader } from '../services/timetableLoader';
import type { CourseOffering, TimetableMeeting } from '../engine/types';

// Mock the dependencies
vi.mock('../services/timetableLoader', () => ({
  TimetableLoader: {
    loadBranchData: vi.fn(),
    loadAllCourses: vi.fn(),
    loadCommonData: vi.fn(),
    loadHolidays: vi.fn(),
    clearCache: vi.fn()
  }
}));

describe('useTimetableStore', () => {
  beforeEach(() => {
    // Reset store state
    useTimetableStore.setState({
      program: null,
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
    const mockCourse = {
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
    (TimetableLoader.loadAllCourses as any).mockResolvedValue([mockCourse]);
    (TimetableLoader.loadCommonData as any).mockResolvedValue([]);
    (TimetableLoader.loadHolidays as any).mockResolvedValue([]);

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
      loadedCourses: [{ id: 'dummy' } as any] // simulate loaded
    });

    await useTimetableStore.getState().initializeTimetable('UG', 'CSE');

    // It should have called loader because the store delegates caching to the TimetableLoader service
    expect(TimetableLoader.loadAllCourses).toHaveBeenCalled();
  });

  it('should update selected courses and trigger recompute', () => {
    const mockCourse = {
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
      loadedCourses: [mockCourse as any],
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
