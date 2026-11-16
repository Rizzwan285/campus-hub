import crypto from 'crypto';
import type { PoolClient } from 'pg';
import { config } from '../config';
import { pool, query } from '../db';
import { APPS_SCRIPT_TIMEOUT_MS, AppsScriptError, redactSecret, sendViaAppsScript } from './appsScript';
import { renderChangeRequestEmail, renderTestEmail, type ChangeRequestEmailInput, type RenderedEmail } from './emailTemplate';

/**
 * Emails to the developer, through an outbox.
 *
 * A message is a row in `email_outbox`, written in the same transaction as the
 * request it announces. Delivery happens afterwards and separately, so a mail
 * provider being slow, down or misconfigured can delay a notification but can
 * never lose - or even slow - the request itself. Undelivered rows are retried
 * with a growing delay, and the admin panel can retry them by hand.
 *
 * Sending is plain HTTPS: to Resend's or Brevo's API, or to a Google Apps
 * Script web app that relays through Gmail (see appsScript.ts). SMTP is
 * deliberately not used: free hosting tiers block outbound SMTP ports.
 *
 * What the emails say lives in emailTemplate.ts; every provider sends that.
 */

const MAX_ATTEMPTS = 8;
const SEND_TIMEOUT_MS = 10_000;

export function emailConfigured(): boolean {
  if (config.EMAIL_PROVIDER === 'none') return false;
  if (!config.ADMIN_NOTIFY_EMAIL) return false;
  if (config.EMAIL_PROVIDER === 'log') return true;
  if (config.EMAIL_PROVIDER === 'apps_script') return Boolean(config.APPS_SCRIPT_URL && config.APPS_SCRIPT_SECRET);
  return Boolean(config.EMAIL_API_KEY && config.EMAIL_FROM);
}

/**
 * For the admin panel: what is set up and what is missing, by variable name.
 * Never includes a secret, an API key or the Apps Script URL.
 */
export function emailStatus() {
  const missing: string[] = [];
  if (config.EMAIL_PROVIDER === 'none') missing.push('EMAIL_PROVIDER');
  if (!config.ADMIN_NOTIFY_EMAIL) missing.push('ADMIN_NOTIFY_EMAIL');
  if (config.EMAIL_PROVIDER === 'resend' || config.EMAIL_PROVIDER === 'brevo') {
    if (!config.EMAIL_API_KEY) missing.push('EMAIL_API_KEY');
    if (!config.EMAIL_FROM) missing.push('EMAIL_FROM');
  }
  if (config.EMAIL_PROVIDER === 'apps_script') {
    if (!config.APPS_SCRIPT_URL) missing.push('APPS_SCRIPT_URL');
    if (!config.APPS_SCRIPT_SECRET) missing.push('APPS_SCRIPT_SECRET');
  }
  if (!config.APP_URL) missing.push('APP_URL');
  return {
    provider: config.EMAIL_PROVIDER,
    configured: emailConfigured(),
    missing,
    recipient: config.ADMIN_NOTIFY_EMAIL ?? null,
    /** The Apps Script relay ignores the API's recipient and uses its own. */
    recipientNote: config.EMAIL_PROVIDER === 'apps_script'
      ? "Apps Script sends to its own ADMIN_EMAIL script property. Keep it the same as ADMIN_NOTIFY_EMAIL."
      : null,
    appUrl: config.APP_URL ?? null,
  };
}

// ---------------------------------------------------------------- composing

export type RequestEmailInput = ChangeRequestEmailInput;

