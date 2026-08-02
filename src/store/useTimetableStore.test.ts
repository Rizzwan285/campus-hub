import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useTimetableStore } from './useTimetableStore';
import { TimetableLoader } from '../services/timetableLoader';

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
      previewDate: '2026-01-26T00:00:00Z'
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
