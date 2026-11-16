import { diffMeetings, type MeetingChange, type MeetingDelta } from '@/engine/courseTimings';
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

const shortDate = (date: string) =>
  new Date(`${date}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });

/** "Mon" for a weekly class, "Sat 21 Nov" for a one-time one, "Mon · alt" for alternate weeks. */
function meetingWhen(meeting: TimetableMeeting): string {
  const day = meeting.day.slice(0, 3);
  if (meeting.recurrence?.type === 'once' && meeting.date) return `${day} ${shortDate(meeting.date)}`;
  if (meeting.recurrence?.type === 'biweekly_odd' || meeting.recurrence?.type === 'biweekly_even') return `${day} · alt`;
  return day;
}

function ChangeLine({ change }: { change: MeetingChange }) {
  const style = STYLE[change.kind];
  const { meeting } = change;
  const once = meeting.recurrence?.type === 'once';
  return (
    <li className={`flex items-baseline gap-2 rounded-md px-2 py-1 ${style.className}`}>
      <span className="w-3 shrink-0 font-mono font-bold" aria-hidden="true">{style.symbol}</span>
      <span className="sr-only">{style.label}:</span>
      <span className="w-16 shrink-0 capitalize">{meeting.type}</span>
      <span className={`${once ? 'w-[5.5rem]' : 'w-14'} shrink-0`}>{meetingWhen(meeting)}</span>
      <span className="shrink-0 font-mono text-xs">
        {meeting.startTime}–{meeting.endTime}
      </span>
      <span className="min-w-0 truncate text-xs opacity-80" title={meeting.room}>
        {meeting.room}
        {meeting.batches ? ` (${meeting.batches})` : ''}
      </span>
    </li>
  );
}

/** What a change does to a course's classes, one line per class, in weekly order. */
export function MeetingDiff({ before, after }: { before: TimetableMeeting[]; after: TimetableMeeting[] }) {
  const changes = diffMeetings(before, after);

  if (changes.length === 0) {
    return <p className="text-sm text-muted-foreground">No classes either way.</p>;
  }

  return (
    <ul className="space-y-0.5 text-sm">
      {changes.map((change, index) => (
        <ChangeLine key={index} change={change} />
      ))}
    </ul>
  );
}

/** Only the classes a change touches: what goes, then what comes. */
export function DeltaView({ delta }: { delta: MeetingDelta }) {
  const changes: MeetingChange[] = [
    ...delta.remove.map((meeting) => ({ kind: 'removed' as const, meeting })),
    ...delta.add.map((meeting) => ({ kind: 'added' as const, meeting })),
  ];
  if (changes.length === 0) return <p className="text-sm text-muted-foreground">No classes change.</p>;
  return (
    <ul className="space-y-0.5 text-sm">
      {changes.map((change, index) => (
        <ChangeLine key={index} change={change} />
      ))}
    </ul>
  );
}