/** Queues the email for a new or updated request. Call inside the request's transaction. */
export async function queueRequestEmail(
  client: PoolClient,
  input: RequestEmailInput & { contentKey: string },
): Promise<void> {
  if (!config.ADMIN_NOTIFY_EMAIL) return; // Nowhere to send; the request is still saved.
  const message = renderChangeRequestEmail(input, config.APP_URL);
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

interface OutboxRow {
  id: number;
  to_address: string;
  subject: string;
  body_text: string;
  body_html: string | null;
  dedupe_key: string;
  attempts: number;
}

async function send(row: OutboxRow) {
  if (config.EMAIL_PROVIDER === 'log') {
    console.log(`[email:log] to ${row.to_address}: ${row.subject}\n${row.body_text}`);
    return;
  }
  if (!emailConfigured()) throw new Error('Email is not configured (see EMAIL_* in server/.env.example).');

  if (config.EMAIL_PROVIDER === 'apps_script') {
    // The script chooses the recipient (its ADMIN_EMAIL property); to_address
    // records where ADMIN_NOTIFY_EMAIL said it should go.
    const email: RenderedEmail = { subject: row.subject, text: row.body_text, html: row.body_html ?? '' };
    await sendViaAppsScript(email, { url: config.APPS_SCRIPT_URL!, secret: config.APPS_SCRIPT_SECRET! });
    return;
  }

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

/** Error text safe to store in the outbox, print to the log and show in /admin. */
function safeErrorMessage(error: unknown): string {
  const message = error instanceof AppsScriptError || error instanceof Error ? error.message : String(error);
  return redactSecret(redactSecret(message, config.APPS_SCRIPT_SECRET), config.EMAIL_API_KEY).slice(0, 500);
}

type Attempt = 'sent' | 'failed' | 'none';

/**
 * Claims one due row (or the given one) under a lock, sends it and records the
 * outcome. A second API instance skips a claimed row instead of sending it twice.
 */
async function attemptOne(id?: number): Promise<Attempt> {
  const client = await pool.connect();
  try {
    await client.query('begin');
    const claimed = await client.query<OutboxRow>(
      `select id, to_address, subject, body_text, body_html, dedupe_key, attempts
         from email_outbox
        where status = 'pending' and ($1::bigint is null and next_attempt_at <= now() or id = $1)
        order by next_attempt_at
        limit 1
        for update skip locked`,
      [id ?? null],
    );
    const row = claimed.rows[0];
    if (!row) {
      await client.query('rollback');
      return 'none';
    }

    let outcome: Attempt;
    try {
      await send(row);
      await client.query(
        `update email_outbox set status = 'sent', sent_at = now(), attempts = attempts + 1, last_error = null
          where id = $1`,
        [row.id],
      );
      outcome = 'sent';
    } catch (error) {
      const attempts = row.attempts + 1;
      const message = safeErrorMessage(error);
      // 5, 20, 45, 80 ... minutes; then stop and wait for a manual retry.
      await client.query(
        `update email_outbox
            set attempts = $2::int, last_error = $3,
                status = case when $2::int >= $4::int then 'failed' else 'pending' end,
                next_attempt_at = now() + make_interval(mins => $5::int)
          where id = $1`,
        [row.id, attempts, message, MAX_ATTEMPTS, attempts * attempts * 5],
      );
      outcome = 'failed';
      // Only the id and the scrubbed reason: never the message or request body.
      console.error(`[email] delivery ${row.id} failed (attempt ${attempts}): ${message}`);
    }
    await client.query('commit');
    return outcome;
  } catch (error) {
    await client.query('rollback').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
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
      const outcome = await attemptOne();
      if (outcome === 'none') break;
      if (outcome === 'sent') sent += 1;
      else failed += 1;
    }
  } catch (error) {
    // The outbox table may not exist yet (migration 013 pending). Not fatal.
    if ((error as { code?: string }).code !== '42P01') console.error('[email] outbox run failed:', safeErrorMessage(error));
  } finally {
    delivering = false;
  }
  return { sent, failed };
}

// ---------------------------------------------------------------- test email

export interface TestEmailResult {
  /** `not_configured` means nothing was queued. */
  status: 'sent' | 'pending' | 'failed' | 'not_configured';
  id: number | null;
  error: string | null;
  /** A plain sentence for the admin panel. */
  message: string;
}

const campusTime = (date: Date) =>
  `${date.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' })} IST`;

/**
 * "Send test email" in /admin: queues a test message in the outbox and sends
 * it straight away through the configured provider, exactly like a request
 * email. A failed one stays queued and is retried like any other; an older
 * undelivered test message is cancelled so fixing a setting does not release
 * a pile of them at once.
 */
export async function sendTestEmail(): Promise<TestEmailResult> {
  if (!emailConfigured()) {
    const { missing } = emailStatus();
    return {
      status: 'not_configured', id: null, error: null,
      message: `Email is not set up, so nothing was sent. Set ${missing.join(', ') || 'the EMAIL_* variables'} on the API.`,
    };
  }

  const rendered = renderTestEmail({ provider: config.EMAIL_PROVIDER, sentAt: campusTime(new Date()) }, config.APP_URL);
  await query(`update email_outbox set status = 'cancelled' where kind = 'test' and status in ('pending', 'failed')`);
  const [row] = await query<{ id: number }>(
    `insert into email_outbox (kind, dedupe_key, to_address, subject, body_text, body_html)
     values ('test', $1, $2, $3, $4, $5) returning id`,
    [`test:${crypto.randomUUID()}`, config.ADMIN_NOTIFY_EMAIL, rendered.subject, rendered.text, rendered.html],
  );

  const readBack = async () => (await query<{ status: string; attempts: number; last_error: string | null }>(
    'select status, attempts, last_error from email_outbox where id = $1',
    [row.id],
  ))[0];

  let after = (await attemptOne(row.id)) === 'none' ? null : await readBack();
  // The background worker picked it up first: wait for that attempt to finish.
  for (const started = Date.now(); !after || (after.status === 'pending' && after.attempts === 0);) {
    if (Date.now() - started > APPS_SCRIPT_TIMEOUT_MS + 5_000) break;
    await new Promise((resolve) => setTimeout(resolve, 500));
    after = await readBack();
  }
  after ??= await readBack();

  const where = config.EMAIL_PROVIDER === 'apps_script'
    ? "the script's ADMIN_EMAIL address"
    : config.ADMIN_NOTIFY_EMAIL;
  if (after.status === 'sent') {
    return {
      status: 'sent', id: row.id, error: null,
      message: config.EMAIL_PROVIDER === 'log'
        ? 'Logged, not sent: EMAIL_PROVIDER is "log", so the email was printed to the API log.'
        : `Sent. Check the inbox of ${where} (and Spam, the first time).`,
    };
  }
  return {
    status: after.status === 'failed' ? 'failed' : 'pending',
    id: row.id,
    error: after.last_error,
    message: after.last_error
      ? `Not sent. ${after.last_error}`
      : 'Not sent yet: another delivery was in progress. It stays in the queue and goes out shortly.',
  };
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
