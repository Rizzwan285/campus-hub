import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { TimetableLoader } from '../services/timetableLoader';
import { isApiConfigured } from '../services/api';
import { TimetableEngine } from '../engine/timetableEngine';
import {
  meetingsFingerprint,
  overrideStatus,
  sameMeetings,
  type CourseOverride,
} from '../engine/courseTimings';
import { useUserStore } from './useUserStore';
import {
  CourseOffering,
  Holiday,
  CalendarEvent,
  Collision,
  TimetableMeeting
} from '../engine/types';

function getVenueForMeeting(courseCode: string, meetingType: string, batchNo: number): string | null {
  if (courseCode === 'PH1030' || courseCode === 'MA1011A') {
    if (batchNo <= 6) return 'C06-105';
    if (batchNo <= 12) return 'C06-106';
    if (batchNo <= 18) return 'C06-107';
    return 'C06-104';
  }
  if (courseCode === 'ES1010') {
    if (batchNo <= 11) return 'N203';
    if (batchNo <= 18) return 'N305';
    return 'C06-104';
  }
  if (courseCode === 'ME1130') {
    if (meetingType === 'lab') return 'A01-112 (Drawing Hall)';
    if (batchNo <= 5) return 'C06-105';
    if (batchNo <= 10) return 'C06-106';
    if (batchNo <= 15) return 'C06-107';
    if (batchNo <= 20) return 'C06-104';
    return 'N305';
  }
  if (courseCode === 'ID1050A') {
    return meetingType === 'lab' ? 'Nila CS-Lab' : 'A01-007';
  }
  if (courseCode === 'ME1150') return 'D-03 Workshop';
  if (courseCode === 'EE1110') return 'C06-105 + C06 Electronics Lab';
  if (courseCode === 'PH1130') return 'A01 Physics Lab';
  if (courseCode === 'CY1140') return 'A01 Chemistry Lab';
  if (courseCode === 'GN1003') return 'N-203/204 & Nila CS Lab';
  return null;
}

/**
 * Whether loaded courses are the live official timetable. They are, unless an
 * API is configured but did not answer and the bundled copy stood in — only
 * the API sends `offeringId`.
 */
function isAuthoritative(courses: CourseOffering[]): boolean {
  return !isApiConfigured() || courses.some((course) => course.offeringId !== undefined);
}

interface TimetableState {
  // Config & Persistent State
  program: string | null;
  branch: string | null;
  selectedCourseIds: string[];
  previewDate: string; // ISO string to be serializable
  /** The student's own timings, keyed by course code. */
  courseOverrides: Record<string, CourseOverride>;
  /**
   * Local changes to courseOverrides the account has not confirmed yet. While
   * set, sign-in pushes these up instead of adopting the account's copy, so an
   * edit saved during a Render cold start survives the next app open.
   */
  courseOverridesUnsynced: boolean;

  // Transient Loaded Data (Not persisted to localStorage to save space)
  loadedCourses: CourseOffering[];
  loadedHolidays: Holiday[];
  /** False while bundled fallback data stands in for an unreachable API. */
  coursesAuthoritative: boolean;
  
  // Resolved Output
  resolvedEvents: CalendarEvent[];
  collisions: Collision[];
  holidaysEncountered: Holiday[];
  
  // Status
  isLoading: boolean;
  error: string | null;

  // Actions
  initializeTimetable: (program: string, branch: string) => Promise<void>;
  reloadTimetable: () => Promise<void>;
  updateSelectedCourses: (ids: string[]) => void;
  updatePreviewDate: (date: Date) => void;
  updateProfile: (program: string, branch: string) => void;
  /** Uses these meetings for the course in this student's timetable only. */
  saveCourseOverride: (courseCode: string, meetings: TimetableMeeting[]) => void;
  /** Back to the official timings for the course. */
  removeCourseOverride: (courseCode: string) => void;
  /** Re-applies a superseded correction on top of the new official timings. */
  keepCourseOverride: (courseCode: string) => void;
  /** Replaces every correction at once, e.g. with the account's on sign-in. */
  setCourseOverrides: (overrides: CourseOverride[]) => void;
  /** The account now holds exactly what is stored locally. */
  markCourseOverridesSynced: () => void;
}

