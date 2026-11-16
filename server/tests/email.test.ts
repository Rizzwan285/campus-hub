import type { CourseOffering } from '../../src/engine/types';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi, type MockInstance } from 'vitest';
import { startHarness, type Harness } from './helpers/harness';
import { meeting, parsedCourse, publishSemester } from './helpers/fixtures';
import { config, describeEnvProblems, envSchema } from '../src/config';
import { AppsScriptError, REASONS, sendViaAppsScript } from '../src/services/appsScript';
import {
  REVIEW_BUTTON_LABEL, SUBJECT_LIMIT, TEXT_LIMIT, renderChangeRequestEmail, renderTestEmail, requestLink,
  type ChangeRequestEmailInput,
} from '../src/services/emailTemplate';
import { deliverDueEmails, emailStatus, type TestEmailResult } from '../src/services/email.service';

/**
 * Email: the Apps Script relay, the template every provider sends, the test
 * button and the startup checks. All HTTP to providers is faked here; nothing
 * leaves the machine.
 */

const SECRET = 'test-apps-script-secret-0123456789abcdef';
const EXEC = 'https://script.google.com/macros/s/TEST-DEPLOYMENT-ID/exec';
const ECHO = 'https://script.googleusercontent.com/macros/echo?user_content_key=one-time&lib=test';
const APPS_SCRIPT = { EMAIL_PROVIDER: 'apps_script', APPS_SCRIPT_URL: EXEC, APPS_SCRIPT_SECRET: SECRET } as const;

const email = { subject: 'Subject line', text: 'Plain text body', html: '<p>HTML body</p>' };

interface Call { method: string; url: string; body: string | null }

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8' } });

/**
 * Behaves like a deployed web app: POST /exec runs the script and answers 302
 * to a one-time URL; a GET there returns whatever `reply` gives. Everything
 * else (the test's own calls to the API) goes to the real fetch.
 */
function fakeGoogle(
  reply: (call: Call, signal?: AbortSignal | null) => Response | Promise<Response>,
  options: { redirectTo?: string | null } = {},
) {
  const calls: Call[] = [];
  const realFetch = globalThis.fetch;
  const fake: typeof fetch = async (input, init) => {
    const url = input instanceof Request ? input.url : String(input);
    if (!/(google\.com|googleusercontent\.com|example\.org)/.test(new URL(url).hostname)) return realFetch(input, init);
    const call = { method: init?.method ?? 'GET', url, body: typeof init?.body === 'string' ? init.body : null };
    calls.push(call);
    if (url === EXEC && options.redirectTo !== null) {
      return new Response(null, { status: 302, headers: { location: options.redirectTo ?? ECHO } });
    }
    return reply(call, init?.signal);
  };
  vi.stubGlobal('fetch', fake);
  return calls;
}

/** Every argument ever passed to console.*, as one string. */
function captureConsole() {
  const spies: MockInstance[] = (['log', 'info', 'warn', 'error', 'debug'] as const).map((level) =>
    vi.spyOn(console, level).mockImplementation(() => undefined));
  return () => spies.flatMap((spy) => spy.mock.calls.flat().map((arg) =>
    arg instanceof Error ? `${arg.message} ${arg.stack}` : typeof arg === 'string' ? arg : JSON.stringify(arg))).join('\n');
}

const failure = async (promise: Promise<unknown>) => {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(AppsScriptError);
    return error as AppsScriptError;
  }
  throw new Error('Expected the send to fail');
};

let h: Harness;
let admin: { token: string };
let student: { token: string };
const original = { ...config };

beforeAll(async () => {
  h = await startHarness();
  admin = await h.user('142301026', { role: 'admin', name: 'Developer' });
  student = await h.user('112301001', { name: 'Asha <Menon>' });
  await publishSemester(h, admin.token, 'Aug-Dec 2026', [parsedCourse({ code: 'CS101', name: 'Database Systems' })], { activate: true });
});
afterAll(async () => h.close());
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  Object.assign(config, original);
});

const testEmail = () => h.api<TestEmailResult>('POST', '/api/admin/emails/test', { token: admin.token, body: {} });

// ---------------------------------------------------------------- provider

