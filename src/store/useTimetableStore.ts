import { academicContext, firstYearBatch } from '../lib/academicProfile';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { TimetableLoader, type SemesterInfo, type TimetableMeta, type TimetableSource } from '../services/timetableLoader';
import { isApiConfigured } from '../services/api';
import { TimetableEngine } from '../engine/timetableEngine';
import {
  UNVERIFIED_BASE,
  meetingsFingerprint,
  overrideStatus,
  sameMeetings,
  applyDelta,
  type CourseOverride,
  type DeltaOutcome,
  type MeetingDelta,
} from '../engine/courseTimings';
import {
  DEFAULT_SEMESTER_CONFIG,
  batchAllowed,
  firstYearExclusions,
  venueFor,
  type SemesterConfig,
} from '../engine/courseSchedule';
import { useUserStore } from './useUserStore';
import {
  CourseOffering,
  Holiday,
  CalendarEvent,
  Collision,
  TimetableMeeting
} from '../engine/types';

/**
 * Whether loaded courses are the live official timetable. They are, unless an
 * API is configured but did not answer and the bundled copy stood in — only
 * the API sends `offeringId`.
 */
function isAuthoritative(courses: CourseOffering[], meta?: TimetableMeta): boolean {
  if (!isApiConfigured()) return true;
  // The loader knows where the data came from. A saved snapshot carries
  // `offeringId` too, but it is as capable of predating an approval as the
  // bundle is, so only a live answer counts.
  if (meta) return meta.source === 'api';
  return courses.some((course) => course.offeringId !== undefined);
}

/** The loader's account of the last load; absent when the loader is mocked in tests. */
function loaderMeta(): TimetableMeta | undefined {
  return (TimetableLoader as { getMeta?: () => TimetableMeta }).getMeta?.();
}

/**
 * One entry per course code. When the same course appears in multiple sheets,
 * prefer the entry with actual data (real meetings, credits, etc.) and fill in
 * gaps.
 */
