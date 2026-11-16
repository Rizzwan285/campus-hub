import { SUBJECT_LIMIT, TEXT_LIMIT, type RenderedEmail } from './emailTemplate';

/**
 * Sending through a Google Apps Script web app that relays to Gmail.
 *
 * The script (deployed "Execute as: Me", "Who has access: Anyone") takes
 *
 *     POST <deployment>/exec   {"token", "subject", "text", "html"}
 *
 * and answers `{"success": true|false, "message": "..."}` - with HTTP 200 even
 * when it failed, so success is read from that body, never from the status.
 * It always sends to its own ADMIN_EMAIL script property; the caller cannot
 * pick a recipient. It has no idempotency key: a reply lost after the script
 * already sent means a retry can deliver the email twice.
 *
 * Apps Script cannot read request headers, so the shared secret travels in the
 * JSON body as `token`. Nothing here logs a request body, and every error
 * message is scrubbed of the secret before it leaves this module.
 */

/** Apps Script cold starts plus MailApp can take several seconds; be generous. */
export const APPS_SCRIPT_TIMEOUT_MS = 30_000;
const MAX_REDIRECTS = 4;
const MAX_REPLY_BYTES = 64_000;
const GOOGLE_HOST = /(^|\.)(google\.com|googleusercontent\.com)$/i;

/** A delivery failure whose message is safe to store and show in /admin. */
export class AppsScriptError extends Error {
  constructor(message: string, readonly reason: AppsScriptFailure) {
    super(message);
    this.name = 'AppsScriptError';
  }
}

export type AppsScriptFailure =
  | 'wrong-secret' | 'quota' | 'script-not-configured' | 'not-authorised' | 'too-long' | 'rejected'
  | 'html-reply' | 'sign-in' | 'http-status' | 'unexpected-reply' | 'redirect' | 'timeout' | 'network';

export const REASONS = {
  wrongSecret:
    'Apps Script refused the shared secret: APPS_SCRIPT_SECRET on the API must equal the script\'s SHARED_SECRET property.',
  quota:
    'Gmail\'s daily sending limit for the script is used up (about 100 recipients a day). It will be retried automatically; the limit resets within 24 hours.',
  scriptNotConfigured:
    'The script is missing its SHARED_SECRET or ADMIN_EMAIL property (Apps Script → Project Settings → Script Properties).',
  notAuthorised:
    'The script is not authorised to send mail. Run authorizeEmailService() in the Apps Script editor, then deploy a new version.',
  tooLong: `The email is longer than the script accepts (subject ${SUBJECT_LIMIT} characters, text ${TEXT_LIMIT.toLocaleString('en-IN')}).`,
  signIn:
    'Google asked for a sign-in instead of running the script. Use the deployment URL ending in /exec and set "Who has access" to "Anyone".',
  timeout: (ms: number) =>
    `Apps Script did not answer within ${Math.round(ms / 1000)} seconds. The email may still have been sent, so a retry can deliver it twice.`,
};

export interface AppsScriptOptions {
  url: string;
  secret: string;
  timeoutMs?: number;
}

/** Removes the secret from anything that might be stored, logged or shown. */
export function redactSecret(text: string, secret: string | undefined | null): string {
  return secret ? text.split(secret).join('[secret]') : text;
}

const isRedirect = (status: number) => status >= 300 && status < 400;

async function readReply(response: Response): Promise<string> {
  const text = await response.text();
  return text.length > MAX_REPLY_BYTES ? text.slice(0, MAX_REPLY_BYTES) : text;
}

function looksLikeHtml(contentType: string | null, body: string): boolean {
  return /text\/html/i.test(contentType ?? '') || /^\s*(<!doctype html|<html|<head|<body)/i.test(body);
}

function pageTitle(body: string): string | null {
  const match = body.match(/<title[^>]*>([^<]{1,120})<\/title>/i);
  return match ? match[1].replace(/\s+/g, ' ').trim() || null : null;
}

/** Turns the script's own failure message into a reason the admin can act on. */
function explainScriptMessage(message: string): AppsScriptError {
  if (/unauthori[sz]ed request/i.test(message)) return new AppsScriptError(REASONS.wrongSecret, 'wrong-secret');
  // MailApp's own words: "Service invoked too many times for one day: email."
  if (/too many times|quota/i.test(message)) return new AppsScriptError(REASONS.quota, 'quota');
  if (/service is not configured/i.test(message)) return new AppsScriptError(REASONS.scriptNotConfigured, 'script-not-configured');
  if (/permission|authori[sz]ation|authori[sz]e/i.test(message)) return new AppsScriptError(REASONS.notAuthorised, 'not-authorised');
  if (/exceeds the allowed size/i.test(message)) return new AppsScriptError(REASONS.tooLong, 'too-long');
  const said = message.trim().slice(0, 200) || 'no reason given';
  return new AppsScriptError(`Apps Script could not send it: "${said}"`, 'rejected');
}