describe('apps_script provider', () => {
  const options = { url: EXEC, secret: SECRET };

  it('posts {token, subject, text, html}, follows the redirect with a bodiless GET and reads success from the reply', async () => {
    const calls = fakeGoogle(() => json({ success: true, message: 'Email sent successfully.' }));
    await sendViaAppsScript(email, options);

    expect(calls).toHaveLength(2);
    expect(calls[0]).toMatchObject({ method: 'POST', url: EXEC });
    expect(JSON.parse(calls[0].body!)).toEqual({ token: SECRET, subject: email.subject, text: email.text, html: email.html });
    // The script already ran on the POST; collecting the reply must not send the secret again.
    expect(calls[1]).toEqual({ method: 'GET', url: ECHO, body: null });
  });

  it('accepts a reply given without a redirect', async () => {
    const calls = fakeGoogle(() => json({ success: true, message: 'ok' }), { redirectTo: null });
    await sendViaAppsScript(email, options);
    expect(calls).toHaveLength(1);
  });

  it('fails on a wrong secret, although Apps Script answers HTTP 200', async () => {
    fakeGoogle(() => json({ success: false, message: 'Unauthorized request.' }));
    const error = await failure(sendViaAppsScript(email, options));
    expect(error.reason).toBe('wrong-secret');
    expect(error.message).toBe(REASONS.wrongSecret);
    expect(error.message).not.toContain(SECRET);
  });

  it('fails on any other failure reported with HTTP 200, quoting the script', async () => {
    fakeGoogle(() => json({ success: false, message: 'Email subject and body are required.' }));
    const error = await failure(sendViaAppsScript(email, options));
    expect(error.reason).toBe('rejected');
    expect(error.message).toContain('Email subject and body are required.');
  });

  it('explains the daily Gmail quota', async () => {
    fakeGoogle(() => json({ success: false, message: 'Service invoked too many times for one day: email.' }));
    const error = await failure(sendViaAppsScript(email, options));
    expect(error.reason).toBe('quota');
    expect(error.message).toMatch(/daily sending limit.*retried automatically/);
  });

  it('explains missing script properties', async () => {
    fakeGoogle(() => json({ success: false, message: 'Email service is not configured.' }));
    expect((await failure(sendViaAppsScript(email, options))).reason).toBe('script-not-configured');
  });

  it('treats an HTML page instead of the reply as a failure', async () => {
    fakeGoogle(() => new Response(
      '<!DOCTYPE html><html><head><title>Error</title></head><body>Script function not found: doPost</body></html>',
      { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } },
    ));
    const error = await failure(sendViaAppsScript(email, options));
    expect(error.reason).toBe('html-reply');
    expect(error.message).toContain('"Error"');
    expect(error.message).toContain('/exec');
  });

  it('recognises a Google sign-in page, by redirect or by content', async () => {
    fakeGoogle(() => json({ success: true }), { redirectTo: 'https://accounts.google.com/ServiceLogin?continue=x' });
    expect((await failure(sendViaAppsScript(email, options))).reason).toBe('sign-in');

    vi.unstubAllGlobals();
    fakeGoogle(() => new Response('<html><head><title>Sign in - Google Accounts</title></head></html>', {
      status: 200, headers: { 'content-type': 'text/html' },
    }));
    const error = await failure(sendViaAppsScript(email, options));
    expect(error.reason).toBe('sign-in');
    expect(error.message).toContain('"Anyone"');
  });

  it('times out instead of hanging, and warns that a retry may duplicate', async () => {
    fakeGoogle((_call, signal) => new Promise<Response>((_resolve, reject) => {
      signal?.addEventListener('abort', () => reject(new DOMException('This operation was aborted', 'AbortError')));
    }));
    const started = Date.now();
    const error = await failure(sendViaAppsScript(email, { ...options, timeoutMs: 80 }));
    expect(Date.now() - started).toBeLessThan(2_000);
    expect(error.reason).toBe('timeout');
    expect(error.message).toMatch(/did not answer.*retry can deliver it twice/);
  });

  it('defaults to a generous timeout', async () => {
    const { APPS_SCRIPT_TIMEOUT_MS } = await import('../src/services/appsScript');
    expect(APPS_SCRIPT_TIMEOUT_MS).toBeGreaterThanOrEqual(30_000);
  });

  it('rejects a reply that is not the script\'s JSON, and a redirect away from Google', async () => {
    fakeGoogle(() => json({ ok: true }));
    expect((await failure(sendViaAppsScript(email, options))).reason).toBe('unexpected-reply');

    vi.unstubAllGlobals();
    fakeGoogle(() => new Response('Not Found', { status: 404, headers: { 'content-type': 'text/plain' } }));
    expect((await failure(sendViaAppsScript(email, options))).reason).toBe('http-status');

    vi.unstubAllGlobals();
    const calls = fakeGoogle(() => json({ success: true }), { redirectTo: 'https://evil.example.org/collect' });
    expect((await failure(sendViaAppsScript(email, options))).reason).toBe('redirect');
    expect(calls).toHaveLength(1);
  });

  it('refuses content over the script\'s limits without calling it', async () => {
    const calls = fakeGoogle(() => json({ success: true }));
    const error = await failure(sendViaAppsScript({ ...email, subject: 'x'.repeat(SUBJECT_LIMIT + 1) }, options));
    expect(error.reason).toBe('too-long');
    expect(calls).toHaveLength(0);
  });
});

