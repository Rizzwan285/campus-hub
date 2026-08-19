import { CourseOffering, Holiday } from '../engine/types';
import { fetchJson, isApiConfigured } from './api';

export class TimetableLoader {
  private static courseCache: Map<string, Promise<CourseOffering[]>> = new Map();
  private static holidayCache: Promise<Holiday[]> | null = null;
  private static allCoursesCache: Promise<CourseOffering[]> | null = null;

  /**
   * Loads branch-specific timetable data asynchronously.
   * Tries the API first (fresh data), then the bundled JSON (offline/static).
   * Caches the promise to prevent multiple network requests.
   */
  static async loadBranchData(program: string, branch: string): Promise<CourseOffering[]> {
    const cacheKey = `${program}_${branch}`;

    if (this.courseCache.has(cacheKey)) {
      return this.courseCache.get(cacheKey)!;
    }

    const loadPromise = (async () => {
      if (isApiConfigured()) {
        try {
          const courses = await fetchJson<CourseOffering[]>(`/api/timetable/${program}/${branch}`);
          if (courses.length > 0) return courses;
        } catch {
          // fall through to the bundled JSON
        }
      }

      try {
        const module = await import(`../data/timetable/${program}/${branch}.json`);
        return module.default as CourseOffering[];
      } catch (error) {
        console.error(`Failed to load timetable data for ${program}/${branch}`, error);
        throw new Error(`Failed to load timetable data for ${program}/${branch}. Please refresh the page.`);
      }
    })();

    this.courseCache.set(cacheKey, loadPromise);
    return loadPromise;
  }

  /**
   * Loads common course data
   */
  static async loadCommonData(program: string): Promise<CourseOffering[]> {
    if (program === 'PG') {
      return this.loadBranchData(program, 'InstCommonCourses');
    }
    return this.loadBranchData(program, 'CommonCourses'); 
  }

  /**
   * Loads holidays data
   */
  static async loadHolidays(): Promise<Holiday[]> {
    if (this.holidayCache) {
      return this.holidayCache;
    }

    const loadPromise = (async () => {
      if (isApiConfigured()) {
        try {
          return await fetchJson<Holiday[]>('/api/holidays');
        } catch {
          // fall through to the bundled JSON
        }
      }

      try {
        const module = await import('../data/timetable/holidays.json');
        return module.default as Holiday[];
      } catch (error) {
        console.warn('Failed to load holidays data', error);
        return [];
      }
    })();

    this.holidayCache = loadPromise;
    return loadPromise;
  }

  /**
   * Loads ALL courses across all branches and programs (UG & PG)
   * This is useful so students can select cross-listed or PG electives.
   */
  static async loadAllCourses(): Promise<CourseOffering[]> {
    if (this.allCoursesCache) {
      return this.allCoursesCache;
    }

    const loadPromise = (async () => {
      if (isApiConfigured()) {
        try {
          const courses = await fetchJson<CourseOffering[]>('/api/timetable/courses');
          if (courses.length > 0) return courses;
        } catch {
          // fall through to the bundled JSON
        }
      }

      const modules = import.meta.glob('../data/timetable/*/*.json');

      const fetchPromises = Object.entries(modules)
        .filter(([path]) => !path.includes('slots.json') && !path.includes('holidays.json'))
        .map(([path, importFn]) => 
          (importFn() as Promise<{ default: CourseOffering[] }>)
            .then(module => module.default)
            .catch(error => {
              console.warn(`Failed to load ${path}`, error);
              return [] as CourseOffering[];
            })
        );
      
      const results = await Promise.all(fetchPromises);
      return results.flat();
    })();

    this.allCoursesCache = loadPromise;
    return loadPromise;
  }

  /**
   * Clears the in-memory cache
   */
  static clearCache(): void {
    this.courseCache.clear();
    this.holidayCache = null;
    this.allCoursesCache = null;
  }
}
