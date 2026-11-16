import type { ChangeKind, MeetingDelta } from '../../../src/engine/courseTimings';
import type { TimetableMeeting } from '../../../src/engine/types';

/**
 * Every email the API sends, in one place.
 *
 * Edit the wording, colours and button here; every provider (Apps Script,
 * Resend, Brevo, log) sends exactly what these functions return. Preview a
 * change without sending anything:
 *
 *     npm --prefix server run email:preview
 *
 * Rules worth keeping when editing:
 * - Anything a student typed goes through `escapeHtml` before it enters the HTML.
 * - Keep the subject under 200 characters and the text under 50,000: the Apps
 *   Script relay refuses anything longer.
 * - The button only opens /admin. Approving still takes a signed-in click there.
 */

// ---------------------------------------------------------------- look and wording

const APP_NAME = 'Campus Companion';
const COLOURS = {
  text: '#111827',
  muted: '#6b7280',
  border: '#e5e7eb',
  panel: '#f9fafb',
  removed: '#b42318',
  added: '#067647',
  button: '#2563eb',
  buttonText: '#ffffff',
};
const FONT = 'system-ui,-apple-system,Segoe UI,Roboto,sans-serif';

export const REVIEW_BUTTON_LABEL = 'Open this request in the admin panel';
const SAFETY_NOTE =
  'Sign-in is required. Opening the link does not approve anything; nothing changes for any student until you decide.';

const KIND_LABEL: Record<ChangeKind, string> = {
  addition: 'Addition (a class is added)',
  deletion: 'Deletion (a class is removed)',
  modification: 'Modification (a class moves or changes venue)',
};

/** The limits the Apps Script relay enforces; other providers allow more. */
export const SUBJECT_LIMIT = 200;
export const TEXT_LIMIT = 50_000;

// ---------------------------------------------------------------- helpers

export const escapeHtml = (text: string) =>
  text.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]!));

/** `https://site/` and `https://site` both give `https://site/admin?request=12`. */
export function adminLink(appUrl: string | null | undefined, query = ''): string | null {
  const base = appUrl?.trim().replace(/\/+$/, '');
  return base ? `${base}/admin${query}` : null;
}

export function requestLink(appUrl: string | null | undefined, requestId: number): string | null {
  return adminLink(appUrl, `?request=${requestId}`);
}

const clip = (text: string, limit: number) => (text.length > limit ? `${text.slice(0, limit - 1)}…` : text);

export function describeMeeting(meeting: TimetableMeeting): string {
  const when = meeting.recurrence?.type === 'once' && meeting.date
    ? `${meeting.day} ${meeting.date} (one time)`
    : meeting.recurrence?.type && meeting.recurrence.type !== 'weekly'
      ? `${meeting.day} (${meeting.recurrence.type.replace('biweekly_', 'alternate weeks, ')})`
      : meeting.day;
  const room = meeting.room?.trim() ? `, ${meeting.room.trim()}` : '';
  const batches = meeting.batches ? ` [${meeting.batches}]` : '';
  const type = meeting.type ? meeting.type.charAt(0).toUpperCase() + meeting.type.slice(1) : 'Class';
  return `${type} · ${when} ${meeting.startTime}–${meeting.endTime}${room}${batches}`;
}

interface Line {
  text: string;
  mark: 'removed' | 'added' | null;
}

/** The whole list, with the lines this request removes or adds marked. */
function markedLines(meetings: TimetableMeeting[], changed: TimetableMeeting[], mark: 'removed' | 'added'): Line[] {
  const changedText = new Set(changed.map(describeMeeting));
  return meetings.map((meeting) => {
    const text = describeMeeting(meeting);
    return { text, mark: changedText.has(text) ? mark : null };
  });
}

function textList(lines: Line[], empty: string): string[] {
  if (lines.length === 0) return [`  ${empty}`];
  return lines.map(({ text, mark }) => `  ${mark === 'removed' ? '-' : mark === 'added' ? '+' : '•'} ${text}${
    mark === 'removed' ? '   (removed)' : mark === 'added' ? '   (new)' : ''}`);
}

function htmlList(lines: Line[], empty: string): string {
  if (lines.length === 0) return `<p style="margin:4px 0 14px;color:${COLOURS.muted}">${escapeHtml(empty)}</p>`;
  const items = lines.map(({ text, mark }) => {
    const colour = mark === 'removed' ? COLOURS.removed : mark === 'added' ? COLOURS.added : COLOURS.text;
    const tag = mark === 'removed' ? ' <strong>(removed)</strong>' : mark === 'added' ? ' <strong>(new)</strong>' : '';
    const strike = mark === 'removed' ? 'text-decoration:line-through;' : '';
    return `<li style="color:${colour};margin:2px 0"><span style="${strike}">${escapeHtml(text)}</span>${tag}</li>`;
  });
  return `<ul style="margin:4px 0 14px;padding-left:20px">${items.join('')}</ul>`;
}

function button(href: string, label: string): string {
  return `<p style="margin:18px 0 8px"><a href="${escapeHtml(href)}" style="display:inline-block;padding:10px 16px;background:${COLOURS.button};color:${COLOURS.buttonText};border-radius:8px;text-decoration:none;font-weight:600">${escapeHtml(label)}</a></p>`;
}

