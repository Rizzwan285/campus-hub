import assert from 'node:assert/strict';
import type { CourseOffering } from '../../src/engine/types';
import type { ChangeRequest, CourseOverride, Notification, ProposalState } from '../src/repositories/courseChanges.repository';
import type { PublicProfile } from '../src/repositories/profile.repository';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { contextOf, startHarness, type Harness } from './helpers/harness';
import { meeting, parsedCourse, publishSemester } from './helpers/fixtures';
import { meetingsFingerprint } from '../../src/engine/courseTimings';
import { config } from '../src/config';
import { deliverDueEmails } from '../src/services/email.service';

type User = { id: string; roll: string; token: string };

let h: Harness;
let admin: User;
let asha: User;   // files requests
let bala: User;   // has the courses before approval
let chitra: User; // has the courses before approval
let dev: User;    // picks the courses up afterwards
let semesterId: number;

const B = [meeting('Monday', '09:00', '09:50'), meeting('Tuesday', '08:00', '08:50'), meeting('Friday', '10:00', '10:50')];
const strip = (list: CourseOverride['meetings']) => list.map((m) => `${m.day} ${m.startTime}-${m.endTime} ${m.room}${m.date ? ` on ${m.date}` : ''}`);

const select = (user: User, codes: string[]) =>
  h.api<{ newNotifications: number }>('PUT', '/api/auth/courses', { token: user.token, body: { offeringIds: codes, context: contextOf(), semesterId } });
const official = async (code: string, branch = 'CSE') => {
  const courses = await h.api<CourseOffering[]>('GET', '/api/timetable/courses');
  const course = courses.body.find((c) => c.id === code && c.branch === branch);
  if (!course) throw new Error(`Missing course ${code} in branch ${branch}`);
  return course.meetings;
};
const inbox = async (user: User) => (await h.api<Notification[]>('GET', '/api/notifications', { token: user.token })).body;
const request = (user: User, courseCode: string, meetings: unknown[], note = 'Announced in class.') =>
  h.api<ChangeRequest>('POST', '/api/course-changes', { token: user.token, body: { courseCode, meetings, note } });
const approve = (id: number, body: Record<string, unknown>) =>
  h.api<{ request: ChangeRequest; notified: number; offeringsUpdated: number; alsoClosed: number }>('POST', `/api/admin/course-changes/${id}/approve`, { token: admin.token, body });
const settle = async () => {
  for (let i = 0; i < 20; i += 1) {
    await deliverDueEmails();
    const pending = await h.sql("select 1 from email_outbox where status = 'pending' and next_attempt_at <= now()");
    if (pending.length === 0) return;
  }
};

beforeAll(async () => {
  h = await startHarness();
  admin = await h.user('142301026', { role: 'admin', name: 'Developer' });
  asha = await h.user('112301001', { name: 'Asha Menon' });
  bala = await h.user('112301002', { name: 'Bala K' });
  chitra = await h.user('112301003', { name: 'Chitra R' });
  dev = await h.user('112301004', { name: 'Dev P' });

  const semester = await publishSemester(h, admin.token, 'Aug-Dec 2026', [
    parsedCourse({ code: 'CS101', name: 'Database Systems' }),
    // The same course listed by another branch, in its own room.
    parsedCourse({ code: 'CS101', name: 'Database Systems', branch: 'DS', assignments: [{ slot: 'B', days: null, room: 'N305' }] }),
    parsedCourse({ code: 'CS102', rawSlot: 'A', assignments: [{ slot: 'A', days: null, room: 'N203' }] }),
    parsedCourse({ code: 'CS103', rawSlot: 'J', assignments: [{ slot: 'J', days: null, room: 'A01-007' }] }),
  ], { activate: true });
  semesterId = semester.id;

  for (const user of [asha, bala, chitra]) await select(user, ['CS101', 'CS102', 'CS103']);
});
afterAll(async () => h.close());
afterEach(() => vi.unstubAllGlobals());

