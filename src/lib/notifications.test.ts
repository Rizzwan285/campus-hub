import { describe, expect, it } from 'vitest';
import {
  alertsToShow, awaitsAnswer, canAccept, changeTitle, filterInbox, needsAlert, provenance, unreadCount,
} from './notifications';
import type { TimetableNotification } from '@/services/notifications';

let nextId = 1;
const note = (overrides: Partial<TimetableNotification> = {}): TimetableNotification => ({
  id: nextId++,
  kind: 'optional_change',
  requestId: 1,
  courseCode: 'CS101',
  courseName: 'Database Systems',
  semesterId: 1,
  semesterName: 'Aug-Dec 2026',
  changeKind: 'modification',
  approvalMode: 'optional',
  requestStatus: 'approved',
  delta: { remove: [], add: [] },
  reportedBy: 'Asha Menon',
  mine: false,
  explanation: null,
  decisionNote: null,
  corrected: false,
  proposalState: 'open',
  proposalStateNote: null,
  decidedAt: '2026-11-16T10:00:00.000Z',
  alert: true,
  alertSeen: false,
  read: false,
  response: null,
  respondedAt: null,
  courseSelected: true,
  createdAt: '2026-11-16T10:00:00.000Z',
  ...overrides,
});

describe('when a timetable update may interrupt a student', () => {
  it('alerts a student who already had the course when the change was approved', () => {
    expect(needsAlert(note())).toBe(true);
  });

  it('does not alert for a course added after the approval — inbox only', () => {
    // Three courses picked up later, each with an older optional change.
    const late = [note({ alert: false }), note({ alert: false, courseCode: 'CS102' }), note({ alert: false, courseCode: 'CS103' })];
    expect(alertsToShow(late)).toEqual([]);
    expect(unreadCount(late)).toBe(3);          // one quiet badge
    expect(late.every(canAccept)).toBe(true);   // still theirs to accept later
  });

  it('gathers several pending changes into one list, not several alerts', () => {
    const waiting = [note(), note({ courseCode: 'CS102' }), note({ kind: 'official_change', approvalMode: 'compulsory', proposalState: null })];
    expect(alertsToShow(waiting)).toHaveLength(3); // rendered as a single dialog
  });

  it('never alerts twice: not after it was shown, not after an answer', () => {
    expect(needsAlert(note({ alertSeen: true }))).toBe(false);
    expect(needsAlert(note({ response: 'rejected', alertSeen: true }))).toBe(false);
    expect(needsAlert(note({ response: 'accepted' }))).toBe(false);
    expect(needsAlert(note({ response: 'rejected' }))).toBe(false);
  });

  it('shows an official change once as information, with nothing to answer', () => {
    const official = note({ kind: 'official_change', approvalMode: 'compulsory', proposalState: null });
    expect(needsAlert(official)).toBe(true);
    expect(canAccept(official)).toBe(false);
    expect(needsAlert({ ...official, alert: false })).toBe(false); // a later joiner: inbox only
  });

  it('stops prompting about a course the student dropped', () => {
    const dropped = note({ courseSelected: false });
    expect(needsAlert(dropped)).toBe(false);
    expect(canAccept(dropped)).toBe(false);
    expect(unreadCount([dropped])).toBe(0);
  });

  it('does not offer a proposal that is outdated, made official, or withdrawn', () => {
    for (const proposalState of ['outdated', 'official', 'closed'] as const) {
      expect(canAccept(note({ proposalState }))).toBe(false);
      expect(needsAlert(note({ proposalState }))).toBe(false);
    }
  });

  it('lets a declined change be accepted later, but an accepted one is settled', () => {
    expect(canAccept(note({ response: 'rejected' }))).toBe(true);
    expect(awaitsAnswer(note({ response: 'rejected' }))).toBe(false);
    expect(canAccept(note({ response: 'accepted' }))).toBe(false);
  });

  it('counts the outcome of the student\'s own request as unread, without alerting', () => {
    const mine = note({ kind: 'request_decision', mine: true, alert: false, reportedBy: null, requestStatus: 'rejected', courseSelected: false });
    expect(needsAlert(mine)).toBe(false);
    expect(unreadCount([mine])).toBe(1);
    expect(unreadCount([{ ...mine, read: true }])).toBe(0);
  });
});

describe('inbox', () => {
  const all = [
    note(),
    note({ response: 'accepted' }),
    note({ kind: 'official_change', approvalMode: 'compulsory', proposalState: null }),
    note({ kind: 'request_decision', mine: true, reportedBy: null }),
  ];

  it('filters', () => {
    expect(filterInbox(all, 'all')).toHaveLength(4);
    expect(filterInbox(all, 'to-answer')).toHaveLength(1);
    expect(filterInbox(all, 'official')).toHaveLength(1);
    expect(filterInbox(all, 'mine')).toHaveLength(1);
  });

  it('titles a change by course and kind', () => {
    expect(changeTitle(note())).toBe('Database Systems — Class timing change');
    expect(changeTitle(note({ changeKind: 'deletion', courseName: null }))).toBe('CS101 — Class cancelled');
    expect(changeTitle(note({ changeKind: 'addition' }))).toBe('Database Systems — Class added');
  });

  it('says who reported and who approved, and never mentions the professor', () => {
    expect(provenance(note())).toBe('Reported by Asha Menon and approved by the developer.');
    expect(provenance(note({ corrected: true }))).toBe('Reported by Asha Menon and approved, with corrections, by the developer.');
    expect(provenance(note({ reportedBy: null }))).toBe('Reported by A student and approved by the developer.');
    for (const text of all.map(provenance)) expect(text.toLowerCase()).not.toContain('professor');
    expect(provenance(note({ kind: 'request_decision', requestStatus: 'rejected' }))).toBe('Your request was not approved.');
    expect(provenance(note({ kind: 'request_decision', approvalMode: 'compulsory' }))).toMatch(/applies to everyone/);
  });
});
