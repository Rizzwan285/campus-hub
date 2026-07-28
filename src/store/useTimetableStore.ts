import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { TimetableLoader } from '../services/timetableLoader';
import { TimetableEngine } from '../engine/timetableEngine';
import { 
  CourseOffering, 
  Holiday, 
  CalendarEvent, 
  Collision 
} from '../engine/types';

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

        // Filter loaded courses down to only the selected ones
        // If a student hasn't selected any, maybe we still want to show core courses?
        // Actually, the engine assumes you pass ALL courses you are taking. 
        // We will pass only the selected courses.
        const selectedSet = new Set(selectedCourseIds);
        const activeCourses = loadedCourses.filter(c => selectedSet.has(c.id));

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
          const state = get();
          // Avoid duplicate fetching if already loaded for the same program/branch
          if (state.program === program && state.branch === branch && state.loadedCourses.length > 0) {
            _recompute();
            return;
          }

          set({ isLoading: true, error: null, program, branch });

          try {
            const [branchData, commonData, holidays] = await Promise.all([
              TimetableLoader.loadBranchData(program, branch),
              TimetableLoader.loadCommonData(program),
              TimetableLoader.loadHolidays()
            ]);

            // Combine branch-specific and common courses
            const allCourses = [...branchData, ...commonData];
            
            set({ 
              loadedCourses: allCourses, 
              loadedHolidays: holidays,
              isLoading: false 
            });
            
            _recompute();
          } catch (err) {
            set({ 
              isLoading: false, 
              error: 'Failed to initialize timetable datasets.' 
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