function interpretReply(status: number, contentType: string | null, body: string): void {
  if (looksLikeHtml(contentType, body)) {
    if (/accounts\.google\.com|ServiceLogin|<title>\s*Sign in/i.test(body)) {
      throw new AppsScriptError(REASONS.signIn, 'sign-in');
    }
    const title = pageTitle(body);
    throw new AppsScriptError(
      `Apps Script returned a web page${title ? ` ("${title}")` : ''} instead of its reply (HTTP ${status}). ` +
        'Check APPS_SCRIPT_URL is the current /exec deployment URL and that the script has a doPost function.',
      'html-reply',
    );
  }

  let reply: unknown;
  try {
    reply = JSON.parse(body);
  } catch {
    reply = undefined;
  }
  const result = reply && typeof reply === 'object' ? (reply as { success?: unknown; message?: unknown }) : null;

  if (result && result.success === true) return; // Sent.
  if (result && result.success === false) {
    throw explainScriptMessage(typeof result.message === 'string' ? result.message : '');
  }
  if (status < 200 || status >= 300) {
    throw new AppsScriptError(`Apps Script answered HTTP ${status}. Check APPS_SCRIPT_URL and the deployment.`, 'http-status');
  }
  throw new AppsScriptError(
    'Apps Script answered, but not with the expected {"success", "message"} reply. Check the deployed script version.',
    'unexpected-reply',
  );
}

/**
 * Sends one email through the script. Resolves only when the script reports
 * `success: true`; anything else throws an AppsScriptError with a plain reason.
 */
export async function sendViaAppsScript(email: RenderedEmail, options: AppsScriptOptions): Promise<void> {
  const subject = email.subject.trim();
  const text = email.text.trim();
  // The script would refuse these too; failing here says why without a round trip.
  if (!subject || !text) throw new AppsScriptError('The email has an empty subject or text.', 'rejected');
  if (subject.length > SUBJECT_LIMIT || text.length > TEXT_LIMIT) throw new AppsScriptError(REASONS.tooLong, 'too-long');

  const timeoutMs = options.timeoutMs ?? APPS_SCRIPT_TIMEOUT_MS;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    let current = new URL(options.url);
    let response = await fetch(current, {
      method: 'POST',
      redirect: 'manual',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ token: options.secret, subject, text, html: email.html }),
    });

    // Google runs doPost on the POST, then answers 302 to a one-time URL that
    // holds the reply. Fetching that is a plain GET without a body - the secret
    // is never sent twice, and a 307/308 can never make the script run again.
    for (let hops = 0; isRedirect(response.status); hops += 1) {
      const location = response.headers.get('location');
      await response.body?.cancel().catch(() => undefined);
      if (!location) throw new AppsScriptError('Apps Script sent a redirect without a destination.', 'redirect');
      if (hops >= MAX_REDIRECTS) throw new AppsScriptError('Apps Script redirected too many times.', 'redirect');
      const next = new URL(location, current);
      if (/^accounts\.google\.com$/i.test(next.hostname)) throw new AppsScriptError(REASONS.signIn, 'sign-in');
      if (next.protocol !== 'https:' || !GOOGLE_HOST.test(next.hostname)) {
        throw new AppsScriptError(`Apps Script redirected to an unexpected address (${next.hostname}).`, 'redirect');
      }
      current = next;
      response = await fetch(current, { method: 'GET', redirect: 'manual', signal: controller.signal });
    }

    interpretReply(response.status, response.headers.get('content-type'), await readReply(response));
  } catch (error) {
    if (error instanceof AppsScriptError) throw error;
    if (controller.signal.aborted) throw new AppsScriptError(REASONS.timeout(timeoutMs), 'timeout');
    const cause = (error as { cause?: { code?: string } })?.cause?.code ?? (error instanceof Error ? error.name : 'error');
    throw new AppsScriptError(`Could not reach Apps Script (${cause}). It will be retried.`, 'network');
  } finally {
    clearTimeout(timer);
  }
}
