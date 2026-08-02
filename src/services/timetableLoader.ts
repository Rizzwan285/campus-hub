import { CourseOffering, Holiday } from '../engine/types';

export class TimetableLoader {
  private static courseCache: Map<string, Promise<CourseOffering[]>> = new Map();
  private static holidayCache: Promise<Holiday[]> | null = null;

  /**
   * Loads branch-specific timetable data asynchronously.
   * Leverages Vite's dynamic import pattern.
   * Caches the promise to prevent multiple network requests.
   */
  static async loadBranchData(program: string, branch: string): Promise<CourseOffering[]> {
    const cacheKey = `${program}_${branch}`;

    if (this.courseCache.has(cacheKey)) {
      return this.courseCache.get(cacheKey)!;
    }

    const loadPromise = (async () => {
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
   * Clears the in-memory cache
   */
  static clearCache(): void {
    this.courseCache.clear();
    this.holidayCache = null;
  }
}
