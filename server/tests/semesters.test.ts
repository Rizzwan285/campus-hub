import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { contextOf, startHarness, type Harness } from './helpers/harness';
import { meeting, parsedCourse, parsedImport, publishSemester } from './helpers/fixtures';

let h: Harness;
let admin: { id: string; token: string };
let student: { id: string; token: string };

beforeAll(async () => {
  h = await startHarness();
  admin = await h.user('142301026', { role: 'admin' });
  student = await h.user('112301001');
});
afterAll(async () => h.close());

const courseByCode = async (semesterId: number, code: string) => {
  const list = await h.api('GET', `/api/admin/semesters/${semesterId}/courses`, { token: admin.token });
  return list.body.find((course: { courseCode: string }) => course.courseCode === code);
};

describe('semester lifecycle: draft, review, publish, activate', () => {
  let id: number;
  let code: string;

  it('is admin-only, and reads no upload from anyone else', async () => {
    expect((await h.api('GET', '/api/admin/semesters')).status).toBe(401);
    expect((await h.api('GET', '/api/admin/semesters', { token: student.token })).status).toBe(403);
    const big = { junk: 'x'.repeat(600_000) };
    expect((await h.api('POST', '/api/admin/semesters/1/import-parsed', { body: big })).status).toBe(401);
    expect((await h.api('POST', '/api/admin/semesters/1/import-parsed', { token: student.token, body: big })).status).toBe(403);
  });

  it('creates a draft, and refuses a second one with the same name', async () => {
    const created = await h.api('POST', '/api/admin/semesters', { token: admin.token, body: { name: 'Aug-Dec 2026' } });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ code: 'aug-dec-2026', status: 'draft', slotsConfirmed: false, publishedVersion: 0 });
    id = created.body.id;
    code = created.body.code;
    const again = await h.api('POST', '/api/admin/semesters', { token: admin.token, body: { name: 'Aug-Dec 2026' } });
    expect(again.status).toBe(409);
  });

  it('imports courses and sorts them into ok, needs review and invalid', async () => {
    const imported = await h.api('POST', `/api/admin/semesters/${id}/import-parsed`, {
      token: admin.token,
      body: parsedImport([
        parsedCourse({ code: 'CS101', rawSlot: 'B+PA1', assignments: [
          { slot: 'B', days: null, room: 'A01-212' },
          { slot: 'PA1', days: null, room: 'Nila CS Lab' },
        ] }),
        parsedCourse({ code: 'CS102', rawSlot: 'ZZ', assignments: [], issues: [
          { code: 'unknown_slot', severity: 'blocking', message: '"ZZ" is not in this semester\'s slot system.' },
        ] }),
        parsedCourse({ code: 'CS103', rawSlot: 'A (1 pm - 1:50 pm)', assignments: [
          { slot: 'A', days: null, room: 'N203', startTime: '13:00', endTime: '13:50' },
        ], issues: [{ code: 'time_override', severity: 'review', message: 'Slot A is given as 13:00-13:50.' }] }),
      ]),
    });
    expect(imported.status).toBe(200);
    expect(imported.body).toMatchObject({ total: 3, ok: 1, needsReview: 1, invalid: 1 });
    expect(imported.body.added).toHaveLength(3);
    expect(imported.body.slots.adopted).toBe(true);

    const cs101 = await courseByCode(id, 'CS101');
    // Rooms are per slot: the lecture slot and the lab slot keep their own venue.
    expect(cs101.meetings.map((m: any) => `${m.slot} ${m.day} ${m.room}`)).toEqual([
      'B Monday A01-212', 'PA1 Monday Nila CS Lab', 'B Tuesday A01-212', 'B Friday A01-212',
    ]);
    const cs103 = await courseByCode(id, 'CS103');
    expect(cs103.meetings.every((m: any) => m.startTime === '13:00')).toBe(true);
    expect(cs103.reviewStatus).toBe('needs_review');
  });

  it('will not publish before the slot table is confirmed or while a course is invalid', async () => {
    let publish = await h.api('POST', `/api/admin/semesters/${id}/publish`, { token: admin.token, body: {} });
    expect(publish.status).toBe(409);
    expect(publish.body.error).toMatch(/slot table/i);

    await h.api('PATCH', `/api/admin/semesters/${id}`, { token: admin.token, body: { slotsConfirmed: true } });
    publish = await h.api('POST', `/api/admin/semesters/${id}/publish`, { token: admin.token, body: {} });
    expect(publish.status).toBe(409);
    expect(publish.body.details).toEqual([expect.objectContaining({ courseCode: 'CS102' })]);

    // A failed publish leaves nothing behind.
    expect(await h.sql('select 1 from course_offerings where semester_id = $1', [id])).toHaveLength(0);
    expect(await h.sql('select 1 from semester_snapshots where semester_id = $1', [id])).toHaveLength(0);
  });

  it('accepts a manual correction made with structured slots, days and rooms', async () => {
    const cs102 = await courseByCode(id, 'CS102');
    const saved = await h.api('PUT', `/api/admin/semesters/${id}/courses/${cs102.id}`, {
      token: admin.token,
      body: {
        schedule: {
          assignments: [{
            slot: 'B', days: ['Monday', 'Friday'], room: 'A01-212',
            overrides: { Friday: { room: 'A01-118' } },
          }],
          custom: [meeting('Saturday', '10:00', '11:00', 'Seminar Hall')],
        },
      },
    });
    expect(saved.status).toBe(200);
    expect(saved.body).toMatchObject({ reviewStatus: 'ok', manual: true });
    expect(saved.body.meetings.map((m: any) => `${m.day} ${m.startTime} ${m.room}`)).toEqual([
      'Monday 09:00 A01-212', 'Friday 10:00 A01-118', 'Saturday 10:00 Seminar Hall',
    ]);

    // Choosing a day the slot does not meet on is an error, not a silent drop.
    const wrong = await h.api('PUT', `/api/admin/semesters/${id}/courses/${cs102.id}`, {
      token: admin.token,
      body: { schedule: { assignments: [{ slot: 'B', days: ['Wednesday'], room: '' }], custom: [] } },
    });
    expect(wrong.body.reviewStatus).toBe('invalid');
    await h.api('PUT', `/api/admin/semesters/${id}/courses/${cs102.id}`, {
      token: admin.token,
      body: { schedule: { assignments: [{ slot: 'B', days: ['Monday'], room: 'A01-212' }], custom: [] } },
    });
  });

  it('publishes atomically as version 1, without yet changing what students see', async () => {
    const publish = await h.api('POST', `/api/admin/semesters/${id}/publish`, {
      token: admin.token, body: { note: 'First release' },
    });
    expect(publish.status).toBe(200);
    expect(publish.body).toMatchObject({ version: 1, courses: 3 });
    expect(publish.body.semester.status).toBe('published');

    // Published is not active: there is still no current semester.
    expect((await h.api('GET', '/api/timetable/snapshot')).status).toBe(404);
    const upcoming = await h.api('GET', `/api/timetable/snapshot?semester=${code}`);
    expect(upcoming.status).toBe(200);
    expect(upcoming.body.courses).toHaveLength(3);
    expect(upcoming.body.semester).toMatchObject({ name: 'Aug-Dec 2026', status: 'published', version: 1 });

    const audit = await h.sql<{ action: string }>("select action from audit_log where action like 'semester.%'");
    expect(audit.map((row) => row.action)).toEqual(expect.arrayContaining(['semester.create', 'semester.import', 'semester.publish']));
  });

  it('never serves a draft publicly', async () => {
    const draft = await h.api('POST', '/api/admin/semesters', { token: admin.token, body: { name: 'Draft Only 2030' } });
    expect((await h.api('GET', `/api/timetable/snapshot?semester=${draft.body.code}`)).status).toBe(404);
    const listed = await h.api('GET', '/api/timetable/semesters');
    expect(listed.body.map((entry: any) => entry.code)).toEqual(['aug-dec-2026']);
  });

  it('activates, and the legacy course endpoints then serve this semester', async () => {
    const activated = await h.api('POST', `/api/admin/semesters/${id}/activate`, { token: admin.token });
    expect(activated.status).toBe(200);
    expect(activated.body.semester.status).toBe('active');

    const snapshot = await h.api('GET', '/api/timetable/snapshot');
    expect(snapshot.body.semester.code).toBe(code);
    expect(Object.keys(snapshot.body.slots)).toEqual(['A', 'B', 'J', 'PA1']);
    const courses = await h.api('GET', '/api/timetable/courses');
    expect(courses.body.map((course: any) => course.id).sort()).toEqual(['CS101', 'CS102', 'CS103']);
    expect(courses.body[0].offeringId).toMatch(/^aug-dec-2026\//);
  });

  it('keeps a manual correction through a re-import of unchanged files', async () => {
    const again = await h.api('POST', `/api/admin/semesters/${id}/import-parsed`, {
      token: admin.token,
      body: parsedImport([
        parsedCourse({ code: 'CS101', rawSlot: 'B+PA1', assignments: [
          { slot: 'B', days: null, room: 'A01-212' }, { slot: 'PA1', days: null, room: 'Nila CS Lab' },
        ] }),
        parsedCourse({ code: 'CS102', rawSlot: 'ZZ', assignments: [], issues: [
          { code: 'unknown_slot', severity: 'blocking', message: '"ZZ" is not in this semester\'s slot system.' },
        ] }),
        parsedCourse({ code: 'CS103', rawSlot: 'A (1 pm - 1:50 pm)', assignments: [
          { slot: 'A', days: null, room: 'N203', startTime: '13:00', endTime: '13:50' },
        ], issues: [{ code: 'time_override', severity: 'review', message: 'Slot A is given as 13:00-13:50.' }] }),
      ]),
    });
    expect(again.body.keptManual).toEqual(['UG/CSE/CS102']);
    expect(again.body.added).toHaveLength(0);
    expect(again.body.modified).toHaveLength(0);
    const cs102 = await courseByCode(id, 'CS102');
    expect(cs102).toMatchObject({ manual: true, reviewStatus: 'ok', importChange: 'kept_manual' });
    expect(cs102.meetings).toHaveLength(1);
  });

  it('flags a manual correction for revalidation when its source row changes, without discarding it', async () => {
    const changed = await h.api('POST', `/api/admin/semesters/${id}/import-parsed`, {
      token: admin.token,
      body: parsedImport([
        parsedCourse({ code: 'CS101', rawSlot: 'B+PA1', assignments: [
          { slot: 'B', days: null, room: 'A01-212' }, { slot: 'PA1', days: null, room: 'Nila CS Lab' },
        ] }),
        parsedCourse({ code: 'CS102', rawSlot: 'J', assignments: [{ slot: 'J', days: null, room: 'A01-007' }] }),
        // CS103 has been dropped from the workbook.
        parsedCourse({ code: 'CS104', rawSlot: 'A', assignments: [{ slot: 'A', days: null, room: 'N203' }] }),
      ]),
    });
    expect(changed.body.revalidate).toEqual(['UG/CSE/CS102']);
    expect(changed.body.removed).toEqual(['UG/CSE/CS103']);
    expect(changed.body.added).toEqual(['UG/CSE/CS104']);

    const cs102 = await courseByCode(id, 'CS102');
    expect(cs102.reviewStatus).toBe('needs_review');
    expect(cs102.issues.map((issue: any) => issue.code)).toContain('source_changed');
    expect(cs102.meetings).toHaveLength(1); // still the admin's Monday-only B

    // Nothing reached students yet: the import only touched the draft.
    const live = await h.api('GET', '/api/timetable/courses');
    expect(live.body.map((course: any) => course.id).sort()).toEqual(['CS101', 'CS102', 'CS103']);

    const reset = await h.api('POST', `/api/admin/semesters/${id}/courses/${cs102.id}/reset`, { token: admin.token });
    expect(reset.body.manual).toBe(false);
    expect(reset.body.meetings.map((m: any) => m.slot)).toEqual(['J', 'J']);
  });

  it('publishes the changes as version 2 and can roll back to version 1', async () => {
    const second = await h.api('POST', `/api/admin/semesters/${id}/publish`, { token: admin.token, body: {} });
    expect(second.body, JSON.stringify(second.body)).toMatchObject({ version: 2 });
    let live = await h.api('GET', '/api/timetable/courses');
    expect(live.body.map((course: any) => course.id).sort()).toEqual(['CS101', 'CS102', 'CS104']);

    const rollback = await h.api('POST', `/api/admin/semesters/${id}/rollback`, { token: admin.token, body: { version: 1 } });
    expect(rollback.status).toBe(200);
    expect(rollback.body.version).toBe(3);
    live = await h.api('GET', '/api/timetable/courses');
    expect(live.body.map((course: any) => course.id).sort()).toEqual(['CS101', 'CS102', 'CS103']);
    expect(live.body.find((course: any) => course.id === 'CS102').meetings).toHaveLength(1);

    const detail = await h.api('GET', `/api/admin/semesters/${id}`, { token: admin.token });
    expect(detail.body.snapshots.map((s: any) => `${s.version}:${s.kind}`)).toEqual(['3:rollback', '2:publish', '1:publish']);
    expect((await h.api('POST', `/api/admin/semesters/${id}/rollback`, { token: admin.token, body: { version: 99 } })).status).toBe(404);
  });

  it('writes an edit made in the old slot editor back into the draft, so a publish keeps it', async () => {
    const live = await h.api('GET', '/api/timetable/courses');
    const offeringId = live.body.find((course: any) => course.id === 'CS101').offeringId;
    const edit = await h.api('PUT', `/api/admin/courses/${encodeURIComponent(offeringId)}/schedule`, {
      token: admin.token,
      body: { meetings: [{ type: 'lecture', day: 'Thursday', startTime: '16:00', endTime: '17:00', room: 'A01-001' }] },
    });
    expect(edit.status).toBe(200);
    const draft = await courseByCode(id, 'CS101');
    expect(draft).toMatchObject({ manual: true, dirty: false });
    expect(draft.meetings.map((m: any) => m.day)).toEqual(['Thursday']);

    await h.api('POST', `/api/admin/semesters/${id}/publish`, { token: admin.token, body: {} });
    const after = await h.api('GET', '/api/timetable/courses');
    expect(after.body.find((course: any) => course.id === 'CS101').meetings.map((m: any) => m.day)).toEqual(['Thursday']);
  });
});