describe('filing a request', () => {
  let id: number;

  it('stores the request with a before/after delta and emails the developer', async () => {
    const moved = [B[0], B[1], meeting('Thursday', '14:00', '15:00', 'A01-118')];
    const filed = await request(asha, 'CS101', moved, 'Prof moved Friday to Thursday 2 pm.');
    expect(filed.status).toBe(201);
    expect(filed.body).toMatchObject({ status: 'pending', changeKind: 'modification', semesterId, approvalMode: null });
    id = filed.body.id;
    await settle();

    const [mail] = await h.sql('select * from email_outbox where request_id = $1', [id]);
    expect(mail).toMatchObject({ status: 'sent', to_address: 'developer@example.test', attempts: 1 });
    expect(mail.subject).toContain('CS101');
    for (const expected of [
      'Asha Menon (112301001)', 'CS101 — Database Systems', 'Aug-Dec 2026', 'Modification',
      'Friday 10:00–10:50', 'Thursday 14:00–15:00, A01-118', 'Prof moved Friday to Thursday 2 pm.',
      `https://campus.example.test/admin?request=${id}`, 'does not approve anything',
    ]) {
      expect(mail.body_text).toContain(expected);
    }
  });

  it('does not email twice for the same content, but does for an edited request', async () => {
    const moved = [B[0], B[1], meeting('Thursday', '14:00', '15:00', 'A01-118')];
    await request(asha, 'CS101', moved, 'Prof moved Friday to Thursday 2 pm.');
    expect(await h.sql('select 1 from email_outbox where request_id = $1', [id])).toHaveLength(1);
    await request(asha, 'CS101', moved, 'Corrected: it is from next week.');
    expect(await h.sql('select 1 from email_outbox where request_id = $1', [id])).toHaveLength(2);
    // Still one open request for the course, not three.
    expect(await h.sql("select 1 from course_change_requests where status = 'pending'")).toHaveLength(1);
    await settle();
  });

  it('keeps the request when the mail provider is down, and delivers on retry', async () => {
    const original = { ...config };
    Object.assign(config, { EMAIL_PROVIDER: 'resend', EMAIL_API_KEY: 'key', EMAIL_FROM: 'Campus <a@example.test>' });
    const realFetch = globalThis.fetch;
    let providerUp = false;
    const calls: unknown[] = [];
    const providerFetch: typeof fetch = (url, init) => {
      if (!String(url).includes('api.resend.com')) return realFetch(url, init);
      if (typeof init?.body !== 'string') throw new Error('Expected a JSON email body');
      calls.push(JSON.parse(init.body));
      return Promise.resolve(new Response(providerUp ? '{"id":"1"}' : 'down', { status: providerUp ? 200 : 503 }));
    };
    vi.stubGlobal('fetch', providerFetch);
    try {
      const filed = await request(bala, 'CS102', [meeting('Monday', '08:00', '08:50', 'N203'), meeting('Friday', '09:00', '09:50', 'N203')], 'Wednesday class cancelled.');
      expect(filed.status).toBe(201);
      // The route starts a delivery in the background; wait for its attempt.
      await vi.waitFor(async () => {
        await deliverDueEmails();
        const [row] = await h.sql('select attempts from email_outbox where request_id = $1', [filed.body.id]);
        expect(row.attempts).toBeGreaterThan(0);
      });
      const [failed] = await h.sql('select status, attempts, last_error from email_outbox where request_id = $1', [filed.body.id]);
      expect(failed).toMatchObject({ status: 'pending', attempts: 1 });
      expect(failed.last_error).toContain('503');
      // The request itself is safe and reviewable.
      const waiting = await h.api<ChangeRequest[]>('GET', '/api/admin/course-changes?status=pending', { token: admin.token });
      expect(waiting.body.find((r) => r.id === filed.body.id)).toMatchObject({ emailStatus: 'pending', changeKind: 'deletion' });

      providerUp = true;
      const retried = await h.api('POST', '/api/admin/emails/retry', { token: admin.token, body: {} });
      expect(retried.body).toMatchObject({ sent: 1 });
      expect(calls.at(-1)).toMatchObject({ to: ['developer@example.test'], from: 'Campus <a@example.test>' });
      const [sent] = await h.sql('select status from email_outbox where request_id = $1', [filed.body.id]);
      expect(sent.status).toBe('sent');
    } finally {
      Object.assign(config, original);
    }
  });

  it('cannot be approved by a student, anonymously, or by opening a link', async () => {
    expect((await h.api<{ request: ChangeRequest; notified: number; offeringsUpdated: number; alsoClosed: number }>('POST', `/api/admin/course-changes/${id}/approve`, { token: asha.token, body: { mode: 'compulsory' } })).status).toBe(403);
    expect((await h.api<{ request: ChangeRequest; notified: number; offeringsUpdated: number; alsoClosed: number }>('POST', `/api/admin/course-changes/${id}/approve`, { body: { mode: 'compulsory' } })).status).toBe(401);
    expect((await h.api('GET', `/api/admin/course-changes/${id}/approve`, { token: admin.token })).status).toBe(404);
    expect(strip(await official('CS101'))).toEqual(strip(B));
  });
});