function mergeOfferings(offerings: CourseOffering[]): CourseOffering[] {
  const courseMap = new Map<string, CourseOffering>();
  offerings.forEach(c => {
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
  return Array.from(courseMap.values());
}

/**
 * What a correction saved now is made against. Bundled fallback data is not the
 * official timetable, so a correction saved over it claims no base at all.
 */
function baseFingerprintFor(official: CourseOffering, authoritative: boolean): string {
  return authoritative ? meetingsFingerprint(official.meetings) : UNVERIFIED_BASE;
}

interface TimetableState {
  // Config & Persistent State
  program: string | null;
  branch: string | null;
  selectedCourseIds: string[];
  selectionContext: string | null;
  previewDate: string; // ISO string to be serializable
  /**
   * The semester the selection and timings above belong to. When the server
   * reports a different current semester they are set aside: last semester's
   * courses and corrections are not this semester's.
   */
  semesterCode: string | null;
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
  /** The semester of the loaded timetable, and whether it came live, saved or built in. */
  semester: SemesterInfo | null;
  timetableSource: TimetableSource;
  /** When a saved snapshot standing in for the API was saved. */
  snapshotSavedAt: string | null;
  /** The only data available is from a semester that is over; no classes are shown. */
  timetableOutdated: boolean;
  /** This semester's first-year and venue rules. */
  semesterConfig: SemesterConfig;
  
  // Resolved Output
  /**
   * The selected courses exactly as the student's timetable uses them: their
   * own timings applied and, for first years, only their batch's classes and
   * rooms. Unlike `resolvedEvents` it is the whole semester's pattern, not one
   * week of it, which is what a downloaded timetable needs.
   */
  activeCourses: CourseOffering[];
  resolvedEvents: CalendarEvent[];
  /** This week's classes a holiday cancels; see `ResolveResult.cancelledEvents`. */
  cancelledEvents: CalendarEvent[];
  collisions: Collision[];
  holidaysEncountered: Holiday[];
  
  // Status
  isLoading: boolean;
  error: string | null;

  // Actions
  initializeTimetable: (program: string, branch: string) => Promise<void>;
  reloadTimetable: () => Promise<void>;
  /**
   * Fetches the official timings again without blanking the timetable, and
   * says whether the API answered. Nothing else brings them up to date while
   * the page stays open.
   */
  refreshCourses: () => Promise<boolean>;
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
  /**
   * What an approved optional change would do to this student's timetable:
   * only the classes it names, on top of whatever they see now. Saves
   * nothing - the caller records the answer first, then saves the result with
   * saveCourseOverride. Reports `outdated` rather than guessing when a class
   * the change moves is no longer there.
   */
  previewProposal: (courseCode: string, delta: MeetingDelta) => DeltaOutcome & { baseFingerprint?: string };
}

export const useTimetableStore = create<TimetableState>()(
  persist(
    (set, get) => {
      let initialization = 0;

      const metaState = (meta?: TimetableMeta) =>
        meta
          ? {
              semester: meta.semester,
              timetableSource: meta.source,
              snapshotSavedAt: meta.savedAt,
              timetableOutdated: meta.outdated,
              semesterConfig: meta.config ?? DEFAULT_SEMESTER_CONFIG,
            }
          : {};

      /**
       * Notices a new current semester. The selection and the student's own
       * timings were for the semester before, so they are set aside here; the
       * account holds each semester's separately and the old ones stay there.
       * Only a live answer from the server can declare a semester current.
       */
      const adoptSemester = (meta?: TimetableMeta): boolean => {
        const code = meta?.source === 'api' ? meta.semester?.code : undefined;
        if (!code || code === get().semesterCode) return false;
        const changed = get().semesterCode !== null;
        set({
          semesterCode: code,
          ...(changed
            ? { selectedCourseIds: [], courseOverrides: {}, courseOverridesUnsynced: false }
            : {}),
        });
        return changed;
      };
      // Internal pure recomputation logic (avoids redundant hook dependencies)
      const _recompute = () => {
        const {
          loadedCourses, loadedHolidays, selectedCourseIds, previewDate,
          courseOverrides, coursesAuthoritative,
        } = get();

        if (!loadedCourses.length || get().timetableOutdated) {
          set({ activeCourses: [], resolvedEvents: [], cancelledEvents: [], collisions: [], holidaysEncountered: [] });
          return;
        }
        const config = get().semesterConfig;

        const selectedSet = new Set(selectedCourseIds);
        // A student's own timings stand in for the official ones — until the
        // official timings change underneath them (see overrideStatus).
        const redundant: string[] = [];
        const rebased: Record<string, CourseOverride> = {};
        let activeCourses = loadedCourses
          .filter(c => selectedSet.has(c.courseCode))
          .map(course => {
            let override = courseOverrides[course.courseCode];
            if (!override) return course;

            if (coursesAuthoritative && override.baseFingerprint === UNVERIFIED_BASE) {
              // Saved over fallback data; the official timings are in view now,
              // so from here on a change to them overtakes it like any other.
              override = { ...override, baseFingerprint: meetingsFingerprint(course.meetings) };
              rebased[course.courseCode] = override;
            }

            const status = overrideStatus(override, course.meetings, coursesAuthoritative);
            if (status === 'redundant') redundant.push(course.courseCode);
            return status === 'active'
              ? { ...course, meetings: override.meetings, isPersonal: true }
              : course;
          });

        if (redundant.length > 0 || Object.keys(rebased).length > 0) {
          const remaining = { ...courseOverrides, ...rebased };
          // Usually the student's own suggestion, now approved for everyone.
          redundant.forEach(code => delete remaining[code]);
          set({ courseOverrides: remaining, courseOverridesUnsynced: true });
        }

        const profile = useUserStore.getState().profile;
        if (profile?.program === 'UG' && profile?.yearOfStudy === '1') {
          const batchNo = firstYearBatch(profile.batchNo);
          if (!batchNo) {
            set({ activeCourses: [], resolvedEvents: [], cancelledEvents: [], collisions: [], holidaysEncountered: [] });
            return;
          }
          if (batchNo) {
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
                  // Semesters imported through /admin mark batches in their
                  // own field; older data only in the room text.
                  return (!hasRestriction || allowed) && batchAllowed(m.batches, batchNo);
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

                  const customRoom = venueFor(config, course.courseCode, m.type, batchNo);
                  // A room the student typed into their own timings stays as typed.
                  const typedByStudent =
                    course.isPersonal && !officialRooms.get(course.courseCode)?.has(m.room);
                  if (customRoom && !typedByStudent && course.source !== 'admin' && /\bB\d+\s*-\s*B\d+/i.test(m.room)) {
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
            activeCourses,
            resolvedEvents: result.events,
            cancelledEvents: result.cancelledEvents,
            collisions: result.collisions,
            holidaysEncountered: result.holidaysEncountered,
            error: null
          });
        } catch (err) {
          set({ error: 'Failed to compute timetable events.', activeCourses: [], resolvedEvents: [], cancelledEvents: [], collisions: [] });
          console.error(err);
        }
      };

      return {
        program: null,
        branch: null,
        selectedCourseIds: [],
        selectionContext: null,
        previewDate: new Date().toISOString(),
        courseOverrides: {},
        courseOverridesUnsynced: false,

        loadedCourses: [],
        loadedHolidays: [],
        coursesAuthoritative: false,
        semesterCode: null,
        semester: null,
        timetableSource: 'bundled',
        snapshotSavedAt: null,
        timetableOutdated: false,
        semesterConfig: DEFAULT_SEMESTER_CONFIG,

        activeCourses: [],
        resolvedEvents: [],
        cancelledEvents: [],
        collisions: [],
        holidaysEncountered: [],
        
        isLoading: false,
        error: null,

        initializeTimetable: async (program: string, branch: string) => {
          const request = ++initialization;
          const profile = useUserStore.getState().profile;
          const context = profile ? academicContext(profile) : null;
          const changed = get().selectionContext !== null && get().selectionContext !== context;
          set({ isLoading: true, error: null, program, branch, selectionContext: context,
            ...(changed ? { selectedCourseIds: [], resolvedEvents: [], cancelledEvents: [], collisions: [] } : {}) });

          try {
            const [allCoursesRaw, commonData, holidays] = await Promise.all([
              TimetableLoader.loadAllCourses(),
              TimetableLoader.loadCommonData(program),
              TimetableLoader.loadHolidays()
            ]);

            if (request !== initialization) return;
            const allCourses = mergeOfferings(allCoursesRaw);
            const meta = loaderMeta();
            const config = meta?.config ?? DEFAULT_SEMESTER_CONFIG;
            adoptSemester(meta);

            const userState = get();
            let newSelectedIds = userState.selectedCourseIds;
            
            // Evaluate auto-population and commit state in one go
            const profile = useUserStore.getState().profile;
            
            // First-year cores belong to one batch; other years choose their own courses.
            if (program === 'UG' && profile?.yearOfStudy === '1') {
              const batchNo = firstYearBatch(profile.batchNo);
              // Which cores a batch skips is the semester's rule, not the app's:
              // e.g. B1-12 take Physics/Mech labs, B13-24 Chemistry/Electrical.
              const excludedCodes = firstYearExclusions(config, batchNo);

              const commonCoreIds = commonData
                .filter(c => c.category?.toLowerCase().includes('core') && !excludedCodes.includes(c.courseCode))
                .map(c => c.courseCode);
                
              const extraIds = (config.firstYear?.extraByBranch?.[branch] ?? [])
                .filter(code => allCourses.some(c => c.courseCode === code));
              
              // Preserve electives on a reload, but never retain excluded cohort cores.
              const previouslySelectedElectives = allCourses
                .filter(c => !commonData.some(common => common.courseCode === c.courseCode && common.category?.toLowerCase().includes('core')) && newSelectedIds.includes(c.courseCode))
                .map(c => c.courseCode);
              
              newSelectedIds = batchNo ? Array.from(new Set([...commonCoreIds, ...extraIds, ...previouslySelectedElectives])) : [];
            }
            
            set({
              loadedCourses: allCourses,
              loadedHolidays: holidays,
              coursesAuthoritative: isAuthoritative(allCoursesRaw, meta),
              ...metaState(meta),
              selectedCourseIds: newSelectedIds,
              isLoading: false
            });
            
            _recompute();
          } catch (err) {
            if (request !== initialization) return;
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

        refreshCourses: async () => {
          // Nothing to bring up to date until the first load has finished.
          if (!get().loadedCourses.length) return false;

          const [fresh, holidays] = await Promise.all([TimetableLoader.refreshAllCourses(), TimetableLoader.refreshHolidays()]);
          if (holidays) set({ loadedHolidays: holidays });
          if (!fresh) {
            if (holidays) _recompute();
            return false;
          }

          const meta = loaderMeta();
          const semesterChanged = adoptSemester(meta);
          set({
            loadedCourses: mergeOfferings(fresh),
            coursesAuthoritative: isAuthoritative(fresh, meta),
            ...metaState(meta),
          });
          _recompute();
          // A new semester needs the full start-up again: a first year's core
          // courses are picked for them from the new catalogue.
          const { program, branch } = get();
          if (semesterChanged && program && branch) void get().initializeTimetable(program, branch);
          return true;
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
              baseFingerprint: baseFingerprintFor(official, get().coursesAuthoritative),
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
                baseFingerprint: baseFingerprintFor(official, get().coursesAuthoritative),
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

        markCourseOverridesSynced: () => set({ courseOverridesUnsynced: false }),

        previewProposal: (courseCode: string, delta: MeetingDelta) => {
          const official = get().loadedCourses.find(c => c.courseCode === courseCode);
          if (!official) return { status: 'outdated', missing: delta.remove };

          const own = get().courseOverrides[courseCode];
          const authoritative = get().coursesAuthoritative;
          const current =
            own && overrideStatus(own, official.meetings, authoritative) === 'active'
              ? own.meetings
              : official.meetings;

          const outcome = applyDelta(current, delta);
          if (outcome.status !== 'applied') return outcome;
          return { ...outcome, baseFingerprint: baseFingerprintFor(official, authoritative) };
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
        selectionContext: state.selectionContext,
        previewDate: state.previewDate,
        semesterCode: state.semesterCode,
        courseOverrides: state.courseOverrides,
        courseOverridesUnsynced: state.courseOverridesUnsynced
      })
    }
  )
);
