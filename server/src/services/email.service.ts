import type { PoolClient } from 'pg';
import { config } from '../config';
import { pool, query } from '../db';
import type { ChangeKind, MeetingDelta } from '../../../src/engine/courseTimings';
import type { TimetableMeeting } from '../../../src/engine/types';

/**
 * Emails to the developer, through an outbox.
 *
 * A message is a row in `email_outbox`, written in the same transaction as the
 * request it announces. Delivery happens afterwards and separately, so a mail
 * provider being slow, down or misconfigured can delay a notification but can
 * never lose - or even slow - the request itself. Undelivered rows are retried
 * with a growing delay, and the admin panel can retry them by hand.
 *
 * Sending is plain HTTPS to the provider's API (Resend or Brevo). SMTP is
 * deliberately not used: free hosting tiers block outbound SMTP ports.
 */

const MAX_ATTEMPTS = 8;
const SEND_TIMEOUT_MS = 10_000;

export function emailConfigured(): boolean {
  if (config.EMAIL_PROVIDER === 'none') return false;
  if (!config.ADMIN_NOTIFY_EMAIL) return false;
  if (config.EMAIL_PROVIDER === 'log') return true;
  return Boolean(config.EMAIL_API_KEY && config.EMAIL_FROM);
}

export function emailStatus() {
  const missing: string[] = [];
  if (config.EMAIL_PROVIDER === 'none') missing.push('EMAIL_PROVIDER');
  if (!config.ADMIN_NOTIFY_EMAIL) missing.push('ADMIN_NOTIFY_EMAIL');
  if (config.EMAIL_PROVIDER === 'resend' || config.EMAIL_PROVIDER === 'brevo') {
    if (!config.EMAIL_API_KEY) missing.push('EMAIL_API_KEY');
    if (!config.EMAIL_FROM) missing.push('EMAIL_FROM');
  }
  if (!config.APP_URL) missing.push('APP_URL');
  return { provider: config.EMAIL_PROVIDER, configured: emailConfigured(), missing };
}

// ---------------------------------------------------------------- composing

const escapeHtml = (text: string) =>
  text.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]!));

function describeMeeting(meeting: TimetableMeeting): string {
  const when = meeting.recurrence?.type === 'once' && meeting.date
    ? `${meeting.day} ${meeting.date} (one time)`
    : meeting.recurrence?.type && meeting.recurrence.type !== 'weekly'
      ? `${meeting.day} (${meeting.recurrence.type.replace('biweekly_', 'alternate weeks, ')})`
      : meeting.day;
  const room = meeting.room?.trim() ? `, ${meeting.room.trim()}` : '';
  const batches = meeting.batches ? ` [${meeting.batches}]` : '';
  return `${meeting.type} · ${when} ${meeting.startTime}–${meeting.endTime}${room}${batches}`;
}

const KIND_LABEL: Record<ChangeKind, string> = {
  addition: 'Addition (a class is added)',
  deletion: 'Deletion (a class is removed)',
  modification: 'Modification (a class moves or changes venue)',
};

export interface RequestEmailInput {
  requestId: number;
  courseCode: string;
  courseName: string | null;
  semesterName: string | null;
  requesterRoll: string;
  requesterName: string | null;
  note: string | null;
  kind: ChangeKind;
  delta: MeetingDelta;
}

