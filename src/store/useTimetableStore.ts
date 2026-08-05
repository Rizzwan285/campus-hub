import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { TimetableLoader } from '../services/timetableLoader';
import { TimetableEngine } from '../engine/timetableEngine';
import { useUserStore } from './useUserStore';
import { 
  CourseOffering, 
  Holiday, 
  CalendarEvent, 
  Collision 
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

interface TimetableState {
  // Config & Persistent State
  program: string | null;
  branch: string | null;
  selectedCourseIds: string[];
  previewDate: string; // ISO string to be serializable
  
  // Transient Loaded Data (Not persisted to localStorage to save space)
  loadedCourses: CourseOffering[];
  loadedHolidays: Holiday[];
  
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
}

export const useTimetableStore = create<TimetableState>()(
  persist(
    (set, get) => {
      // Internal pure recomputation logic (avoids redundant hook dependencies)
      const _recompute = () => {
        const { loadedCourses, loadedHolidays, selectedCourseIds, previewDate } = get();
        
        if (!loadedCourses.length) return;

        const selectedSet = new Set(selectedCourseIds);
        let activeCourses = loadedCourses.filter(c => selectedSet.has(c.courseCode));

        const profile = useUserStore.getState().profile;
        if (profile?.program === 'UG' && profile?.yearOfStudy === '1') {
          const batchNo = parseInt(profile.batchNo?.replace(/[^0-9]/g, '') || '0', 10);
          if (batchNo > 0) {
            activeCourses = activeCourses.map(course => {
              const newMeetings = course.meetings.map(m => {
                const customRoom = getVenueForMeeting(course.courseCode, m.type, batchNo);
                if (customRoom) {
                  return { ...m, room: customRoom };
                }
                return m;
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
        
        loadedCourses: [],
        loadedHolidays: [],
        
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
        }
      };
    },
    {
      name: 'timetable-store',
      // Only persist user preferences, do not persist massive JSON blocks
      partialize: (state) => ({
        program: state.program,
        branch: state.branch,
        selectedCourseIds: state.selectedCourseIds,
        previewDate: state.previewDate
      })
    }
  )
);
