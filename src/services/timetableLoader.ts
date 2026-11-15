import bundledHolidays from '../data/timetable/holidays.json';
import bundledMetadata from '../data/timetable/metadata.json';
import { CourseOffering, Holiday } from '../engine/types';
import type { SemesterConfig, SlotDefinitions } from '../engine/courseSchedule';
import { ApiUnavailableError, fetchJson, isApiConfigured } from './api';

export interface SemesterInfo {
  id: number | null;
  code: string;
  name: string;
  status?: string;
  /** Publication number; goes up every time the semester is published. */
  version?: number;
  publishedAt?: string | null;
}

/** One published semester, whole, as `GET /api/timetable/snapshot` serves it. */
export interface TimetableSnapshot {
  semester: SemesterInfo;
  slots: SlotDefinitions;
  config: SemesterConfig;
  courses: CourseOffering[];
}

/**
 * Where the timetable on screen came from.
 *
 *   api      the server answered: this is the official timetable right now
 *   cache    the server did not answer; this is the last snapshot it sent
 *   bundled  neither; this is the copy compiled into the app
 */
export type TimetableSource = 'api' | 'cache' | 'bundled';

export interface TimetableMeta {
  source: TimetableSource;
  semester: SemesterInfo | null;
  slots: SlotDefinitions | null;
  /** Null means "use the built-in rules": no server has said otherwise. */
  config: SemesterConfig | null;
  /** When a cached snapshot was saved. */
  savedAt: string | null;
  /**
   * The data is known to belong to a semester that is no longer current: the
   * app has seen a newer semester from the server before, and what it can
   * show now is older than that. Never show this as the student's timetable.
   */
  outdated: boolean;
}

const SNAPSHOT_KEY = 'campus-timetable-snapshot';
const CURRENT_SEMESTER_KEY = 'campus-current-semester';

const semesterCode = (name: string) =>
  name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

const BUNDLED_SEMESTER: SemesterInfo = {
  id: null,
  code: semesterCode((bundledMetadata as { semester?: string }).semester ?? 'bundled'),
  name: (bundledMetadata as { semester?: string }).semester ?? 'the built-in timetable',
};

function readStored<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function store(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage full or unavailable: the app still works, just without the
    // offline copy of a published semester.
  }
}

export class TimetableLoader {
  private static courseCache: Map<string, Promise<CourseOffering[]>> = new Map();
  private static holidayCache: Promise<Holiday[]> | null = null;
  private static allCoursesCache: Promise<CourseOffering[]> | null = null;
  private static meta: TimetableMeta = {
    source: 'bundled', semester: BUNDLED_SEMESTER, slots: null, config: null, savedAt: null, outdated: false,
  };