describe('approve — students can choose (optional)', () => {
  let id: number;
  let balaNote: Notification;

  it('refuses an approval made against timings that have since moved', async () => {
    const pending = await h.api<ChangeRequest[]>('GET', '/api/admin/course-changes?status=pending', { token: admin.token });
    const pendingRequest = pending.body.find((r) => r.courseCode === 'CS101');
    assert.ok(pendingRequest);
    id = pendingRequest.id;
    const stale = await approve(id, { mode: 'optional', expectedFingerprint: 'not-the-current-one' });
    expect(stale.status).toBe(409);
    expect((await h.sql('select status from course_change_requests where id = $1', [id]))[0].status).toBe('pending');
  });

  it('leaves the official timetable alone and offers the change to students who have the course', async () => {
    const approved = await approve(id, {
      mode: 'optional', note: 'Looks right.', expectedFingerprint: meetingsFingerprint(await official('CS101')),
    });
    expect(approved.status).toBe(200);
    expect(approved.body.request).toMatchObject({ status: 'approved', approvalMode: 'optional', proposalState: 'open', corrected: false });
    expect(approved.body.notified).toBe(2); // Bala and Chitra; Asha asked for it
    expect(approved.body.offeringsUpdated).toBe(0);
    expect(strip(await official('CS101'))).toEqual(strip(B));
    expect(strip(await official('CS101', 'DS'))).toEqual(strip(B).map((line) => line.replace('A01-212', 'N305')));

    [balaNote] = await inbox(bala);
    expect(balaNote).toMatchObject({
      kind: 'optional_change', courseCode: 'CS101', courseName: 'Database Systems', semesterName: 'Aug-Dec 2026',
      changeKind: 'modification', approvalMode: 'optional', reportedBy: 'Asha Menon', mine: false,
      explanation: 'Corrected: it is from next week.', alert: true, alertSeen: false, read: false,
      response: null, courseSelected: true, proposalState: 'open',
    });
    assert.ok(balaNote.delta);
    expect(strip(balaNote.delta.remove)).toEqual(['Friday 10:00-10:50 A01-212']);
    expect(strip(balaNote.delta.add)).toEqual(['Thursday 14:00-15:00 A01-118']);
    // The reporter's roll number is never shown to classmates.
    expect(JSON.stringify(balaNote)).not.toContain(asha.roll);

    const [ashaNote] = await inbox(asha);
    expect(ashaNote).toMatchObject({ kind: 'request_decision', mine: true, alert: false, decisionNote: 'Looks right.' });
    expect(await inbox(dev)).toEqual([]);
  });

  it('cannot be decided a second time', async () => {
    expect((await approve(id, { mode: 'compulsory' })).status).toBe(409);
    expect((await h.api('POST', `/api/admin/course-changes/${id}/reject`, { token: admin.token, body: {} })).status).toBe(409);
    expect(await h.sql('select 1 from user_notifications where request_id = $1', [id])).toHaveLength(3);
  });

  it('accepting changes only that course in that student\'s timetable, once', async () => {
    // Bala already has his own timings for another course.
    await h.api('PUT', '/api/auth/course-overrides', {
      token: bala.token,
      body: { overrides: [{ courseCode: 'CS103', meetings: [meeting('Saturday', '09:00', '10:00')], baseFingerprint: 'x', savedAt: new Date().toISOString() }] },
    });
    const result = [B[0], B[1], meeting('Thursday', '14:00', '15:00', 'A01-118')];
    const body = { response: 'accepted', override: { meetings: result, baseFingerprint: meetingsFingerprint(B) } };
    const accepted = await h.api<{ notification: Notification; courseOverrides: CourseOverride[] }>('POST', `/api/notifications/${balaNote.id}/respond`, { token: bala.token, body });
    expect(accepted.status).toBe(200);
    expect(accepted.body.notification).toMatchObject({ response: 'accepted', read: true, alertSeen: true });
    expect(accepted.body.courseOverrides.map((o) => o.courseCode)).toEqual(['CS101', 'CS103']);

    const again = await h.api<{ notification: Notification; courseOverrides: CourseOverride[] }>('POST', `/api/notifications/${balaNote.id}/respond`, { token: bala.token, body });
    expect(again.status).toBe(200);
    expect(again.body.notification.respondedAt).toBe(accepted.body.notification.respondedAt);
    expect(await h.sql('select 1 from user_course_overrides where user_id = $1', [bala.id])).toHaveLength(2);

    // Signing in on another device brings both back; the official list is unchanged.
    const me = await h.api<{ profile: PublicProfile }>('GET', '/api/auth/me', { token: bala.token });
    const override = me.body.profile.courseOverrides.find((o) => o.courseCode === 'CS101');
    assert.ok(override);
    expect(strip(override.meetings)).toContain('Thursday 14:00-15:00 A01-118');
    expect(strip(await official('CS101'))).toEqual(strip(B));
  });

  it('declining is remembered, changes nothing, and can be reversed from the inbox later', async () => {
    const [note] = await inbox(chitra);
    const declined = await h.api<{ notification: Notification; courseOverrides: CourseOverride[] }>('POST', `/api/notifications/${note.id}/respond`, { token: chitra.token, body: { response: 'rejected' } });
    expect(declined.body.notification).toMatchObject({ response: 'rejected', alertSeen: true });
    expect(await h.sql('select 1 from user_course_overrides where user_id = $1', [chitra.id])).toHaveLength(0);
    expect((await inbox(chitra))[0]).toMatchObject({ response: 'rejected', alertSeen: true });

    // Someone else's entry is not hers to answer.
    expect((await h.api('POST', `/api/notifications/${balaNote.id}/respond`, { token: chitra.token, body: { response: 'accepted' } })).status).toBe(404);
  });

  it('gives a student who adds the courses later inbox entries only — no alerts, no auto-apply', async () => {
    // Two more approved changes exist by now: one optional, one compulsory.
    const pending = await h.api<ChangeRequest[]>('GET', '/api/admin/course-changes?status=pending', { token: admin.token });
    const cs102 = pending.body.find((r) => r.courseCode === 'CS102');
    assert.ok(cs102);
    expect((await approve(cs102.id, { mode: 'optional' })).status).toBe(200);
    const extra = await request(asha, 'CS103', [
      meeting('Monday', '15:30', '16:45', 'A01-007'), meeting('Friday', '14:00', '15:15', 'A01-007'),
      meeting('Wednesday', '17:00', '18:00', 'A01-007'),
    ], 'Extra tutorial every Wednesday.');
    expect((await approve(extra.body.id, { mode: 'compulsory' })).status).toBe(200);

    const picked = await select(dev, ['CS101', 'CS102', 'CS103']);
    expect(picked.body.newNotifications).toBe(3);
    const entries = await inbox(dev);
    expect(entries.map((n) => `${n.courseCode}:${n.kind}:${n.alert}`).sort()).toEqual([
      'CS101:optional_change:false', 'CS102:optional_change:false', 'CS103:official_change:false',
    ]);
    expect(entries.every((n) => n.response === null && !n.read)).toBe(true);
    // The compulsory change is simply part of the timetable he loads.
    expect(strip(await official('CS103'))).toContain('Wednesday 17:00-18:00 A01-007');
    expect(await h.sql('select 1 from user_course_overrides where user_id = $1', [dev.id])).toHaveLength(0);

    // Syncing the same selection again creates nothing new.
    expect((await select(dev, ['CS101', 'CS102', 'CS103'])).body.newNotifications).toBe(0);
    expect(await inbox(dev)).toHaveLength(3);
  });

  it('stops prompting about a course the student has dropped, and tracks read state', async () => {
    await select(dev, ['CS101', 'CS103']);
    const entries = await inbox(dev);
    expect(entries.find((n) => n.courseCode === 'CS102')?.courseSelected).toBe(false);
    expect(entries.find((n) => n.courseCode === 'CS101')?.courseSelected).toBe(true);

    const marked = await h.api<{ updated: number }>('POST', '/api/notifications/mark', { token: dev.token, body: { ids: 'all', read: true } });
    expect(marked.body.updated).toBe(3);
    expect((await inbox(dev)).every((n) => n.read)).toBe(true);
    // Reading is not answering.
    expect((await inbox(dev)).every((n) => n.response === null)).toBe(true);
    // Another student's entries are untouched.
    expect((await inbox(chitra)).some((n) => !n.read)).toBe(true);
  });
});