// ---------------------------------------------------------------- through the outbox

describe('apps_script through the outbox and the test button', () => {
  it('sends a test email and reports it in plain words', async () => {
    Object.assign(config, APPS_SCRIPT);
    const calls = fakeGoogle(() => json({ success: true, message: 'Email sent successfully.' }));

    const result = await testEmail();
    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({ status: 'sent', error: null });
    expect(result.body.message).toMatch(/^Sent\. Check the inbox of the script's ADMIN_EMAIL address/);

    const payload = JSON.parse(calls[0].body!);
    expect(payload.subject).toBe('Campus Companion: test email');
    expect(payload.text).toContain('Provider: apps_script');
    expect(payload.text).toContain('https://campus.example.test/admin?tab=requests');
    const [row] = await h.sql('select kind, status, attempts, to_address from email_outbox where id = $1', [result.body.id]);
    expect(row).toMatchObject({ kind: 'test', status: 'sent', attempts: 1, to_address: 'developer@example.test' });
  });

  it('keeps a failure queued with a plain reason, retries it, and never exposes the secret', async () => {
    Object.assign(config, APPS_SCRIPT);
    const output = captureConsole();
    let secretAccepted = false;
    // The script echoing the token back is the worst case: it must still be scrubbed.
    fakeGoogle((call) => call.method === 'GET' && secretAccepted
      ? json({ success: true, message: 'Email sent successfully.' })
      : json({ success: false, message: 'Unauthorized request.' }));

    const result = await testEmail();
    expect(result.body).toMatchObject({ status: 'pending' });
    expect(result.body.message).toBe(`Not sent. ${REASONS.wrongSecret}`);

    const [row] = await h.sql<{ status: string; attempts: number; last_error: string; due_later: boolean }>(
      `select status, attempts, last_error, next_attempt_at > now() as due_later from email_outbox where id = $1`,
      [result.body.id],
    );
    expect(row).toMatchObject({ status: 'pending', attempts: 1, last_error: REASONS.wrongSecret, due_later: true });

    const status = await h.api<{ outbox: Array<{ id: number; lastError: string | null }> }>('GET', '/api/admin/emails', { token: admin.token });
    expect(status.body.outbox.find((entry) => entry.id === result.body.id)?.lastError).toBe(REASONS.wrongSecret);
    for (const text of [JSON.stringify(status.body), JSON.stringify(result.body), JSON.stringify(emailStatus()), output()]) {
      expect(text).not.toContain(SECRET);
      expect(text).not.toContain('TEST-DEPLOYMENT-ID');
    }

    // Fixed on the script's side: the normal retry delivers it.
    secretAccepted = true;
    const retried = await h.api<{ sent: number }>('POST', '/api/admin/emails/retry', { token: admin.token, body: { id: result.body.id } });
    expect(retried.body.sent).toBe(1);
    const [sent] = await h.sql('select status, last_error from email_outbox where id = $1', [result.body.id]);
    expect(sent).toMatchObject({ status: 'sent', last_error: null });
  });

  it('scrubs the secret even if the script quotes it back', async () => {
    Object.assign(config, APPS_SCRIPT);
    const output = captureConsole();
    fakeGoogle(() => json({ success: false, message: `Unexpected token in JSON: {"token":"${SECRET}"` }));

    const result = await testEmail();
    expect(result.body.message).toContain('[secret]');
    const [row] = await h.sql<{ last_error: string }>('select last_error from email_outbox where id = $1', [result.body.id]);
    expect(row.last_error).toContain('[secret]');
    expect(row.last_error).not.toContain(SECRET);
    expect(output()).not.toContain(SECRET);
  });

  it('records the quota as a plain reason for the normal back-off', async () => {
    Object.assign(config, APPS_SCRIPT);
    captureConsole();
    fakeGoogle(() => json({ success: false, message: 'Service invoked too many times for one day: email.' }));
    const quota = await testEmail();
    expect(quota.body).toMatchObject({ status: 'pending', error: REASONS.quota });
  });

  it('cancels an older undelivered test email so a fix does not release a pile of them', async () => {
    Object.assign(config, APPS_SCRIPT);
    captureConsole();
    fakeGoogle(() => json({ success: false, message: 'Unauthorized request.' }));
    const first = await testEmail();
    vi.unstubAllGlobals();
    fakeGoogle(() => json({ success: true }));
    const second = await testEmail();
    expect(second.body.status).toBe('sent');
    const [old] = await h.sql('select status from email_outbox where id = $1', [first.body.id]);
    expect(old.status).toBe('cancelled');
  });

  it('delivers a student\'s change request with the template, and the link only opens /admin', async () => {
    Object.assign(config, { ...APPS_SCRIPT, APP_URL: 'https://rizwans-campus-hub.vercel.app' });
    const calls = fakeGoogle(() => json({ success: true }));
    const courses = await h.api<CourseOffering[]>('GET', '/api/timetable/courses');
    const official = courses.body.find((course) => course.id === 'CS101')!.meetings;
    const proposed = [...official.slice(0, -1), meeting('Thursday', '14:00', '15:00', 'A01-118')];

    const filed = await h.api<{ id: number; status: string }>('POST', '/api/course-changes', {
      token: student.token,
      body: { courseCode: 'CS101', meetings: proposed, note: 'Moved <b>Friday</b> & "Thursday"' },
    });
    expect(filed.status).toBe(201);
    await vi.waitFor(async () => {
      await deliverDueEmails();
      const [row] = await h.sql('select status from email_outbox where request_id = $1', [filed.body.id]);
      expect(row.status).toBe('sent');
    });

    const payload = JSON.parse(calls.find((call) => call.method === 'POST')!.body!);
    expect(payload.subject).toBe(`Timetable change request #${filed.body.id}: CS101 (modification)`);
    const link = `https://rizwans-campus-hub.vercel.app/admin?request=${filed.body.id}`;
    expect(payload.text).toContain(link);
    expect(payload.html).toContain(`href="${link}"`);
    expect(payload.html).toContain('Moved &lt;b&gt;Friday&lt;/b&gt; &amp; &quot;Thursday&quot;');
    expect(payload.html).toContain('Asha &lt;Menon&gt;');
    expect(payload.html).not.toContain('<b>Friday</b>');

    // Following the email's link is a page visit; the request is still waiting.
    const [request] = await h.sql('select status from course_change_requests where id = $1', [filed.body.id]);
    expect(request.status).toBe('pending');
  });
});

// ---------------------------------------------------------------- other providers

describe('the existing providers', () => {
  it('brevo sends the same template to its API', async () => {
    Object.assign(config, { EMAIL_PROVIDER: 'brevo', EMAIL_API_KEY: 'brevo-key-123', EMAIL_FROM: 'Campus <alerts@example.test>' });
    const sent: Array<{ body: Record<string, unknown> }> = [];
    const realFetch = globalThis.fetch;
    vi.stubGlobal('fetch', ((input, init) => {
      if (!String(input).includes('api.brevo.com')) return realFetch(input, init);
      sent.push({ body: JSON.parse(String(init?.body)) });
      return Promise.resolve(json({ messageId: '1' }, 201));
    }) as typeof fetch);

    const result = await testEmail();
    expect(result.body.status).toBe('sent');
    expect(sent[0].body).toMatchObject({
      sender: { name: 'Campus', email: 'alerts@example.test' },
      to: [{ email: 'developer@example.test' }],
      subject: 'Campus Companion: test email',
    });
    expect(String(sent[0].body.htmlContent)).toContain('Open the admin panel');
  });

  it('resend reports a provider failure and keeps the message queued', async () => {
    Object.assign(config, { EMAIL_PROVIDER: 'resend', EMAIL_API_KEY: 'resend-key-123', EMAIL_FROM: 'Campus <a@example.test>' });
    captureConsole();
    const realFetch = globalThis.fetch;
    vi.stubGlobal('fetch', ((input, init) => String(input).includes('api.resend.com')
      ? Promise.resolve(new Response('down', { status: 503 }))
      : realFetch(input, init)) as typeof fetch);
    const result = await testEmail();
    expect(result.body.status).toBe('pending');
    expect(result.body.message).toContain('resend responded 503');
  });

  it('log prints instead of sending, and none queues nothing', async () => {
    const logged = captureConsole();
    Object.assign(config, { EMAIL_PROVIDER: 'log' });
    const result = await testEmail();
    expect(result.body).toMatchObject({ status: 'sent' });
    expect(result.body.message).toMatch(/^Logged, not sent/);
    expect(logged()).toContain('Campus Companion: test email');

    Object.assign(config, { EMAIL_PROVIDER: 'none' });
    const off = await testEmail();
    expect(off.body).toMatchObject({ status: 'not_configured', id: null });
    expect(off.body.message).toContain('EMAIL_PROVIDER');
  });
});

// ---------------------------------------------------------------- template

describe('email template', () => {
  const current = [meeting('Monday', '09:00', '09:50', 'N305'), meeting('Friday', '10:00', '10:50', 'N305')];
  const proposed = [meeting('Monday', '09:00', '09:50', 'N305'), meeting('Thursday', '14:00', '15:00', 'A01-118')];
  const input: ChangeRequestEmailInput = {
    requestId: 7,
    courseCode: 'CS101',
    courseName: 'Database Systems',
    semesterName: 'Jan-May 2027',
    requesterRoll: '112301001',
    requesterName: 'Asha Menon',
    note: 'Announced in class.',
    kind: 'modification',
    currentMeetings: current,
    proposedMeetings: proposed,
    delta: { remove: [current[1]], add: [proposed[1]] },
  };

  it('shows the student, course, current and proposed timings and the note', () => {
    const { subject, text, html } = renderChangeRequestEmail(input, 'https://campus.example.test');
    expect(subject).toBe('Timetable change request #7: CS101 (modification)');
    for (const expected of [
      'Asha Menon (112301001)', 'CS101 — Database Systems', 'Jan-May 2027', 'Modification',
      'Current timings:', '  • Lecture · Monday 09:00–09:50, N305', '  - Lecture · Friday 10:00–10:50, N305   (removed)',
      'Proposed timings:', '  + Lecture · Thursday 14:00–15:00, A01-118   (new)', 'Announced in class.',
      'does not approve anything',
    ]) {
      expect(text).toContain(expected);
    }
    expect(html).toContain('Lecture · Friday 10:00–10:50, N305</span> <strong>(removed)</strong>');
    expect(html).toContain('Lecture · Thursday 14:00–15:00, A01-118</span> <strong>(new)</strong>');
  });

  it('links the button to the request in /admin, with or without a trailing slash', () => {
    for (const appUrl of ['https://campus.example.test', 'https://campus.example.test/', 'https://campus.example.test//']) {
      const { text, html } = renderChangeRequestEmail(input, appUrl);
      expect(text).toContain(`${REVIEW_BUTTON_LABEL}: https://campus.example.test/admin?request=7`);
      expect(html).toContain('href="https://campus.example.test/admin?request=7"');
    }
    expect(requestLink(undefined, 7)).toBeNull();
    const unlinked = renderChangeRequestEmail(input, null);
    expect(unlinked.text).toContain('Set APP_URL');
    expect(unlinked.html).not.toContain('href=');
  });

  it('escapes everything a student typed', () => {
    const hostile = renderChangeRequestEmail({
      ...input,
      requesterName: '<img src=x onerror=alert(1)>',
      note: '</p><script>alert("x")</script> & \'quoted\'',
      proposedMeetings: [meeting('Thursday', '14:00', '15:00', '<b>A01</b>')],
      delta: { remove: current, add: [meeting('Thursday', '14:00', '15:00', '<b>A01</b>')] },
    }, 'https://campus.example.test');
    expect(hostile.html).not.toMatch(/<script|<img|<b>A01/);
    expect(hostile.html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(hostile.html).toContain('&lt;/p&gt;&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; &#39;quoted&#39;');
    expect(hostile.html).toContain('&lt;b&gt;A01&lt;/b&gt;');
  });

  it('stays inside the Apps Script limits', () => {
    const huge = renderChangeRequestEmail({ ...input, courseCode: 'C'.repeat(400), note: 'n'.repeat(60_000) }, null);
    expect(huge.subject.length).toBeLessThanOrEqual(SUBJECT_LIMIT);
    expect(huge.text.length).toBeLessThanOrEqual(TEXT_LIMIT);
  });

  it('renders the test email with a link to the admin panel', () => {
    const test = renderTestEmail({ provider: 'apps_script', sentAt: '17 Nov 2026, 9:30 am IST' }, 'https://campus.example.test/');
    expect(test.text).toContain('https://campus.example.test/admin?tab=requests');
    expect(test.html).toContain('Open the admin panel');
  });
});

// ---------------------------------------------------------------- startup checks

describe('configuration', () => {
  const base = {
    DATABASE_URL: 'postgres://x', SESSION_SECRET: 's'.repeat(32), EMAIL_PROVIDER: 'apps_script',
    ADMIN_NOTIFY_EMAIL: 'me@example.test', APP_URL: 'https://rizwans-campus-hub.vercel.app/',
    APPS_SCRIPT_URL: EXEC, APPS_SCRIPT_SECRET: SECRET,
  };
  const problems = (env: Record<string, string | undefined>) => {
    const parsed = envSchema.safeParse(env);
    return parsed.success ? [] : describeEnvProblems(parsed.error);
  };

  it('accepts a complete Apps Script setup and drops the trailing slash from APP_URL', () => {
    const parsed = envSchema.parse(base);
    expect(parsed.APP_URL).toBe('https://rizwans-campus-hub.vercel.app');
    expect(parsed.EMAIL_PROVIDER).toBe('apps_script');
  });

  it('refuses to start with a value missing, naming each one', () => {
    const found = problems({ ...base, APPS_SCRIPT_URL: undefined, APPS_SCRIPT_SECRET: '  ', ADMIN_NOTIFY_EMAIL: undefined, APP_URL: undefined });
    expect(found.map((line) => line.split(':')[0]).sort()).toEqual(['ADMIN_NOTIFY_EMAIL', 'APPS_SCRIPT_SECRET', 'APPS_SCRIPT_URL', 'APP_URL']);
  });

  it('requires an https /exec URL and a real secret, without echoing values', () => {
    expect(problems({ ...base, APPS_SCRIPT_URL: 'http://script.google.com/macros/s/x/exec' })).toEqual(['APPS_SCRIPT_URL: must be an https:// URL.']);
    expect(problems({ ...base, APPS_SCRIPT_URL: 'https://script.google.com/macros/s/x/dev' })[0]).toMatch(/ending in \/exec/);
    const short = problems({ ...base, APPS_SCRIPT_SECRET: 'tiny-secret' });
    expect(short).toEqual(['APPS_SCRIPT_SECRET: must be at least 16 characters.']);
    expect(short.join()).not.toContain('tiny-secret');
  });

  it('leaves the other providers as they were', () => {
    expect(problems({ ...base, EMAIL_PROVIDER: 'resend', APPS_SCRIPT_URL: undefined, APPS_SCRIPT_SECRET: undefined, APP_URL: undefined })).toEqual([]);
    expect(problems({ DATABASE_URL: 'postgres://x', SESSION_SECRET: 's'.repeat(32) })).toEqual([]);
  });

  it('keeps the secret and the script URL out of the admin status', () => {
    Object.assign(config, APPS_SCRIPT);
    const status = emailStatus();
    expect(status).toMatchObject({ provider: 'apps_script', configured: true, missing: [] });
    expect(status.recipientNote).toContain('ADMIN_EMAIL');
    expect(JSON.stringify(status)).not.toContain(SECRET);
    expect(JSON.stringify(status)).not.toContain(EXEC);
  });
});
