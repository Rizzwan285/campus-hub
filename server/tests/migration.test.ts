import type { CourseOffering, TimetableMeeting } from '../src/repositories/timetable.repository';
import type { PublicProfile } from '../src/repositories/profile.repository';
import type { PublicSemester } from '../src/repositories/semesters.repository';
import type { SemesterConfig, SlotDefinitions } from '../../src/engine/courseSchedule';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { contextOf, migrate, startHarness, type Harness } from './helpers/harness';
import { forgetActiveSemester } from '../src/repositories/semesters.repository';
import { invalidate } from '../src/middleware/cache';

const before012 = (file: string) => file < '012';

/** The database as it is in production today: migrations 001-011 and real-looking rows. */
async function seedLegacy(h: Harness) {
  await h.sql(`insert into timetable_metadata (key, value) values
    ('semester', '"Aug-Dec 2026"'),
    ('slots', '{"B": {"type": "lecture", "timings": [{"day": "Monday", "startTime": "09:00", "endTime": "09:50"}]}}')`);
  await h.sql(`insert into course_offerings (id, program, branch, course_code, course_name, credits, category, raw_slot, semester, source, customized_at) values
    ('UG_CSE_CS101', 'UG', 'CSE', 'CS101', 'Databases', '3', 'core', 'B', 'Aug-Dec 2026', 'seed', null),
    ('UG_DS_CS101',  'UG', 'DS',  'CS101', 'Databases', '3', 'core', 'B', 'Aug-Dec 2026', 'admin', now()),
    ('UG_CSE_CS102', 'UG', 'CSE', 'CS102', 'Networks',  '3', 'electives', null, 'Aug-Dec 2026', 'seed', null)`);
  await h.sql(`insert into course_meetings (offering_id, type, day, start_time, end_time, room, instructors, recurrence, sort_order) values
    ('UG_CSE_CS101', 'lecture', 'Monday', '09:00', '09:50', 'A01-212', '{prof@x}', 'weekly', 0),
    ('UG_DS_CS101',  'lecture', 'Thursday', '16:00', '17:00', 'N305 (B1-B6) | N306 (B7-B12)', '{}', 'weekly', 0)`);
  await h.sql(`insert into venue_overrides (course_code, meeting_type, batch_min, batch_max, room) values
    ('PH1030', null, 1, 6, 'C06-105'), ('ME1130', 'lab', 1, 999, 'A01-112 (Drawing Hall)')`);
}

describe('API deployed before migrations 012 and 013 have run', () => {
  let h: Harness;
  let student: { id: string; token: string };

  beforeAll(async () => {
    h = await startHarness({ migrations: before012 });
    await seedLegacy(h);
    student = await h.user('112301001');
  });
  afterAll(async () => h.close());

  it('still serves the timetable, with no semester filter to fail on', async () => {
    const courses = await h.api<CourseOffering[]>('GET', '/api/timetable/courses');
    expect(courses.status).toBe(200);
    expect(courses.body.map((c) => c.offeringId).sort()).toEqual(['UG_CSE_CS101', 'UG_CSE_CS102', 'UG_DS_CS101']);
    expect((await h.api('GET', '/api/timetable/UG/CSE')).body).toHaveLength(2);
    expect((await h.api('GET', '/api/timetable/branches')).body).toEqual({ UG: ['CSE', 'DS'] });
    // The new endpoint says "no semester", which the client reads as "use the old one".
    expect((await h.api<{ semester: PublicSemester; courses: CourseOffering[] }>('GET', '/api/timetable/snapshot')).status).toBe(404);
  });

  it('still signs students in and syncs their courses and timings', async () => {
    const login = await h.api<{ profile: PublicProfile }>('POST', '/api/auth/login', { body: { rollNumber: '112301077' } });
    expect(login.status).toBe(200);
    expect(login.body.profile).toMatchObject({ selectedCourseIds: [], courseOverrides: [], semesterId: null });

    const saved = await h.api<{ selectedCourseIds: string[] }>('PUT', '/api/auth/courses', {
      token: student.token, body: { offeringIds: ['CS101'], context: contextOf(), semesterId: null },
    });
    expect(saved.status).toBe(200);
    expect(saved.body.selectedCourseIds).toEqual(['CS101']);

    const override = await h.api('PUT', '/api/auth/course-overrides', {
      token: student.token,
      body: { overrides: [{ courseCode: 'CS101', meetings: [], baseFingerprint: 'x', savedAt: new Date().toISOString() }] },
    });
    expect(override.status).toBe(200);
    const me = await h.api<{ profile: PublicProfile }>('GET', '/api/auth/me', { token: student.token });
    expect(me.body.profile.selectedCourseIds).toEqual(['CS101']);
    expect(me.body.profile.courseOverrides).toHaveLength(1);
  });
});