describe('approve — apply to everyone (compulsory)', () => {
  it('changes only the affected class, in every offering, and keeps each branch\'s own rooms', async () => {
    const filed = await request(chitra, 'CS101', [B[0], B[2]], 'Tuesday 8 am is cancelled for the semester.');
    expect(filed.body.changeKind).toBe('deletion');
    const approved = await approve(filed.body.id, { mode: 'compulsory' });
    expect(approved.status).toBe(200);
    expect(approved.body).toMatchObject({ offeringsUpdated: 2 });
    expect(approved.body.request).toMatchObject({ approvalMode: 'compulsory', proposalState: null });

    expect(strip(await official('CS101'))).toEqual(['Monday 09:00-09:50 A01-212', 'Friday 10:00-10:50 A01-212']);
    expect(strip(await official('CS101', 'DS'))).toEqual(['Monday 09:00-09:50 N305', 'Friday 10:00-10:50 N305']);

    // Everyone with the course is told, as information — nothing to decide.
    const note = (await inbox(bala)).find((n) => n.requestId === filed.body.id);
    assert.ok(note);
    expect(note).toMatchObject({ kind: 'official_change', approvalMode: 'compulsory', alert: true, reportedBy: 'Chitra R' });
    expect((await h.api('POST', `/api/notifications/${note.id}/respond`, { token: bala.token, body: { response: 'rejected' } })).status).toBe(404);
    expect((await inbox(dev)).find((n) => n.requestId === filed.body.id)).toMatchObject({ kind: 'official_change', alert: true });
  });

  it('reaches a student who selects the course afterwards, through the timetable itself', async () => {
    const late = await h.user('112301009', { name: 'Late Joiner' });
    await h.api<{ newNotifications: number }>('PUT', '/api/auth/courses', { token: late.token, body: { offeringIds: ['CS101'], context: contextOf(), semesterId } });
    expect(strip(await official('CS101'))).not.toContain('Tuesday 08:00-08:50 A01-212');
    const entries = await inbox(late);
    expect(entries.filter((n) => n.kind === 'official_change').every((n) => n.alert === false)).toBe(true);
  });

  it('is written into the semester draft, so publishing again does not undo it', async () => {
    const published = await h.api('POST', `/api/admin/semesters/${semesterId}/publish`, { token: admin.token, body: {} });
    expect(published.status).toBe(200);
    expect(strip(await official('CS101'))).toEqual(['Monday 09:00-09:50 A01-212', 'Friday 10:00-10:50 A01-212']);
    expect(strip(await official('CS103'))).toContain('Wednesday 17:00-18:00 A01-007');
  });

  it('keeps an optional proposal open while it still applies, then settles it when made official', async () => {
    // Asha's Friday -> Thursday proposal still fits: Friday is still there.
    const [open] = await h.sql("select id, proposal_state from course_change_requests where course_code = 'CS101' and approval_mode = 'optional'");
    expect(open.proposal_state).toBe('open');

    // Bala asks for the very same move; the developer makes it official.
    const same = await request(bala, 'CS101', [B[0], meeting('Thursday', '14:00', '15:00', 'A01-118')], 'Confirmed by the professor.');
    expect((await approve(same.body.id, { mode: 'compulsory' })).status).toBe(200);
    const [settled] = await h.sql('select proposal_state, proposal_state_note from course_change_requests where id = $1', [open.id]);
    expect(settled.proposal_state).toBe('official');

    // Chitra had declined the optional version; she can no longer flip it, and is told why.
    const mine = (await inbox(chitra)).find((n) => n.requestId === open.id);
    assert.ok(mine);
    expect(mine).toMatchObject({ proposalState: 'official' });
    const late = await h.api<{ state: ProposalState }>('POST', `/api/notifications/${mine.id}/respond`, {
      token: chitra.token, body: { response: 'accepted', override: { meetings: [B[0]], baseFingerprint: 'x' } },
    });
    expect(late.status).toBe(409);
    expect(late.body.state).toBe('official');
    expect(await h.sql('select 1 from user_course_overrides where user_id = $1', [chitra.id])).toHaveLength(0);
  });

  it('marks an optional proposal outdated when the class it moves no longer exists', async () => {
    const [proposal] = await h.sql("select id from course_change_requests where course_code = 'CS102' and approval_mode = 'optional'");
    // CS102's proposal drops Wednesday. An official change now moves Wednesday instead.
    const moved = await request(asha, 'CS102', [
      meeting('Monday', '08:00', '08:50', 'N203'), meeting('Thursday', '11:00', '11:50', 'N203'), meeting('Friday', '09:00', '09:50', 'N203'),
    ], 'Wednesday moves to Thursday.');
    expect((await approve(moved.body.id, { mode: 'compulsory' })).status).toBe(200);
    const [after] = await h.sql('select proposal_state from course_change_requests where id = $1', [proposal.id]);
    expect(after.proposal_state).toBe('outdated');

    const mine = (await inbox(chitra)).find((n) => n.requestId === proposal.id);
    assert.ok(mine);
    const refused = await h.api<{ state: ProposalState }>('POST', `/api/notifications/${mine.id}/respond`, {
      token: chitra.token, body: { response: 'accepted', override: { meetings: [B[0]], baseFingerprint: 'x' } },
    });
    expect(refused.status).toBe(409);
    expect(refused.body.state).toBe('outdated');
  });

  it('closes other open requests for the course: duplicates approved, the rest superseded', async () => {
    const base = await official('CS103');
    const plusSat = [...base, meeting('Saturday', '10:00', '11:00', 'A01-007')];
    const a = await request(asha, 'CS103', plusSat, 'Saturday class.');
    const b = await request(bala, 'CS103', plusSat, 'Saturday class, same thing.');
    const c = await request(chitra, 'CS103', base.slice(1), 'Monday is cancelled.');
    const approved = await approve(a.body.id, { mode: 'compulsory' });
    expect(approved.body.alsoClosed).toBe(2);
    const rows = await h.sql('select id, status, approval_mode from course_change_requests where id = any($1::bigint[]) order by id', [[b.body.id, c.body.id]]);
    expect(rows.map((r) => `${r.status}:${r.approval_mode}`)).toEqual(['approved:compulsory', 'superseded:null']);
  });

  it('supports a one-time extra lecture on a date, and a correction by the developer', async () => {
    const base = await official('CS103');
    const filed = await request(asha, 'CS103', [
      ...base, { ...meeting('Monday', '18:00', '19:00', 'A01-007'), recurrence: { type: 'once' }, date: '2026-11-21' },
    ], 'Extra class before the exam.');
    expect(filed.status).toBe(201);
    expect(filed.body.changeKind).toBe('addition');
    // The developer fixes the room before approving.
    const corrected = [
      ...base, { ...meeting('Saturday', '18:00', '19:00', 'A01-001'), recurrence: { type: 'once' }, date: '2026-11-21' },
    ];
    const approved = await approve(filed.body.id, { mode: 'compulsory', meetings: corrected });
    expect(approved.body.request.corrected).toBe(true);
    const extra = (await official('CS103')).find((m) => m.date);
    // The weekday comes from the date, not from what was typed.
    expect(extra).toMatchObject({ day: 'Saturday', date: '2026-11-21', room: 'A01-001', recurrence: { type: 'once' } });
    expect((await inbox(bala)).find((n) => n.requestId === filed.body.id)).toMatchObject({ corrected: true, changeKind: 'addition' });

    expect((await request(asha, 'CS103', [...base, { ...meeting('Monday', '18:00', '19:00'), recurrence: { type: 'once' }, date: '2026-02-30' }])).status).toBe(400);
  });

  it('refuses to approve something that is already the official timetable', async () => {
    const base = await official('CS102');
    const filed = await request(bala, 'CS102', base.slice(1), 'Drop Monday.');
    const noop = await approve(filed.body.id, { mode: 'compulsory', meetings: base });
    expect(noop.status).toBe(409);
    expect(strip(await official('CS102'))).toEqual(strip(base));
  });
});

