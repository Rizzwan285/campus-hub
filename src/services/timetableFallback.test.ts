import { beforeEach, describe, expect, it, vi } from 'vitest';

// What the "server" does in each test, and the error the real client throws.
const { server, Unavailable } = vi.hoisted(() => {
  class Unavailable extends Error {
    status?: number;
    constructor(message: string, status?: number) {
      super(message);
      this.status = status;
    }
  }
  return {
    Unavailable,
    server: {
      configured: true,
      respond: (async () => {
        throw new Unavailable('unset');
      }) as (path: string) => Promise<unknown>,
    },
  };
});

vi.mock('./api', () => ({
  ApiUnavailableError: Unavailable,
  isApiConfigured: () => server.configured,
  fetchJson: (path: string) => server.respond(path),
}));

import { TimetableLoader } from './timetableLoader';

const memory = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (key: string) => memory.get(key) ?? null,
  setItem: (key: string, value: string) => void memory.set(key, value),
  removeItem: (key: string) => void memory.delete(key),
  clear: () => memory.clear(),
});

const course = (code: string) => ({
  id: code, offeringId: `jan-may-2027/UG_CSE_${code}`, program: 'UG', branch: 'CSE', courseCode: code,
  courseName: code, credits: '3', category: 'core', meetings: [],
});
const snapshot = (code: string, name: string, version = 1) => ({
  semester: { id: 2, code, name, status: 'active', version, publishedAt: '2027-01-02T00:00:00.000Z' },
  slots: { A: { type: 'lecture', timings: [] } },
  config: { firstYear: { excludedCodes: ['XX1'] } },
  courses: [course('CS101'), course('CS102')],
});
const down = async () => { throw new Unavailable('offline'); };

beforeEach(() => {
  memory.clear();
  TimetableLoader.clearCache();
  server.configured = true;
  server.respond = down;
});

describe('loading a semester published from /admin, with and without the server', () => {
  it('uses the server\'s snapshot and remembers it', async () => {
    server.respond = async () => snapshot('jan-may-2027', 'Jan-May 2027');
    const courses = await TimetableLoader.loadAllCourses();
    expect(courses.map((c) => c.courseCode)).toEqual(['CS101', 'CS102']);
    expect(TimetableLoader.getMeta()).toMatchObject({
      source: 'api', outdated: false, semester: { code: 'jan-may-2027', version: 1 },
      config: { firstYear: { excludedCodes: ['XX1'] } },
    });
  });

  it('falls back to the saved snapshot when the server stops answering — no redeploy needed', async () => {
    server.respond = async () => snapshot('jan-may-2027', 'Jan-May 2027', 3);
    await TimetableLoader.loadAllCourses();

    TimetableLoader.clearCache(); // a new visit
    server.respond = down;
    const courses = await TimetableLoader.loadAllCourses();
    expect(courses.map((c) => c.courseCode)).toEqual(['CS101', 'CS102']);
    const meta = TimetableLoader.getMeta();
    expect(meta).toMatchObject({ source: 'cache', outdated: false, semester: { name: 'Jan-May 2027', version: 3 } });
    expect(meta.savedAt).toBeTruthy();   // the UI says how old the copy is
    // The saved copy also serves the first-year common-course lookup.
    expect((await TimetableLoader.loadBranchData('UG', 'CSE')).map((c) => c.courseCode)).toEqual(['CS101', 'CS102']);
  });

  it('refuses to pass the built-in timetable off as a newer semester', async () => {
    // This browser has seen Jan-May 2027 as current, but holds no copy of it.
    memory.set('campus-current-semester', JSON.stringify({ code: 'jan-may-2027', name: 'Jan-May 2027' }));
    await TimetableLoader.loadAllCourses();
    expect(TimetableLoader.getMeta()).toMatchObject({ source: 'bundled', outdated: true });
  });

  it('shows the built-in timetable when it is the semester the server last named', async () => {
    memory.set('campus-current-semester', JSON.stringify({ code: 'aug-dec-2026', name: 'Aug-Dec 2026' }));
    const courses = await TimetableLoader.loadAllCourses();
    expect(courses.length).toBeGreaterThan(100);
    expect(TimetableLoader.getMeta()).toMatchObject({ source: 'bundled', outdated: false, semester: { name: 'Aug-Dec 2026' } });
  });

  it('shows the built-in timetable on a first visit with the server down', async () => {
    await TimetableLoader.loadAllCourses();
    expect(TimetableLoader.getMeta()).toMatchObject({ source: 'bundled', outdated: false });
  });

  it('still works against a server that has no semesters yet', async () => {
    server.respond = async (path) => {
      if (path.startsWith('/api/timetable/snapshot')) throw new Unavailable('404', 404);
      return [course('CS101')];
    };
    expect(await TimetableLoader.loadAllCourses()).toHaveLength(1);
    expect(TimetableLoader.getMeta()).toMatchObject({ source: 'api', semester: null, config: null });
  });

  it('a refresh that fails leaves what is loaded in place', async () => {
    server.respond = async () => snapshot('jan-may-2027', 'Jan-May 2027');
    await TimetableLoader.loadAllCourses();
    server.respond = down;
    expect(await TimetableLoader.refreshAllCourses()).toBeNull();
    expect(TimetableLoader.getMeta().source).toBe('api');
  });

  it('never calls the built-in data outdated when no server is configured at all', async () => {
    server.configured = false;
    memory.set('campus-current-semester', JSON.stringify({ code: 'jan-may-2027', name: 'Jan-May 2027' }));
    await TimetableLoader.loadAllCourses();
    expect(TimetableLoader.getMeta()).toMatchObject({ source: 'bundled', outdated: false });
  });
});
