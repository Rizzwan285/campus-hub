import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Check, Inbox, Loader2, Mail, PencilLine, Users, UserCheck, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { ApiError } from '@/services/api';
import {
  approveSuggestion, closeOptionalChange, getEmailStatus, listForReview, rejectSuggestion, retryEmails,
  type ApprovalMode, type ReviewItem, type SuggestionStatus,
} from '@/services/courseChanges';
import { deltaBetween, changeKind, meetingsFingerprint, sameMeetings } from '@/engine/courseTimings';
import { DeltaView, MeetingDiff } from '@/components/features/timetable/MeetingDiff';
import { MeetingRowsEditor } from '@/components/features/timetable/MeetingRowsEditor';
import { fromRows, rowsAreValid, toRows } from '@/components/features/timetable/meetingRows';

const when = (iso: string) =>
  new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

const KIND_LABEL = { addition: 'Addition', deletion: 'Deletion', modification: 'Modification' } as const;

const refreshKeys = ['admin-course-changes', 'admin-course-changes-count', 'admin-customizations', 'admin-audit', 'admin-emails'];

/**
 * Students' requests to change a course's timings.
 *
 * Each can be approved two ways - as an optional update every student decides
 * on for themselves, or as an official change applied to everyone - or
 * rejected. Nothing changes for anyone until one of those is chosen here.
 */