export function composeRequestEmail(input: RequestEmailInput) {
  const link = config.APP_URL ? `${config.APP_URL.replace(/\/$/, '')}/admin?request=${input.requestId}` : null;
  const course = input.courseName ? `${input.courseCode} — ${input.courseName}` : input.courseCode;
  const student = input.requesterName ? `${input.requesterName} (${input.requesterRoll})` : input.requesterRoll;
  const removed = input.delta.remove.map(describeMeeting);
  const added = input.delta.add.map(describeMeeting);

  const subject = `Timetable change request: ${input.courseCode} (${input.kind})`;
  const lines = [
    `Student:  ${student}`,
    `Course:   ${course}`,
    ...(input.semesterName ? [`Semester: ${input.semesterName}`] : []),
    `Change:   ${KIND_LABEL[input.kind]}`,
    '',
    'Current (to be replaced):',
    ...(removed.length ? removed.map((line) => `  - ${line}`) : ['  (nothing is removed)']),
    '',
    'Proposed:',
    ...(added.length ? added.map((line) => `  + ${line}`) : ['  (nothing is added)']),
    '',
    'Student\'s explanation:',
    `  ${input.note?.trim() || '(none given)'}`,
    '',
    link
      ? `Review it (sign-in required): ${link}`
      : 'Review it in /admin → Requests. (Set APP_URL on the API to get a direct link here.)',
    '',
    'Nothing changes for any student until you decide. Opening the link does not approve anything.',
  ];

  const list = (items: string[], empty: string, color: string) =>
    items.length
      ? `<ul style="margin:4px 0 12px;padding-left:20px">${items
          .map((item) => `<li style="color:${color}">${escapeHtml(item)}</li>`)
          .join('')}</ul>`
      : `<p style="margin:4px 0 12px;color:#666">${empty}</p>`;

  const html = `<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;font-size:14px;line-height:1.5;color:#111">
<h2 style="font-size:16px;margin:0 0 12px">Timetable change request #${input.requestId}</h2>
<table style="border-collapse:collapse;margin-bottom:12px">
<tr><td style="padding:2px 12px 2px 0;color:#666">Student</td><td>${escapeHtml(student)}</td></tr>
<tr><td style="padding:2px 12px 2px 0;color:#666">Course</td><td>${escapeHtml(course)}</td></tr>
${input.semesterName ? `<tr><td style="padding:2px 12px 2px 0;color:#666">Semester</td><td>${escapeHtml(input.semesterName)}</td></tr>` : ''}
<tr><td style="padding:2px 12px 2px 0;color:#666">Change</td><td>${escapeHtml(KIND_LABEL[input.kind])}</td></tr>
</table>
<strong>Current (to be replaced)</strong>${list(removed, 'Nothing is removed.', '#b42318')}
<strong>Proposed</strong>${list(added, 'Nothing is added.', '#067647')}
<strong>Student's explanation</strong>
<p style="margin:4px 0 16px;white-space:pre-wrap">${escapeHtml(input.note?.trim() || '(none given)')}</p>
${link ? `<p><a href="${escapeHtml(link)}" style="display:inline-block;padding:8px 14px;background:#2563eb;color:#fff;border-radius:8px;text-decoration:none">Review in the admin panel</a></p>` : '<p>Review it in /admin → Requests.</p>'}
<p style="color:#666;font-size:12px">Sign-in is required. Opening the link does not approve anything; nothing changes for any student until you decide.</p>
</div>`;

  return { subject, text: lines.join('\n'), html };
}

/** Queues the email for a new or updated request. Call inside the request's transaction. */
export async function queueRequestEmail(
  client: PoolClient,
  input: RequestEmailInput & { contentKey: string },
): Promise<void> {
  if (!config.ADMIN_NOTIFY_EMAIL) return; // Nowhere to send; the request is still saved.
  const message = composeRequestEmail(input);
  await client.query(
    `insert into email_outbox (kind, dedupe_key, request_id, to_address, subject, body_text, body_html)
     values ('change_request', $1, $2, $3, $4, $5, $6)
     on conflict (dedupe_key) do nothing`,
    [
      `change-request:${input.requestId}:${input.contentKey}`, input.requestId, config.ADMIN_NOTIFY_EMAIL,
      message.subject, message.text, message.html,
    ],
  );
}

// ---------------------------------------------------------------- sending

async function send(row: { to_address: string; subject: string; body_text: string; body_html: string | null; dedupe_key: string }) {
  if (config.EMAIL_PROVIDER === 'log') {
    console.log(`[email:log] to ${row.to_address}: ${row.subject}\n${row.body_text}`);
    return;
  }
  if (!emailConfigured()) throw new Error('Email is not configured (see EMAIL_* in server/.env.example).');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SEND_TIMEOUT_MS);
  try {
    const response =
      config.EMAIL_PROVIDER === 'resend'
        ? await fetch('https://api.resend.com/emails', {
            method: 'POST',
            signal: controller.signal,
            headers: {
              Authorization: `Bearer ${config.EMAIL_API_KEY}`,
              'Content-Type': 'application/json',
              // The provider drops a repeat of the same key, so a retry after
              // a lost response cannot deliver the message twice.
              'Idempotency-Key': row.dedupe_key.slice(0, 250),
            },
            body: JSON.stringify({
              from: config.EMAIL_FROM,
              to: [row.to_address],
              subject: row.subject,
              text: row.body_text,
              ...(row.body_html ? { html: row.body_html } : {}),
            }),
          })
        : await fetch('https://api.brevo.com/v3/smtp/email', {
            method: 'POST',
            signal: controller.signal,
            headers: { 'api-key': config.EMAIL_API_KEY!, 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify({
              sender: parseSender(config.EMAIL_FROM!),
              to: [{ email: row.to_address }],
              subject: row.subject,
              textContent: row.body_text,
              ...(row.body_html ? { htmlContent: row.body_html } : {}),
            }),
          });

    if (!response.ok) {
      const detail = (await response.text().catch(() => '')).slice(0, 300);
      throw new Error(`${config.EMAIL_PROVIDER} responded ${response.status}. ${detail}`);
    }
  } finally {
    clearTimeout(timer);
  }
}

