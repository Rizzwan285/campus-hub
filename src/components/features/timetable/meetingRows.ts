import { meetingProblem } from '@/engine/courseTimings';
import type { TimetableMeeting } from '@/engine/types';

/** A meeting being edited, with a stable key so React keeps inputs in place. */
export interface MeetingRow extends TimetableMeeting {
  key: string;
}

let nextKey = 0;
export const newRowKey = () => `meeting-${(nextKey += 1)}`;

export function toRows(meetings: TimetableMeeting[]): MeetingRow[] {
  return meetings.map((meeting) => ({ ...meeting, key: newRowKey() }));
}

export function fromRows(rows: MeetingRow[]): TimetableMeeting[] {
  return rows.map(({ key: _key, ...meeting }) => ({ ...meeting, room: meeting.room.trim() }));
}

export function rowsAreValid(rows: MeetingRow[]): boolean {
  return rows.every((row) => meetingProblem(row) === null);
}