  /** What the most recent course load actually returned. */
  static getMeta(): TimetableMeta {
    return this.meta;
  }

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
          // fall through to the saved snapshot, then the bundled JSON
        }
        // A semester published from /admin has no bundled file; its last
        // snapshot does carry the branch.
        const saved = readStored<{ snapshot: TimetableSnapshot }>(SNAPSHOT_KEY)?.snapshot;
        const fromSnapshot = saved?.courses.filter(
          (course) => course.program === program && course.branch === branch,
        );
        if (fromSnapshot?.length) return fromSnapshot;
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

      return bundledHolidays as Holiday[];
    })();

    this.holidayCache = loadPromise;
    return loadPromise;
  }

  /**
   * The official timetable from the API, or null if it did not answer.
   *
   * A server with semesters sends a snapshot naming its semester; that is kept
   * in this browser so the semester survives an outage without the app being
   * rebuilt. A server without them (not migrated yet) still sends the plain
   * course list, exactly as before.
   */
  private static async fetchOfficial(): Promise<CourseOffering[] | null> {
    try {
      const snapshot = await fetchJson<TimetableSnapshot>('/api/timetable/snapshot', { fresh: true });
      if (snapshot?.courses?.length) {
        store(SNAPSHOT_KEY, { snapshot, savedAt: new Date().toISOString() });
        store(CURRENT_SEMESTER_KEY, { code: snapshot.semester.code, name: snapshot.semester.name });
        this.meta = {
          source: 'api', semester: snapshot.semester, slots: snapshot.slots, config: snapshot.config,
          savedAt: null, outdated: false,
        };
        return snapshot.courses;
      }
    } catch (error) {
      // 404: this server has no current semester to snapshot. Anything else
      // means it could not be reached at all.
      if (!(error instanceof ApiUnavailableError) || error.status !== 404) return null;
    }

    try {
      const courses = await fetchJson<CourseOffering[]>('/api/timetable/courses', { fresh: true });
      if (courses.length === 0) return null;
      this.meta = { source: 'api', semester: null, slots: null, config: null, savedAt: null, outdated: false };
      return courses;
    } catch {
      return null;
    }
  }

  /** The last snapshot the API sent this browser, when the API is not answering. */
  private static fromSavedSnapshot(): CourseOffering[] | null {
    const saved = readStored<{ snapshot: TimetableSnapshot; savedAt: string }>(SNAPSHOT_KEY);
    if (!saved?.snapshot?.courses?.length) return null;
    this.meta = {
      source: 'cache', semester: saved.snapshot.semester, slots: saved.snapshot.slots,
      config: saved.snapshot.config, savedAt: saved.savedAt, outdated: false,
    };
    return saved.snapshot.courses;
  }

  private static async fromBundle(): Promise<CourseOffering[]> {
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

    // The bundle is one fixed semester. If the server has ever told this
    // browser that a different semester is current, the bundle is last
    // semester's timetable and must not pass for this one.
    const current = isApiConfigured() ? readStored<{ code: string }>(CURRENT_SEMESTER_KEY) : null;
    this.meta = {
      source: 'bundled', semester: BUNDLED_SEMESTER, slots: null, config: null, savedAt: null,
      outdated: current !== null && current.code !== BUNDLED_SEMESTER.code,
    };
    return results.flat();
  }

  /**
   * Loads ALL courses across all branches and programs (UG & PG)
   * This is useful so students can select cross-listed or PG electives.
   *
   * API first; then the last snapshot the API sent; then the bundled copy.
   * `getMeta()` says which one it was.
   */
  static async loadAllCourses(): Promise<CourseOffering[]> {
    if (this.allCoursesCache) {
      return this.allCoursesCache;
    }

    const loadPromise = (async () => {
      if (isApiConfigured()) {
        const official = await this.fetchOfficial();
        if (official) return official;
        const saved = this.fromSavedSnapshot();
        if (saved) return saved;
      }
      return this.fromBundle();
    })();

    this.allCoursesCache = loadPromise;
    return loadPromise;
  }

  /**
   * Fetches every course again, past this class's cache and the browser's.
   *
   * loadAllCourses() answers from memory for as long as the page stays open,
   * so timings approved in the meantime, or the real ones after a cold start
   * left bundled data on screen, never arrive on their own. Returns null when
   * the API does not answer, leaving whatever is loaded in place.
   */
  static async refreshAllCourses(): Promise<CourseOffering[] | null> {
    if (!isApiConfigured()) return null;

    const courses = await this.fetchOfficial();
    if (!courses) return null;
    this.allCoursesCache = Promise.resolve(courses);
    this.courseCache.clear();
    return courses;
  }

  static async refreshHolidays(): Promise<Holiday[] | null> {
    if (!isApiConfigured()) return null;
    try {
      const holidays = await fetchJson<Holiday[]>('/api/holidays', { fresh: true });
      this.holidayCache = Promise.resolve(holidays);
      return holidays;
    } catch {
      return null;
    }
  }

  /** A published semester that is not the current one, for browsing ahead. */
  static async loadUpcoming(code: string): Promise<TimetableSnapshot> {
    return fetchJson<TimetableSnapshot>(`/api/timetable/snapshot?semester=${encodeURIComponent(code)}`);
  }

  static async listSemesters(): Promise<SemesterInfo[]> {
    return fetchJson<SemesterInfo[]>('/api/timetable/semesters');
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