export const useTimetableStore = create<TimetableState>()(
  persist(
    (set, get) => {
      // Internal pure recomputation logic (avoids redundant hook dependencies)
      const _recompute = () => {
        const {
          loadedCourses, loadedHolidays, selectedCourseIds, previewDate,
          courseOverrides, coursesAuthoritative,
        } = get();

        if (!loadedCourses.length) return;

        const selectedSet = new Set(selectedCourseIds);
        // A student's own timings stand in for the official ones — until the
        // official timings change underneath them (see overrideStatus).
        const redundant: string[] = [];
        let activeCourses = loadedCourses
          .filter(c => selectedSet.has(c.courseCode))
          .map(course => {
            const override = courseOverrides[course.courseCode];
            if (!override) return course;

            const status = overrideStatus(override, course.meetings, coursesAuthoritative);
            if (status === 'redundant') redundant.push(course.courseCode);
            return status === 'active'
              ? { ...course, meetings: override.meetings, isPersonal: true }
              : course;
          });

        if (redundant.length > 0) {
          // Usually the student's own suggestion, now approved for everyone.
          const remaining = { ...courseOverrides };
          redundant.forEach(code => delete remaining[code]);
          set({ courseOverrides: remaining, courseOverridesUnsynced: true });
        }

        const profile = useUserStore.getState().profile;
        if (profile?.program === 'UG' && profile?.yearOfStudy === '1') {
          const batchNo = parseInt(profile.batchNo?.replace(/[^0-9]/g, '') || '0', 10);
          if (batchNo > 0) {
            const officialRooms = new Map(
              loadedCourses.map(c => [c.courseCode, new Set(c.meetings.map(m => m.room))]),
            );
            activeCourses = activeCourses.map(course => {
              const newMeetings = course.meetings
                .filter(m => {
                  const regex = /\bB(\d+)\s*-\s*B(\d+)\b/gi;
                  let match;
                  let hasRestriction = false;
                  let allowed = false;
                  
                  while ((match = regex.exec(m.room)) !== null) {
                    hasRestriction = true;
                    const start = parseInt(match[1], 10);
                    const end = parseInt(match[2], 10);
                    if (batchNo >= start && batchNo <= end) {
                      allowed = true;
                    }
                  }
                  
                  // If no batch restriction is mentioned, it's for everyone.
                  return !hasRestriction || allowed;
                })
                .map(m => {
                  let finalRoom = m.room;
                  
                  if (m.room.includes('|') || /\bB\d+/.test(m.room)) {
                    const parts = m.room.split('|').map(p => p.trim());
                    const validParts = parts.filter(part => {
                      const regex = /\bB(\d+)\s*-\s*B(\d+)\b/gi;
                      let match;
                      let hasRestriction = false;
                      let allowed = false;
                      while ((match = regex.exec(part)) !== null) {
                        hasRestriction = true;
                        const start = parseInt(match[1], 10);
                        const end = parseInt(match[2], 10);
                        if (batchNo >= start && batchNo <= end) {
                          allowed = true;
                        }
                      }
                      return !hasRestriction || allowed;
                    });
                    
                    if (validParts.length > 0) {
                      finalRoom = validParts.join(' | ')
                        .replace(/\(?\bB\d+\s*-\s*B\d+\b\)?/gi, '')
                        .replace(/\(~\d+\s*students\)/gi, '')
                        .replace(/\s+/g, ' ')
                        .replace(/\s+\|\s+/g, ' | ')
                        .trim();
                    }
                  }

                  const customRoom = getVenueForMeeting(course.courseCode, m.type, batchNo);
                  // A room the student typed into their own timings stays as typed.
                  const typedByStudent =
                    course.isPersonal && !officialRooms.get(course.courseCode)?.has(m.room);
                  if (customRoom && !typedByStudent) {
                    finalRoom = customRoom;
                  }
                  return { ...m, room: finalRoom };
                });
                
              return { ...course, meetings: newMeetings };
            });
          }
        }
        
        try {
          const result = TimetableEngine.resolveWeek(
            activeCourses, 
            loadedHolidays, 
            { targetWeek: new Date(previewDate) }
          );

          set({
            resolvedEvents: result.events,
            collisions: result.collisions,
            holidaysEncountered: result.holidaysEncountered,
            error: null
          });
        } catch (err) {
          set({ error: 'Failed to compute timetable events.', resolvedEvents: [], collisions: [] });
          console.error(err);
        }
      };

      return {
        program: null,
        branch: null,
        selectedCourseIds: [],
        previewDate: new Date().toISOString(),
        courseOverrides: {},
        courseOverridesUnsynced: false,

        loadedCourses: [],
        loadedHolidays: [],
        coursesAuthoritative: false,

        resolvedEvents: [],
        collisions: [],
        holidaysEncountered: [],
        
        isLoading: false,
        error: null,

        initializeTimetable: async (program: string, branch: string) => {
          set({ isLoading: true, error: null, program, branch });

          try {
            const [allCoursesRaw, commonData, holidays] = await Promise.all([
              TimetableLoader.loadAllCourses(),
              TimetableLoader.loadCommonData(program),
              TimetableLoader.loadHolidays()
            ]);

            // Deduplicate by courseCode with smart merging:
            // When the same course appears in multiple sheets, prefer the entry
            // with actual data (real meetings, credits, etc.) and fill in gaps.
            const courseMap = new Map<string, typeof allCoursesRaw[0]>();
            allCoursesRaw.forEach(c => {
              const existing = courseMap.get(c.courseCode);
              if (!existing) {
                courseMap.set(c.courseCode, c);
              } else {
                // Merge: prefer whichever has real data for each field
                const isPlaceholder = (val: string) => !val || val.toLowerCase().includes('check') || val.toLowerCase().includes('sheet');
                const merged = { ...existing };

                if (isPlaceholder(existing.credits) && !isPlaceholder(c.credits)) merged.credits = c.credits;
                if (isPlaceholder(existing.courseName) && !isPlaceholder(c.courseName)) merged.courseName = c.courseName;
                if ((!existing.meetings || existing.meetings.length === 0) && c.meetings?.length > 0) merged.meetings = c.meetings;
                if (existing.meetings?.length > 0 && c.meetings?.length > 0 && existing.meetings.length < c.meetings.length) merged.meetings = c.meetings;

                courseMap.set(c.courseCode, merged);
              }
            });
            const allCourses = Array.from(courseMap.values());
            
            const userState = get();
            let newSelectedIds = userState.selectedCourseIds;
            
            // Evaluate auto-population and commit state in one go
            const profile = useUserStore.getState().profile;
            
            // If changing program or branch, we should probably reset courses if they are invalid,
            // but the filtering naturally ignores invalid IDs. For 1st years, we actively manage their core courses.
            if (program === 'UG' && profile?.yearOfStudy === '1') {
              const batchNo = parseInt(profile.batchNo?.replace(/[^0-9]/g, '') || '0', 10);
              let excludedCodes: string[] = ['BT2010']; // Life science not in this semester
              
              if (batchNo >= 1 && batchNo <= 12) {
                excludedCodes.push('CY1140', 'EE1110'); // B1-12 gets Physics/Mech, exclude Chem/Elec
              } else if (batchNo >= 13 && batchNo <= 24) {
                excludedCodes.push('PH1130', 'ME1150'); // B13-24 gets Chem/Elec, exclude Physics/Mech
              }

              const commonCoreIds = commonData
                .filter(c => c.category?.toLowerCase().includes('core') && !excludedCodes.includes(c.courseCode))
                .map(c => c.courseCode);
                
              const extraIds = [];
              if (branch === 'DS') {
                // Since we load all courses now, find DS1010 safely
                const ds1010 = allCourses.find(c => c.courseCode === 'DS1010');
                if (ds1010) extraIds.push(ds1010.courseCode);
              }
              
              // Keep previously selected electives so user doesn't lose GN1003 etc.
              const previouslySelectedElectives = allCourses
                .filter(c => c.category?.toLowerCase() !== 'core' && newSelectedIds.includes(c.courseCode))
                .map(c => c.courseCode);
              
              newSelectedIds = Array.from(new Set([...commonCoreIds, ...extraIds, ...previouslySelectedElectives]));
            }
            
            set({
              loadedCourses: allCourses,
              loadedHolidays: holidays,
              coursesAuthoritative: isAuthoritative(allCoursesRaw),
              selectedCourseIds: newSelectedIds,
              isLoading: false
            });
            
            _recompute();
          } catch (err) {
            set({ 
              isLoading: false, 
              error: err instanceof Error ? err.message : 'Failed to initialize timetable datasets.' 
            });
            console.error(err);
          }
        },

        reloadTimetable: async () => {
          const { program, branch } = get();
          if (!program || !branch) return;
          
          TimetableLoader.clearCache();
          // We bypass the cache and force re-fetch
          set({ loadedCourses: [], loadedHolidays: [] }); 
          await get().initializeTimetable(program, branch);
        },

        updateSelectedCourses: (ids: string[]) => {
          set({ selectedCourseIds: ids });
          _recompute();
        },

        updatePreviewDate: (date: Date) => {
          set({ previewDate: date.toISOString() });
          _recompute();
        },

        updateProfile: (program: string, branch: string) => {
          set({ program, branch, selectedCourseIds: [] });
          get().initializeTimetable(program, branch);
        },

        saveCourseOverride: (courseCode: string, meetings: TimetableMeeting[]) => {
          const official = get().loadedCourses.find(c => c.courseCode === courseCode);
          if (!official) return;

          const overrides = { ...get().courseOverrides };
          if (sameMeetings(meetings, official.meetings)) {
            // Edited back to the official timings: nothing personal to keep.
            delete overrides[courseCode];
          } else {
            overrides[courseCode] = {
              courseCode,
              meetings,
              baseFingerprint: meetingsFingerprint(official.meetings),
              savedAt: new Date().toISOString(),
            };
          }
          set({ courseOverrides: overrides, courseOverridesUnsynced: true });
          _recompute();
        },

        removeCourseOverride: (courseCode: string) => {
          const overrides = { ...get().courseOverrides };
          delete overrides[courseCode];
          set({ courseOverrides: overrides, courseOverridesUnsynced: true });
          _recompute();
        },

        keepCourseOverride: (courseCode: string) => {
          const override = get().courseOverrides[courseCode];
          const official = get().loadedCourses.find(c => c.courseCode === courseCode);
          if (!override || !official) return;

          // Rebased onto the current official timings, so it applies again
          // until they next change.
          set({
            courseOverrides: {
              ...get().courseOverrides,
              [courseCode]: {
                ...override,
                baseFingerprint: meetingsFingerprint(official.meetings),
                savedAt: new Date().toISOString(),
              },
            },
            courseOverridesUnsynced: true,
          });
          _recompute();
        },

        setCourseOverrides: (overrides: CourseOverride[]) => {
          set({
            courseOverrides: Object.fromEntries(overrides.map(o => [o.courseCode, o])),
            courseOverridesUnsynced: false,
          });
          _recompute();
        },

        markCourseOverridesSynced: () => set({ courseOverridesUnsynced: false })
      };
    },
    {
      name: 'timetable-store',
      // Only persist user preferences, do not persist massive JSON blocks
      partialize: (state) => ({
        program: state.program,
        branch: state.branch,
        selectedCourseIds: state.selectedCourseIds,
        previewDate: state.previewDate,
        courseOverrides: state.courseOverrides,
        courseOverridesUnsynced: state.courseOverridesUnsynced
      })
    }
  )
);