describe('migration 012/013 on the existing database', () => {
  let h: Harness;
  let student: { id: string; token: string };

  beforeAll(async () => {
    h = await startHarness({ migrations: before012 });
    await seedLegacy(h);
    student = await h.user('112301001');
    await h.sql('insert into user_courses (user_id, offering_id) values ($1, $2), ($1, $3)', [student.id, 'CS101', 'CS102']);
    await h.sql(
      `insert into user_course_overrides (user_id, course_code, meetings, base_fingerprint) values ($1, 'CS101', '[]', 'abc')`,
      [student.id],
    );
    await h.sql(
      `insert into course_change_requests (course_code, requested_by, requester_roll, base_meetings, proposed_meetings, status, applied_meetings, decided_at)
       values ('CS101', $1, '112301001', '[]', '[]', 'pending', null, null),
              ('CS102', $1, '112301001', '[]', '[]', 'approved', '[]', now())`,
      [student.id],
    );

    await migrate(h.db, (file) => !before012(file));
    forgetActiveSemester();
    invalidate();
  });
  afterAll(async () => h.close());

  it('adopts the existing timetable as the one current semester', async () => {
    const semesters = await h.sql<{ slot_definitions: SlotDefinitions; config: SemesterConfig }>('select * from semesters');
    expect(semesters).toHaveLength(1);
    expect(semesters[0]).toMatchObject({ code: 'aug-dec-2026', name: 'Aug-Dec 2026', status: 'active', slots_confirmed: true, published_version: 1 });
    expect(Object.keys(semesters[0].slot_definitions)).toEqual(['B']);
    // The rules that were hardcoded in the app, now data.
    expect(semesters[0].config.firstYear?.cohorts).toHaveLength(2);
    expect(semesters[0].config.venueRules).toEqual([
      { courseCode: 'ME1130', meetingType: 'lab', batchMin: 1, batchMax: 999, room: 'A01-112 (Drawing Hall)' },
      { courseCode: 'PH1030', meetingType: null, batchMin: 1, batchMax: 6, room: 'C06-105' },
    ]);
    expect(await h.sql('select 1 from course_offerings where semester_id is null')).toHaveLength(0);
  });

  it('labels every selection, correction and request with it — and loses none', async () => {
    const id = (await h.sql('select id from semesters'))[0].id;
    expect(await h.sql('select 1 from user_courses where semester_id = $1', [id])).toHaveLength(2);
    expect(await h.sql('select 1 from user_course_overrides where semester_id = $1', [id])).toHaveLength(1);
    const requests = await h.sql('select status, approval_mode, semester_id from course_change_requests order by id');
    expect(requests).toEqual([
      { status: 'pending', approval_mode: null, semester_id: id },
      // Approval used to mean exactly one thing: applied to everyone.
      { status: 'approved', approval_mode: 'compulsory', semester_id: id },
    ]);

    const me = await h.api<{ profile: PublicProfile }>('GET', '/api/auth/me', { token: student.token });
    expect(me.body.profile.selectedCourseIds.sort()).toEqual(['CS101', 'CS102']);
    expect(me.body.profile.courseOverrides).toHaveLength(1);
    expect(me.body.profile.semesterId).toBe(id);
  });

  it('starts the draft catalogue from what is live, keeping earlier admin corrections as corrections', async () => {
    const draft = await h.sql<{ branch: string; course_code: string; origin: string; manual: boolean; dirty: boolean; meetings: TimetableMeeting[] }>('select branch, course_code, origin, manual, dirty, meetings, schedule from semester_courses order by branch, course_code');
    expect(draft.map((row) => `${row.branch}/${row.course_code}:${row.origin}:${row.manual}:${row.dirty}`)).toEqual([
      'CSE/CS101:legacy:false:false', 'CSE/CS102:legacy:false:false', 'DS/CS101:legacy:true:false',
    ]);
    expect(draft[0].meetings).toEqual([{
      type: 'lecture', day: 'Monday', startTime: '09:00', endTime: '09:50', room: 'A01-212',
      instructors: ['prof@x'], recurrence: { type: 'weekly' },
    }]);
    // Batch text in a room string is left exactly as it was.
    expect(draft[2].meetings[0].room).toBe('N305 (B1-B6) | N306 (B7-B12)');
    expect(draft[1].meetings).toEqual([]);
  });

  it('serves the same timetable as before, now through the semester', async () => {
    const courses = await h.api<CourseOffering[]>('GET', '/api/timetable/courses');
    expect(courses.body.map((c) => c.offeringId).sort()).toEqual(['UG_CSE_CS101', 'UG_CSE_CS102', 'UG_DS_CS101']);
    const snapshot = await h.api<{ semester: PublicSemester; courses: CourseOffering[] }>('GET', '/api/timetable/snapshot');
    expect(snapshot.body.semester).toMatchObject({ name: 'Aug-Dec 2026', status: 'active', version: 1 });
    expect(snapshot.body.courses).toHaveLength(3);
  });

  it('republishing the adopted semester changes nothing students see', async () => {
    const admin = await h.user('142301026', { role: 'admin' });
    const id = (await h.sql('select id from semesters'))[0].id;
    const before = (await h.api<CourseOffering[]>('GET', '/api/timetable/courses')).body;
    const published = await h.api('POST', `/api/admin/semesters/${id}/publish`, { token: admin.token, body: {} });
    expect(published.status).toBe(200);
    const after = (await h.api<CourseOffering[]>('GET', '/api/timetable/courses')).body;
    expect(after).toEqual(before); // same ids, same meetings, same provenance
  });
});
