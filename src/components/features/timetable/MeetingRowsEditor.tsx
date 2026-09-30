import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { WEEK_DAYS, meetingProblem } from '@/engine/courseTimings';
import type { TimetableMeeting } from '@/engine/types';
import { newRowKey, type MeetingRow } from './meetingRows';

const TYPES: Array<{ value: TimetableMeeting['type']; label: string }> = [
  { value: 'lecture', label: 'Lecture' },
  { value: 'tutorial', label: 'Tutorial' },
  { value: 'lab', label: 'Lab' },
];

const field = 'px-2.5 py-2 rounded-lg bg-background border border-border text-sm';

interface MeetingRowsEditorProps {
  rows: MeetingRow[];
  onChange: (rows: MeetingRow[]) => void;
  /** A new class starts with this one's room and instructors — usually the course's first. */
  template?: TimetableMeeting;
}

/** Add, remove and move a course's classes. */
export function MeetingRowsEditor({ rows, onChange, template }: MeetingRowsEditorProps) {
  const update = (key: string, patch: Partial<TimetableMeeting>) =>
    onChange(rows.map((row) => (row.key === key ? { ...row, ...patch } : row)));

  const add = () => {
    const last = rows[rows.length - 1];
    onChange([
      ...rows,
      {
        key: newRowKey(),
        type: 'lecture',
        day: last?.day ?? 'Monday',
        startTime: '09:00',
        endTime: '09:50',
        room: template?.room ?? '',
        instructors: template?.instructors ?? [],
        recurrence: { type: 'weekly' },
      },
    ]);
  };

  return (
    <div className="space-y-2">
      {rows.length === 0 && (
        <p className="text-sm text-muted-foreground rounded-xl border border-dashed border-border px-3 py-4 text-center">
          No classes. Add one below.
        </p>
      )}

      {rows.map((row) => {
        const problem = meetingProblem(row);
        return (
          <div key={row.key} className="rounded-xl border border-border/60 bg-card p-2.5 space-y-2">
            <div className="flex gap-2">
              <select
                aria-label="Class type"
                value={row.type}
                onChange={(event) => update(row.key, { type: event.target.value as TimetableMeeting['type'] })}
                className={`${field} flex-1 min-w-0`}
              >
                {TYPES.map((type) => (
                  <option key={type.value} value={type.value}>{type.label}</option>
                ))}
              </select>
              <select
                aria-label="Day"
                value={row.day}
                onChange={(event) => update(row.key, { day: event.target.value as TimetableMeeting['day'] })}
                className={`${field} flex-1 min-w-0`}
              >
                {WEEK_DAYS.map((day) => (
                  <option key={day} value={day}>{day}</option>
                ))}
              </select>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Remove this class"
                title="Remove this class"
                onClick={() => onChange(rows.filter((other) => other.key !== row.key))}
                className="shrink-0 text-muted-foreground hover:text-red-500"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <input
                type="time"
                aria-label="Starts"
                value={row.startTime}
                onChange={(event) => update(row.key, { startTime: event.target.value })}
                className={`${field} w-[8.5rem]`}
              />
              <span className="text-muted-foreground text-sm">to</span>
              <input
                type="time"
                aria-label="Ends"
                value={row.endTime}
                onChange={(event) => update(row.key, { endTime: event.target.value })}
                className={`${field} w-[8.5rem]`}
              />
              <input
                aria-label="Room"
                value={row.room}
                maxLength={120}
                onChange={(event) => update(row.key, { room: event.target.value })}
                placeholder="Room"
                className={`${field} flex-1 min-w-[8rem]`}
              />
            </div>

            {problem && <p className="text-xs text-red-500">{problem}</p>}
          </div>
        );
      })}

      <Button variant="outline" size="sm" onClick={add} disabled={rows.length >= 40} className="rounded-lg">
        <Plus className="h-4 w-4" /> Add a class
      </Button>
    </div>
  );
}