export function CourseChangeReview({ focusRequestId }: { focusRequestId?: number | null }) {
  const [scope, setScope] = useState<'pending' | 'decided'>('pending');
  const { data, isLoading, isError } = useQuery({
    queryKey: ['admin-course-changes', scope],
    queryFn: () => listForReview(scope),
    staleTime: 15_000,
  });

  // A request opened from the notification email may already be decided, in
  // which case it is in the history. Checked once, when the link is opened:
  // deciding it here must not then pull the reviewer away from the queue.
  const focusChecked = useRef(false);
  useEffect(() => {
    if (focusChecked.current || !focusRequestId || !data || scope !== 'pending') return;
    focusChecked.current = true;
    if (!data.some((item) => item.id === focusRequestId)) setScope('decided');
  }, [focusRequestId, data, scope]);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-sm font-semibold flex items-center gap-2">
          <Inbox className="h-4 w-4 text-primary" /> Timetable change requests
        </h2>
        <p className="text-[11px] text-muted-foreground mt-1">
          Students send these when a professor moves, adds or cancels a class. Nothing changes for anyone until
          you decide. <strong>Optional</strong> lets each student accept or decline it for themselves;{' '}
          <strong>Apply to everyone</strong> makes it the official timetable.
        </p>
      </div>

      <EmailStatusLine />

      <div className="flex rounded-xl bg-muted/50 p-1 w-fit">
        {(['pending', 'decided'] as const).map((value) => (
          <button
            key={value}
            onClick={() => setScope(value)}
            className={`text-sm font-medium py-1.5 px-3 rounded-lg transition-all ${
              scope === value ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {value === 'pending' ? 'Waiting' : 'History'}
          </button>
        ))}
      </div>

      {isLoading ? (
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      ) : isError ? (
        <p className="text-sm text-red-500">Could not load requests. Check the API is running.</p>
      ) : !data?.length ? (
        <p className="text-sm text-muted-foreground">
          {scope === 'pending' ? 'Nothing waiting for review.' : 'No decisions yet.'}
        </p>
      ) : scope === 'pending' ? (
        <div className="space-y-3">
          {data.map((item) => (
            <PendingRequest key={item.id} item={item} focused={item.id === focusRequestId} />
          ))}
        </div>
      ) : (
        <DecidedRequests items={data} focusRequestId={focusRequestId} />
      )}
    </div>
  );
}

/** Whether request emails are being delivered, with a way to retry the ones that failed. */
function EmailStatusLine() {
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const { data } = useQuery({ queryKey: ['admin-emails'], queryFn: getEmailStatus, staleTime: 30_000, retry: false });
  if (!data) return null;

  const stuck = data.outbox.filter((entry) => entry.status === 'failed' || (entry.status === 'pending' && entry.attempts > 0));
  const retry = async () => {
    setBusy(true);
    try {
      const result = await retryEmails();
      toast.success(result.sent > 0 ? `${plural(result.sent, 'email')} sent.` : 'Still not delivered; see the error below.');
    } catch {
      toast.error('Retry failed. Is the API reachable?');
    } finally {
      setBusy(false);
      void queryClient.invalidateQueries({ queryKey: ['admin-emails'] });
      void queryClient.invalidateQueries({ queryKey: ['admin-course-changes'] });
    }
  };

  if (!data.configured) {
    return (
      <p className="flex items-start gap-2 text-xs rounded-lg px-3 py-2 bg-muted/50 border border-border text-muted-foreground">
        <Mail className="h-4 w-4 shrink-0" />
        Email notifications are off, so new requests only appear here. To get an email for each one, set{' '}
        {data.missing.join(', ')} on the API.
      </p>
    );
  }
  if (stuck.length === 0) {
    return (
      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <Mail className="h-3.5 w-3.5" /> You are emailed about each new request ({data.provider}).
      </p>
    );
  }
  return (
    <div className="text-xs rounded-lg px-3 py-2 bg-amber-500/10 border border-amber-500/30 space-y-1.5">
      <p className="flex items-start gap-2">
        <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />
        {plural(stuck.length, 'notification email')} could not be delivered. The requests themselves are safe
        and listed below.
      </p>
      {stuck[0].lastError && <p className="font-mono text-[11px] text-muted-foreground break-words">{stuck[0].lastError}</p>}
      <Button size="sm" variant="outline" onClick={() => void retry()} disabled={busy} className="h-7 rounded-lg">
        {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Retry delivery
      </Button>
    </div>
  );
}

function PendingRequest({ item, focused }: { item: ReviewItem; focused: boolean }) {
  const queryClient = useQueryClient();
  const ref = useRef<HTMLDivElement>(null);
  const [note, setNote] = useState('');
  const [editing, setEditing] = useState(false);
  const [rows, setRows] = useState(() => toRows(item.proposedMeetings));
  const [confirm, setConfirm] = useState<ApprovalMode | null>(null);
  const [busy, setBusy] = useState<ApprovalMode | 'reject' | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (focused) ref.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [focused]);

  // Approval changes whatever is official now, which may not be what the
  // student was looking at when they made the request.
  const current = item.currentMeetings ?? item.baseMeetings;
  const movedSince = item.currentMeetings !== null && !sameMeetings(item.currentMeetings, item.baseMeetings);
  const proposed = editing ? fromRows(rows) : item.proposedMeetings;
  const corrected = editing && !sameMeetings(proposed, item.proposedMeetings);
  const valid = !editing || (rows.length > 0 && rowsAreValid(rows));
  const delta = deltaBetween(current, proposed);
  const nothingToDo = delta.remove.length === 0 && delta.add.length === 0;
  const kind = changeKind(delta);

  const refresh = () => {
    for (const key of refreshKeys) void queryClient.invalidateQueries({ queryKey: [key] });
  };

  const approve = async (mode: ApprovalMode) => {
    setConfirm(null);
    setBusy(mode);
    setError('');
    try {
      const result = await approveSuggestion(item.id, note, {
        mode,
        meetings: corrected ? proposed : undefined,
        // Refused by the server if the official timings moved since this was shown.
        expectedFingerprint: item.currentMeetings ? meetingsFingerprint(item.currentMeetings) : undefined,
      });
      toast.success(
        mode === 'optional'
          ? `Offered to ${plural(result.notified, 'student')} with ${item.courseCode} as an optional update.`
          : `${item.courseCode} updated for everyone` +
              (result.alsoClosed > 0 ? ` · ${plural(result.alsoClosed, 'other request')} for it closed` : ''),
      );
      refresh();
    } catch (failure) {
      setError(failure instanceof ApiError ? failure.message : 'Approval failed. Is the API reachable?');
      if (failure instanceof ApiError && failure.status === 409) refresh();
    } finally {
      setBusy(null);
    }
  };

  const reject = async () => {
    setBusy('reject');
    setError('');
    try {
      await rejectSuggestion(item.id, note);
      toast.success(`Request for ${item.courseCode} rejected.`);
      refresh();
    } catch (failure) {
      setError(failure instanceof ApiError ? failure.message : 'Rejecting failed. Is the API reachable?');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div ref={ref} className={`rounded-xl border p-4 space-y-3 ${focused ? 'border-primary ring-1 ring-primary/40' : 'border-border/60'}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <div className="font-semibold">
          {item.courseCode}
          {item.courseName && <span className="font-normal text-muted-foreground"> — {item.courseName}</span>}
        </div>
        <span className="text-xs text-muted-foreground">
          #{item.id} · {KIND_LABEL[kind]} · {when(item.createdAt)}
        </span>
      </div>

      <p className="text-xs text-muted-foreground">
        From <span className="font-medium text-foreground">{item.requesterName || 'Unnamed student'}</span> (
        {item.requesterRoll}){item.semesterName ? ` · ${item.semesterName}` : ''} ·{' '}
        {plural(item.enrolledCount, 'student')} with this course
        {item.personalEditCount > 0 && ` · ${item.personalEditCount} with their own timings for it`}
      </p>

      {item.note ? (
        <blockquote className="text-sm border-l-2 border-primary/40 pl-3 italic text-foreground/90">{item.note}</blockquote>
      ) : (
        <p className="text-xs text-muted-foreground">No explanation was given.</p>
      )}

      {movedSince && (
        <p className="flex items-start gap-2 text-xs rounded-lg px-3 py-2 bg-amber-500/10 border border-amber-500/30">
          <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />
          The official timings changed after this was requested. The comparison below is against the timings in
          force now.
        </p>
      )}

      <div className="rounded-lg bg-muted/40 p-3">
        <div className="text-xs font-semibold mb-1.5 text-muted-foreground uppercase tracking-wide">
          Before → after{corrected ? ' (with your corrections)' : ''}
        </div>
        <MeetingDiff before={current} after={proposed} />
      </div>

      {editing && <MeetingRowsEditor rows={rows} onChange={setRows} template={item.proposedMeetings[0]} />}

      <input
        value={note}
        maxLength={500}
        onChange={(event) => setNote(event.target.value)}
        placeholder="Note to the student — shown with your decision (optional)"
        className="w-full px-3.5 py-2 rounded-xl bg-background border border-border text-sm"
      />

      {nothingToDo && (
        <p className="text-xs text-muted-foreground">
          This is already the official timetable, so there is nothing to approve. Correct it or reject it.
        </p>
      )}
      {error && (
        <p className="text-sm text-red-500 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{error}</p>
      )}

      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          onClick={() => void approve('optional')}
          disabled={busy !== null || !valid || nothingToDo}
          title="Students who have the course each choose whether to use it. The official timetable is not changed."
          className="rounded-xl"
        >
          {busy === 'optional' ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserCheck className="h-4 w-4" />}
          Approve (Optional)
        </Button>
        <Button
          onClick={() => setConfirm('compulsory')}
          disabled={busy !== null || !valid || nothingToDo}
          title="Becomes the official timetable for everyone who has the course, now or later."
          className="rounded-xl"
        >
          {busy === 'compulsory' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Users className="h-4 w-4" />}
          Approve (Apply to Everyone)
        </Button>
        <Button
          variant="ghost"
          onClick={() => void reject()}
          disabled={busy !== null}
          className="rounded-xl text-red-500 hover:text-red-600"
        >
          {busy === 'reject' ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />} Reject
        </Button>
        <Button
          variant="ghost"
          onClick={() => {
            setEditing((open) => !open);
            setRows(toRows(item.proposedMeetings));
          }}
          disabled={busy !== null}
          className="rounded-xl"
        >
          <PencilLine className="h-4 w-4" /> {editing ? 'Discard corrections' : 'Correct first'}
        </Button>
      </div>

      <AlertDialog open={confirm === 'compulsory'} onOpenChange={(open) => !open && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Make this the official timetable for {item.courseCode}?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 text-sm text-muted-foreground">
                <p>
                  It applies to {plural(item.enrolledCount, 'student')} who {item.enrolledCount === 1 ? 'has' : 'have'}{' '}
                  the course now, and to everyone who selects it later. Students are told about it but are not
                  asked: there is no Accept or Reject for an official change.
                </p>
                <div className="rounded-lg bg-muted/40 p-2 text-foreground">
                  <DeltaView delta={delta} />
                </div>
                {item.personalEditCount > 0 && (
                  <p>
                    {plural(item.personalEditCount, 'student')} with their own timings for this course will see
                    the new official ones and can re-apply their own.
                  </p>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void approve('compulsory')}>
              <Check className="h-4 w-4" /> Apply to everyone
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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

function decisionLabel(item: ReviewItem): string {
  if (item.status !== 'approved') return item.status;
  return item.approvalMode === 'optional' ? 'optional' : 'for everyone';
}

function DecidedRequests({ items, focusRequestId }: { items: ReviewItem[]; focusRequestId?: number | null }) {
  const queryClient = useQueryClient();
  const close = async (item: ReviewItem) => {
    try {
      await closeOptionalChange(item.id, '');
      toast.success(`${item.courseCode}: the optional update is no longer offered.`);
      void queryClient.invalidateQueries({ queryKey: ['admin-course-changes'] });
    } catch (failure) {
      toast.error(failure instanceof ApiError ? failure.message : 'Could not reach the API.');
    }
  };

  return (
    <ul className="space-y-1.5 max-h-[36rem] overflow-y-auto">
      {items.map((item) => (
        <li key={item.id} className="border-b border-border/40 pb-1.5">
          <details open={item.id === focusRequestId}>
            <summary className="flex flex-wrap items-center gap-x-2 gap-y-1 cursor-pointer text-sm py-1">
              <span className={`text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded ${STATUS_STYLE[item.status]}`}>
                {decisionLabel(item)}
              </span>
              <span className="font-medium">{item.courseCode}</span>
              <span className="text-muted-foreground text-xs">
                #{item.id} · {item.requesterName || item.requesterRoll}
              </span>
              <span className="text-xs text-muted-foreground ml-auto">{when(item.decidedAt ?? item.createdAt)}</span>
            </summary>
            <div className="mt-2 mb-1 space-y-2 pl-1">
              <p className="text-xs text-muted-foreground">
                Requested {when(item.createdAt)} by {item.requesterName || 'a student'} ({item.requesterRoll})
                {item.semesterName ? ` · ${item.semesterName}` : ''}
                {item.changeKind ? ` · ${KIND_LABEL[item.changeKind]}` : ''}
                {item.decidedByRoll ? ` · decided by ${item.decidedByRoll}` : ''}
                {item.corrected ? ' · corrected before approval' : ''}
              </p>
              {item.note && <p className="text-sm italic text-foreground/90">{item.note}</p>}
              {item.decisionNote && <p className="text-xs text-muted-foreground">Decision note: {item.decisionNote}</p>}
              {item.delta ? (
                <DeltaView delta={item.delta} />
              ) : (
                <MeetingDiff before={item.baseMeetings} after={item.appliedMeetings ?? item.proposedMeetings} />
              )}
              {item.approvalMode === 'optional' && item.responses && (
                <p className="text-xs text-muted-foreground">
                  Offered to {plural(item.responses.notified, 'student')}: {item.responses.accepted} accepted,{' '}
                  {item.responses.rejected} declined,{' '}
                  {Math.max(0, item.responses.notified - item.responses.accepted - item.responses.rejected)} undecided
                  {item.proposalState && item.proposalState !== 'open' ? ` · ${item.proposalStateNote ?? item.proposalState}` : ''}
                </p>
              )}
              {item.approvalMode === 'optional' && item.proposalState === 'open' && (
                <Button size="sm" variant="outline" onClick={() => void close(item)} className="h-7 rounded-lg">
                  Stop offering this update
                </Button>
              )}
            </div>
          </details>
        </li>
      ))}
    </ul>
  );
}