describe('rejecting', () => {
  it('changes no timetable, records the reason, and tells the requester', async () => {
    const before = await official('CS102');
    const pending = await h.api<ChangeRequest[]>('GET', '/api/admin/course-changes?status=pending', { token: admin.token });
    const target = pending.body.find((r) => r.courseCode === 'CS102' && r.requesterRoll === bala.roll);
    assert.ok(target);
    const rejected = await h.api('POST', `/api/admin/course-changes/${target.id}/reject`, {
      token: admin.token, body: { note: 'The professor says Monday stays.' },
    });
    expect(rejected.status).toBe(200);
    expect(strip(await official('CS102'))).toEqual(strip(before));

    const mine = await h.api<ChangeRequest[]>('GET', '/api/course-changes/mine', { token: bala.token });
    expect(mine.body.find((r) => r.id === target.id)).toMatchObject({ status: 'rejected', decisionNote: 'The professor says Monday stays.' });
    const note = (await inbox(bala)).find((n) => n.requestId === target.id);
    expect(note).toMatchObject({ kind: 'request_decision', requestStatus: 'rejected', decisionNote: 'The professor says Monday stays.', mine: true });
    // Nobody else hears about a rejected request.
    expect((await inbox(chitra)).some((n) => n.requestId === target.id)).toBe(false);

    const history = await h.api<ChangeRequest[]>('GET', '/api/admin/course-changes?status=decided', { token: admin.token });
    expect(history.body.find((r) => r.id === target.id)).toMatchObject({ status: 'rejected', decidedByRoll: admin.roll });
    const audit = await h.sql("select action from audit_log where action like 'course.change.%'");
    expect(new Set(audit.map((row) => row.action))).toEqual(new Set([
      'course.change.approve', 'course.change.approve-optional', 'course.change.reject',
    ]));
  });

  it('closes requests left pending when the semester ends', async () => {
    await request(dev, 'CS101', [meeting('Monday', '09:00', '09:50')], 'Left over.');
    const next = await publishSemester(h, admin.token, 'Jan-May 2027', [parsedCourse({ code: 'CS101' })], { activate: true });
    expect(next.id).toBeGreaterThan(semesterId);
    const left = await h.sql("select status from course_change_requests where semester_id = $1 and status = 'pending'", [semesterId]);
    expect(left).toHaveLength(0);
    // The new semester's CS101 starts from its own timings, with no inherited inbox.
    const fresh = await h.user('112301010');
    await h.api<{ newNotifications: number }>('PUT', '/api/auth/courses', { token: fresh.token, body: { offeringIds: ['CS101'], context: contextOf(), semesterId: next.id } });
    expect(await inbox(fresh)).toEqual([]);
    expect(strip(await official('CS101'))).toEqual(strip(B));
  });
});
