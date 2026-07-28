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
        // Since Vite needs statically analyzable imports, we can use a switch or glob
        // For dynamic imports in Vite, you usually need to construct the path so Rollup can resolve it.
        // A common pattern is `import.meta.glob` or explicit template literals.
        // If the path is highly dynamic, a generic dynamic import might fail in production build.
        // Assuming data is in src/data/timetable:
        const module = await import(`../data/timetable/${program}/${branch}.json`);
        return module.default as CourseOffering[];
      } catch (error) {
        console.warn(`Failed to load timetable data for ${program}/${branch}`, error);
        return [];
      }
    })();

    this.courseCache.set(cacheKey, loadPromise);
    return loadPromise;
  }

  /**
   * Loads common course data
   */
  static async loadCommonData(program: string): Promise<CourseOffering[]> {
    // Usually UG_CommonCourses, etc. Let's map it based on the generated files.
    // As per the generator, we might have CommonCourses or similar branch names.
    // The implementation can assume branch = 'CommonCourses' or similar.
    return this.loadBranchData(program, 'CommonCourses'); 
    // Note: Adjust the 'CommonCourses' string to match the actual generated file name if needed.
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