/** "Campus Companion <alerts@example.com>" -> { name, email }. */
function parseSender(from: string): { name?: string; email: string } {
  const match = from.match(/^\s*(.*?)\s*<([^>]+)>\s*$/);
  return match ? { name: match[1] || undefined, email: match[2] } : { email: from.trim() };
}

let delivering = false;

/**
 * Sends whatever is due. Safe to call from anywhere, any number of times: one
 * run at a time per process, and each row is claimed under a lock so a second
 * API instance would skip it rather than send it again.
 */
export async function deliverDueEmails(limit = 10): Promise<{ sent: number; failed: number }> {
  if (delivering || !emailConfigured()) return { sent: 0, failed: 0 };
  delivering = true;
  let sent = 0;
  let failed = 0;
  try {
    for (let i = 0; i < limit; i += 1) {
      const client = await pool.connect();
      try {
        await client.query('begin');
        const claimed = await client.query<{
          id: number; to_address: string; subject: string; body_text: string; body_html: string | null;
          dedupe_key: string; attempts: number;
        }>(
          `select id, to_address, subject, body_text, body_html, dedupe_key, attempts
             from email_outbox
            where status = 'pending' and next_attempt_at <= now()
            order by next_attempt_at
            limit 1
            for update skip locked`,
        );
        const row = claimed.rows[0];
        if (!row) {
          await client.query('rollback');
          break;
        }

        try {
          await send(row);
          await client.query(
            `update email_outbox set status = 'sent', sent_at = now(), attempts = attempts + 1, last_error = null
              where id = $1`,
            [row.id],
          );
          sent += 1;
        } catch (error) {
          const attempts = row.attempts + 1;
          const message = error instanceof Error ? error.message : String(error);
          // 5, 20, 45, 80 ... minutes; then stop and wait for a manual retry.
          await client.query(
            `update email_outbox
                set attempts = $2::int, last_error = $3,
                    status = case when $2::int >= $4::int then 'failed' else 'pending' end,
                    next_attempt_at = now() + make_interval(mins => $5::int)
              where id = $1`,
            [row.id, attempts, message.slice(0, 500), MAX_ATTEMPTS, attempts * attempts * 5],
          );
          failed += 1;
          console.error(`[email] delivery ${row.id} failed (attempt ${attempts}): ${message}`);
        }
        await client.query('commit');
      } catch (error) {
        await client.query('rollback').catch(() => undefined);
        throw error;
      } finally {
        client.release();
      }
    }
  } catch (error) {
    // The outbox table may not exist yet (migration 013 pending). Not fatal.
    if ((error as { code?: string }).code !== '42P01') console.error('[email] outbox run failed:', error);
  } finally {
    delivering = false;
  }
  return { sent, failed };
}

export interface OutboxEntry {
  id: number;
  requestId: number | null;
  subject: string;
  status: string;
  attempts: number;
  lastError: string | null;
  createdAt: string;
  sentAt: string | null;
}

export async function listOutbox(limit = 30): Promise<OutboxEntry[]> {
  const rows = await query<{
    id: number; request_id: number | null; subject: string; status: string; attempts: number;
    last_error: string | null; created_at: Date; sent_at: Date | null;
  }>(
    `select id, request_id, subject, status, attempts, last_error, created_at, sent_at
       from email_outbox order by created_at desc limit $1`,
    [limit],
  );
  return rows.map((row) => ({
    id: row.id, requestId: row.request_id, subject: row.subject, status: row.status, attempts: row.attempts,
    lastError: row.last_error, createdAt: row.created_at.toISOString(), sentAt: row.sent_at?.toISOString() ?? null,
  }));
}

/** Puts undelivered messages back in the queue: one by id, or every failed one. */
export async function retryEmails(id?: number): Promise<number> {
  const rows = await query(
    `update email_outbox
        set status = 'pending', next_attempt_at = now(), attempts = 0
      where status in ('failed', 'pending') and ($1::bigint is null or id = $1)
      returning id`,
    [id ?? null],
  );
  return rows.length;
}

let timer: NodeJS.Timeout | null = null;

/** Retries the outbox every few minutes for as long as the process lives. */
export function startEmailWorker(intervalMs = 5 * 60_000): void {
  if (timer) return;
  timer = setInterval(() => void deliverDueEmails(), intervalMs);
  timer.unref();
  void deliverDueEmails();
}
