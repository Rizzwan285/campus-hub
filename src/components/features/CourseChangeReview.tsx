import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Check, Inbox, Loader2, PencilLine, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { ApiError } from '@/services/api';
import {
  approveSuggestion, listForReview, rejectSuggestion, type ReviewItem, type SuggestionStatus,
} from '@/services/courseChanges';
import { sameMeetings } from '@/engine/courseTimings';
import { MeetingDiff } from '@/components/features/timetable/MeetingDiff';
import { MeetingRowsEditor } from '@/components/features/timetable/MeetingRowsEditor';
import { fromRows, rowsAreValid, toRows } from '@/components/features/timetable/meetingRows';

const when = (iso: string) =>
  new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/**
 * Students' suggestions to change a course's timings.
 *
 * Approving rewrites the course's official meetings, so the change reaches
 * every student who has the course — including anyone who had set their own
 * timings for it, since those were made against the timings being replaced.
 */
export function CourseChangeReview() {
  const [scope, setScope] = useState<'pending' | 'decided'>('pending');
  const { data, isLoading, isError } = useQuery({
    queryKey: ['admin-course-changes', scope],
    queryFn: () => listForReview(scope),
    staleTime: 15_000,
  });

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-sm font-semibold flex items-center gap-2">
          <Inbox className="h-4 w-4 text-primary" /> Timing suggestions
        </h2>
        <p className="text-[11px] text-muted-foreground mt-1">
          Students send these when a professor moves, adds or cancels a class. Nothing changes for anyone else
          until you approve; approving changes the course for every student who has it.
        </p>
      </div>

      <div className="flex rounded-xl bg-muted/50 p-1 w-fit">
        {(['pending', 'decided'] as const).map((value) => (
          <button
            key={value}
            onClick={() => setScope(value)}
            className={`text-sm font-medium py-1.5 px-3 rounded-lg transition-all ${
              scope === value ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {value === 'pending' ? 'Waiting' : 'Decided'}
          </button>
        ))}
      </div>

      {isLoading ? (
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      ) : isError ? (
        <p className="text-sm text-red-500">Could not load suggestions. Check the API is running.</p>
      ) : !data?.length ? (
        <p className="text-sm text-muted-foreground">
          {scope === 'pending' ? 'Nothing waiting for review.' : 'No decisions yet.'}
        </p>
      ) : scope === 'pending' ? (
        <div className="space-y-3">
          {data.map((item) => (
            <PendingSuggestion key={item.id} item={item} />
          ))}
        </div>
      ) : (
        <DecidedSuggestions items={data} />
      )}
    </div>
  );
}

function PendingSuggestion({ item }: { item: ReviewItem }) {
  const queryClient = useQueryClient();
  const [note, setNote] = useState('');
  const [editing, setEditing] = useState(false);
  const [rows, setRows] = useState(() => toRows(item.proposedMeetings));
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState<'approve' | 'reject' | null>(null);
  const [error, setError] = useState('');

  // Approval replaces whatever is official now, which may not be what the
  // student was looking at when they made the suggestion.
  const current = item.currentMeetings ?? item.baseMeetings;
  const movedSince = item.currentMeetings !== null && !sameMeetings(item.currentMeetings, item.baseMeetings);
  const proposed = editing ? fromRows(rows) : item.proposedMeetings;
  const corrected = editing && !sameMeetings(proposed, item.proposedMeetings);
  const valid = !editing || (rows.length > 0 && rowsAreValid(rows));

  const refresh = () => {
    for (const key of ['admin-course-changes', 'admin-course-changes-count', 'admin-customizations', 'admin-audit']) {
      void queryClient.invalidateQueries({ queryKey: [key] });
    }
  };

  const approve = async () => {
    if (!confirming) {
      setConfirming(true);
      return;
    }
    setBusy('approve');
    setError('');
    try {
      const result = await approveSuggestion(item.id, note, corrected ? proposed : undefined);
      toast.success(
        `${item.courseCode} updated for everyone` +
          (result.alsoClosed > 0 ? ` · ${plural(result.alsoClosed, 'other suggestion')} for it closed` : ''),
      );
      refresh();
    } catch (failure) {
      setError(failure instanceof ApiError ? failure.message : 'Approval failed. Is the API reachable?');
      setConfirming(false);
    } finally {
      setBusy(null);
    }
  };

  const reject = async () => {
    setBusy('reject');
    setError('');
    try {
      await rejectSuggestion(item.id, note);
      toast.success(`Suggestion for ${item.courseCode} rejected.`);
      refresh();
    } catch (failure) {
      setError(failure instanceof ApiError ? failure.message : 'Rejecting failed. Is the API reachable?');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="rounded-xl border border-border/60 p-4 space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <div className="font-semibold">
          {item.courseCode}
          {item.courseName && <span className="font-normal text-muted-foreground"> — {item.courseName}</span>}
        </div>
        <span className="text-xs text-muted-foreground">#{item.id} · {when(item.createdAt)}</span>
      </div>

      <p className="text-xs text-muted-foreground">
        From <span className="font-medium text-foreground">{item.requesterRoll}</span>
        {item.requesterName && ` (${item.requesterName})`} · {plural(item.enrolledCount, 'student')} with this
        course
        {item.personalEditCount > 0 && ` · ${item.personalEditCount} with their own timings for it`}
      </p>

      {item.note && (
        <blockquote className="text-sm border-l-2 border-primary/40 pl-3 italic text-foreground/90">
          {item.note}
        </blockquote>
      )}

      {movedSince && (
        <p className="flex items-start gap-2 text-xs rounded-lg px-3 py-2 bg-amber-500/10 border border-amber-500/30">
          <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />
          The official timings changed after this was suggested. The comparison below is against the timings in
          force now, which is what approving would replace.
        </p>
      )}

      <div className="rounded-lg bg-muted/40 p-3">
        <div className="text-xs font-semibold mb-1.5 text-muted-foreground uppercase tracking-wide">
          {corrected ? 'What approving would change (with your corrections)' : 'What approving would change'}
        </div>
        <MeetingDiff before={current} after={proposed} />
      </div>

      {editing && <MeetingRowsEditor rows={rows} onChange={setRows} template={item.proposedMeetings[0]} />}

      <input
        value={note}
        maxLength={500}
        onChange={(event) => setNote(event.target.value)}
        placeholder="Note to the student (optional)"
        className="w-full px-3.5 py-2 rounded-xl bg-background border border-border text-sm"
      />

      {error && (
        <p className="text-sm text-red-500 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{error}</p>
      )}

      <div className="flex flex-wrap gap-2">
        <Button onClick={() => void approve()} disabled={busy !== null || !valid} className="rounded-xl">
          {busy === 'approve' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          {confirming
            ? `Confirm: change it for ${plural(item.enrolledCount, 'student')}`
            : 'Approve for everyone'}
        </Button>
        <Button
          variant="outline"
          onClick={() => {
            setEditing((open) => !open);
            setRows(toRows(item.proposedMeetings));
            setConfirming(false);
          }}
          disabled={busy !== null}
          className="rounded-xl"
        >
          <PencilLine className="h-4 w-4" /> {editing ? 'Discard corrections' : 'Correct before approving'}
        </Button>
        <Button
          variant="ghost"
          onClick={() => void reject()}
          disabled={busy !== null}
          className="rounded-xl text-red-500 hover:text-red-600"
        >
          {busy === 'reject' ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />} Reject
        </Button>
      </div>
    </div>
  );
}

const STATUS_STYLE: Record<SuggestionStatus, string> = {
  pending: 'bg-muted text-muted-foreground',
  approved: 'bg-green-500/10 text-green-700 dark:text-green-400',
  rejected: 'bg-red-500/10 text-red-600 dark:text-red-400',
  withdrawn: 'bg-muted text-muted-foreground',
  superseded: 'bg-amber-500/10 text-amber-700 dark:text-amber-400',
};

function DecidedSuggestions({ items }: { items: ReviewItem[] }) {
  return (
    <ul className="space-y-1.5 max-h-[32rem] overflow-y-auto">
      {items.map((item) => (
        <li key={item.id} className="border-b border-border/40 pb-1.5">
          <details>
            <summary className="flex flex-wrap items-center gap-x-2 gap-y-1 cursor-pointer text-sm py-1">
              <span className={`text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded ${STATUS_STYLE[item.status]}`}>
                {item.status}
              </span>
              <span className="font-medium">{item.courseCode}</span>
              <span className="text-muted-foreground text-xs">{item.requesterRoll}</span>
              <span className="text-xs text-muted-foreground ml-auto">
                {when(item.decidedAt ?? item.createdAt)}
              </span>
            </summary>
            <div className="mt-2 mb-1 space-y-2 pl-1">
              {item.note && <p className="text-sm italic text-foreground/90">{item.note}</p>}
              {item.decisionNote && (
                <p className="text-xs text-muted-foreground">
                  Decision note{item.decidedByRoll ? ` (${item.decidedByRoll})` : ''}: {item.decisionNote}
                </p>
              )}
              <MeetingDiff before={item.baseMeetings} after={item.appliedMeetings ?? item.proposedMeetings} />
            </div>
          </details>
        </li>
      ))}
    </ul>
  );
}
