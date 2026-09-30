import { diffMeetings, type MeetingChange } from '@/engine/courseTimings';
import type { TimetableMeeting } from '@/engine/types';

const STYLE: Record<MeetingChange['kind'], { symbol: string; label: string; className: string }> = {
  removed: {
    symbol: '−',
    label: 'Removed',
    className: 'bg-red-500/10 text-red-700 dark:text-red-400 line-through decoration-red-500/60',
  },
  added: {
    symbol: '+',
    label: 'Added',
    className: 'bg-green-500/10 text-green-700 dark:text-green-400',
  },
  unchanged: { symbol: '', label: 'Unchanged', className: 'text-muted-foreground' },
};

/** What a change does to a course's classes, one line per class, in weekly order. */
export function MeetingDiff({ before, after }: { before: TimetableMeeting[]; after: TimetableMeeting[] }) {
  const changes = diffMeetings(before, after);

  if (changes.length === 0) {
    return <p className="text-sm text-muted-foreground">No classes either way.</p>;
  }

  return (
    <ul className="space-y-0.5 text-sm">
      {changes.map((change, index) => {
        const style = STYLE[change.kind];
        const { meeting } = change;
        return (
          <li key={index} className={`flex items-baseline gap-2 rounded-md px-2 py-1 ${style.className}`}>
            <span className="w-3 shrink-0 font-mono font-bold" aria-hidden="true">{style.symbol}</span>
            <span className="sr-only">{style.label}:</span>
            <span className="w-16 shrink-0 capitalize">{meeting.type}</span>
            <span className="w-9 shrink-0">{meeting.day.slice(0, 3)}</span>
            <span className="shrink-0 font-mono text-xs">
              {meeting.startTime}–{meeting.endTime}
            </span>
            <span className="min-w-0 truncate text-xs opacity-80" title={meeting.room}>
              {meeting.room}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
