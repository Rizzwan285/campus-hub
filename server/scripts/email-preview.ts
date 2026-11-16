/**
 * Renders the emails from src/services/emailTemplate.ts with sample data and
 * writes them to server/email-preview/ (gitignored). Sends nothing and needs
 * no database or .env.
 *
 *     npm --prefix server run email:preview
 *     APP_URL=https://rizwans-campus-hub.vercel.app/ npm --prefix server run email:preview
 *
 * Open the .html files in a browser; the .txt files are the plain-text parts.
 */
import fs from 'fs';
import path from 'path';
import type { TimetableMeeting } from '../../src/engine/types';
import { renderChangeRequestEmail, renderTestEmail } from '../src/services/emailTemplate';

const appUrl = process.env.APP_URL || 'https://rizwans-campus-hub.vercel.app';
const outDir = path.resolve(__dirname, '../email-preview');

const lecture = (day: TimetableMeeting['day'], startTime: string, endTime: string, room: string): TimetableMeeting =>
  ({ day, startTime, endTime, room, type: 'lecture' }) as TimetableMeeting;

const current = [lecture('Monday', '09:00', '09:50', 'N305'), lecture('Tuesday', '08:00', '08:50', 'N305'), lecture('Friday', '10:00', '10:50', 'N305')];
const proposed = [lecture('Monday', '09:00', '09:50', 'N305'), lecture('Tuesday', '08:00', '08:50', 'N305'), lecture('Thursday', '14:00', '15:00', 'A01-118')];

const request = renderChangeRequestEmail(
  {
    requestId: 42,
    courseCode: 'CS3100',
    courseName: 'Database Systems & Design',
    semesterName: 'Jan-May 2027',
    requesterRoll: '112301001',
    requesterName: 'Asha <Menon>',
    // Typed by a student, so it must come out escaped in the HTML.
    note: 'Prof moved Friday\'s class to Thursday 2 pm "from next week". <script>alert(1)</script>',
    kind: 'modification',
    currentMeetings: current,
    proposedMeetings: proposed,
    delta: { remove: [current[2]], add: [proposed[2]] },
  },
  appUrl,
);
const test = renderTestEmail({ provider: 'apps_script', sentAt: '17 Nov 2026, 9:30 am IST' }, appUrl);

fs.mkdirSync(outDir, { recursive: true });
const page = (subject: string, html: string) =>
  `<!doctype html><meta charset="utf-8"><title>${subject.replace(/</g, '&lt;')}</title>` +
  `<p style="font:13px system-ui;color:#555">Subject: <strong>${subject.replace(/</g, '&lt;')}</strong></p><hr>${html}`;

for (const [name, email] of [['change-request', request], ['test-email', test]] as const) {
  fs.writeFileSync(path.join(outDir, `${name}.html`), page(email.subject, email.html));
  fs.writeFileSync(path.join(outDir, `${name}.txt`), `Subject: ${email.subject}\n\n${email.text}\n`);
  console.log(`${name}: ${path.join(outDir, `${name}.html`)} (+ .txt)  subject ${email.subject.length}/200, text ${email.text.length}/50000 chars`);
}
console.log(`Links point at ${appUrl}. Nothing was sent.`);