describe('semester isolation of student data', () => {
  let first: number;
  let second: { id: number; code: string };

  it('ties a selection and personal timings to the current semester', async () => {
    first = (await h.sql<{ id: number }>("select id from semesters where status = 'active'"))[0].id;
    const selected = await h.api('PUT', '/api/auth/courses', {
      token: student.token, body: { offeringIds: ['CS101', 'CS102'], context: contextOf(), semesterId: first },
    });
    expect(selected.status).toBe(200);
    const override = await h.api('PUT', '/api/auth/course-overrides', {
      token: student.token,
      body: { overrides: [{ courseCode: 'CS101', meetings: [meeting('Friday', '15:00', '16:00')], baseFingerprint: 'abc', savedAt: new Date().toISOString() }] },
    });
    expect(override.status).toBe(200);
    const me = await h.api('GET', '/api/auth/me', { token: student.token });
    expect(me.body.profile).toMatchObject({ semesterId: first, selectedCourseIds: ['CS101', 'CS102'] });
    expect(me.body.profile.courseOverrides).toHaveLength(1);
  });

  it('publishing an upcoming semester changes nothing for students', async () => {
    second = await publishSemester(h, admin.token, 'Jan-May 2027', [
      parsedCourse({ code: 'CS101', rawSlot: 'A', assignments: [{ slot: 'A', days: null, room: 'N305' }] }),
      parsedCourse({ code: 'CS201', rawSlot: 'J', assignments: [{ slot: 'J', days: null, room: 'A01-007' }] }),
    ]);
    const me = await h.api('GET', '/api/auth/me', { token: student.token });
    expect(me.body.profile.selectedCourseIds).toEqual(['CS101', 'CS102']);
    const current = await h.api('GET', '/api/timetable/snapshot');
    expect(current.body.semester.name).toBe('Aug-Dec 2026');
    const listed = await h.api('GET', '/api/timetable/semesters');
    expect(listed.body.map((entry: any) => `${entry.name}:${entry.status}`)).toEqual([
      'Aug-Dec 2026:active', 'Jan-May 2027:published',
    ]);
  });

  it('activating it starts students fresh and archives the old semester intact', async () => {
    const activated = await h.api('POST', `/api/admin/semesters/${second.id}/activate`, { token: admin.token });
    expect(activated.body.archived.name).toBe('Aug-Dec 2026');

    const me = await h.api('GET', '/api/auth/me', { token: student.token });
    // The reused code CS101 inherits neither the selection nor the correction.
    expect(me.body.profile).toMatchObject({ semesterId: second.id, selectedCourseIds: [], courseOverrides: [] });
    const courses = await h.api('GET', '/api/timetable/courses');
    expect(courses.body.map((course: any) => course.id).sort()).toEqual(['CS101', 'CS201']);
    expect(courses.body.find((c: any) => c.id === 'CS101').meetings[0].room).toBe('N305');

    // Nothing of the old semester was deleted.
    expect(await h.sql('select 1 from course_offerings where semester_id = $1', [first])).toHaveLength(3);
    expect(await h.sql('select 1 from user_courses where semester_id = $1', [first])).toHaveLength(2);
    expect(await h.sql('select 1 from user_course_overrides where semester_id = $1', [first])).toHaveLength(1);
    const all = await h.api('GET', '/api/admin/semesters', { token: admin.token });
    expect(all.body.find((s: any) => s.id === first).status).toBe('archived');
  });

  it('refuses a selection written by a tab still on the old semester', async () => {
    const stale = await h.api('PUT', '/api/auth/courses', {
      token: student.token, body: { offeringIds: ['CS103'], context: contextOf(), semesterId: first },
    });
    expect(stale.status).toBe(409);
    const fresh = await h.api('PUT', '/api/auth/courses', {
      token: student.token, body: { offeringIds: ['CS201'], context: contextOf(), semesterId: second.id },
    });
    expect(fresh.body).toMatchObject({ selectedCourseIds: ['CS201'], semesterId: second.id });
  });

  it('activation is reversible: going back restores the earlier semester and its student data', async () => {
    const back = await h.api('POST', `/api/admin/semesters/${first}/activate`, { token: admin.token });
    expect(back.status).toBe(200);
    const me = await h.api('GET', '/api/auth/me', { token: student.token });
    expect(me.body.profile.selectedCourseIds.sort()).toEqual(['CS101', 'CS102']);
    expect(me.body.profile.courseOverrides).toHaveLength(1);
    expect((await h.api('POST', `/api/admin/semesters/${first}/activate`, { token: admin.token })).status).toBe(409);
  });
});

describe('uploads', () => {
  it('rejects anything that is not a named .xlsx/.docx zip container', async () => {
    const draft = await h.api('POST', '/api/admin/semesters', { token: admin.token, body: { name: 'Upload Test 2031' } });
    const id = draft.body.id;
    const put = (name: string, raw: Buffer) =>
      h.api('PUT', `/api/admin/semesters/${id}/files/${encodeURIComponent(name)}`, { token: admin.token, raw });

    expect((await put('evil.exe', Buffer.from('PK\x03\x04'))).status).toBe(400);
    expect((await put('../../etc/passwd.xlsx', Buffer.from('PK\x03\x04'))).status).not.toBe(201);
    expect((await put('03_UG_CSE_Jan-May-2031.xlsx', Buffer.from('not a zip'))).status).toBe(400);
    expect((await h.api('POST', `/api/admin/semesters/${id}/import`, { token: admin.token })).status).toBe(400);

    const ok = await put('03_UG_CSE_Jan-May-2031.xlsx', Buffer.from('PK\x03\x04 truncated archive'));
    expect(ok.status).toBe(201);
    expect(ok.body).toMatchObject({ kind: 'workbook', size: 22 });
  });
});