function layout(title: string, body: string): string {
  return `<div style="font-family:${FONT};font-size:14px;line-height:1.5;color:${COLOURS.text};max-width:600px">
<h2 style="font-size:17px;margin:0 0 12px">${escapeHtml(title)}</h2>
${body}
<p style="color:${COLOURS.muted};font-size:12px;margin-top:20px;border-top:1px solid ${COLOURS.border};padding-top:10px">${escapeHtml(APP_NAME)}</p>
</div>`;
}

const detailRow = (label: string, value: string) =>
  `<tr><td style="padding:3px 14px 3px 0;color:${COLOURS.muted};vertical-align:top;white-space:nowrap">${escapeHtml(label)}</td><td style="padding:3px 0">${escapeHtml(value)}</td></tr>`;

export interface RenderedEmail {
  subject: string;
  text: string;
  html: string;
}

// ---------------------------------------------------------------- change request

export interface ChangeRequestEmailInput {
  requestId: number;
  courseCode: string;
  courseName: string | null;
  semesterName: string | null;
  requesterRoll: string;
  requesterName: string | null;
  note: string | null;
  kind: ChangeKind;
  /** The official timings when the request was made. */
  currentMeetings: TimetableMeeting[];
  /** The full list the student proposes instead. */
  proposedMeetings: TimetableMeeting[];
  /** What changes between the two, used to mark lines. */
  delta: MeetingDelta;
}

/** The email the developer gets when a student asks for a timetable change. */
export function renderChangeRequestEmail(input: ChangeRequestEmailInput, appUrl: string | null | undefined): RenderedEmail {
  const link = requestLink(appUrl, input.requestId);
  const course = input.courseName ? `${input.courseCode} — ${input.courseName}` : input.courseCode;
  const student = input.requesterName ? `${input.requesterName} (${input.requesterRoll})` : input.requesterRoll;
  const note = input.note?.trim() || '(none given)';
  const current = markedLines(input.currentMeetings, input.delta.remove, 'removed');
  const proposed = markedLines(input.proposedMeetings, input.delta.add, 'added');

  // The request number keeps Gmail from threading different requests together;
  // an edited resubmission keeps its number and joins its own thread.
  const subject = clip(`Timetable change request #${input.requestId}: ${input.courseCode} (${input.kind})`, SUBJECT_LIMIT);

  const text = clip([
    `Timetable change request #${input.requestId}`,
    '',
    `Student:  ${student}`,
    `Course:   ${course}`,
    ...(input.semesterName ? [`Semester: ${input.semesterName}`] : []),
    `Change:   ${KIND_LABEL[input.kind]}`,
    '',
    'Current timings:',
    ...textList(current, '(no classes listed)'),
    '',
    'Proposed timings:',
    ...textList(proposed, '(no classes: the student proposes removing them all)'),
    '',
    "Student's explanation:",
    `  ${note}`,
    '',
    link
      ? `${REVIEW_BUTTON_LABEL}: ${link}`
      : 'Review it in /admin → Requests. (Set APP_URL on the API to get a direct link here.)',
    '',
    SAFETY_NOTE,
  ].join('\n'), TEXT_LIMIT);

  const html = layout(`Timetable change request #${input.requestId}`, `
<table style="border-collapse:collapse;margin-bottom:14px">
${detailRow('Student', student)}
${detailRow('Course', course)}
${input.semesterName ? detailRow('Semester', input.semesterName) : ''}
${detailRow('Change', KIND_LABEL[input.kind])}
</table>
<div style="background:${COLOURS.panel};border:1px solid ${COLOURS.border};border-radius:8px;padding:10px 14px">
<strong>Current timings</strong>${htmlList(current, 'No classes listed.')}
<strong>Proposed timings</strong>${htmlList(proposed, 'No classes: the student proposes removing them all.')}
</div>
<p style="margin:14px 0 4px"><strong>Student's explanation</strong></p>
<p style="margin:0 0 8px;white-space:pre-wrap">${escapeHtml(note)}</p>
${link ? button(link, REVIEW_BUTTON_LABEL) : '<p>Review it in /admin → Requests.</p>'}
<p style="color:${COLOURS.muted};font-size:12px;margin:4px 0 0">${escapeHtml(SAFETY_NOTE)}</p>`);

  return { subject, text, html };
}

// ---------------------------------------------------------------- test email

export interface TestEmailInput {
  provider: string;
  /** When it was queued, already formatted for reading. */
  sentAt: string;
}

/** What "Send test email" in /admin sends. */
export function renderTestEmail(input: TestEmailInput, appUrl: string | null | undefined): RenderedEmail {
  const link = adminLink(appUrl, '?tab=requests');
  const subject = `${APP_NAME}: test email`;
  const lines = [
    'This is a test email from the admin panel (Requests → Send test email).',
    `If you are reading it, emails about timetable change requests will reach you too.`,
    '',
    `Provider: ${input.provider}`,
    `Queued:   ${input.sentAt}`,
    '',
    link ? `Admin panel: ${link}` : 'Set APP_URL on the API so request emails can link to the admin panel.',
  ];
  const html = layout('Test email', `
<p style="margin:0 0 8px">This is a test email from the admin panel (Requests → Send test email).</p>
<p style="margin:0 0 12px">If you are reading it, emails about timetable change requests will reach you too.</p>
<table style="border-collapse:collapse">
${detailRow('Provider', input.provider)}
${detailRow('Queued', input.sentAt)}
</table>
${link ? button(link, 'Open the admin panel') : '<p>Set APP_URL on the API so request emails can link to the admin panel.</p>'}`);
  return { subject, text: lines.join('\n'), html };
}
