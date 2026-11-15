import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, Check, CheckCircle2, Info, Loader2, ShieldCheck, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { ApiError } from '@/services/api';
import {
  listNotifications, markNotifications, respondToNotification, type TimetableNotification,
} from '@/services/notifications';
import {
  alertsToShow, awaitsAnswer, canAccept, changeTitle, filterInbox, provenance, unreadCount, type InboxFilter,
} from '@/lib/notifications';
import { useTimetableStore } from '@/store/useTimetableStore';
import { useAuthStore } from '@/store/useAuthStore';
import { DeltaView } from '@/components/features/timetable/MeetingDiff';

const QUERY_KEY = ['notifications'];

const when = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : '';

const FILTERS: Array<{ value: InboxFilter; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'to-answer', label: 'To answer' },
  { value: 'official', label: 'Official' },
  { value: 'mine', label: 'My requests' },
];

/**
 * Accepts or declines an optional change.
 *
 * Accepting works out what the change does to the student's own timetable -
 * only the classes it names - records the answer and that result together on
 * the server, and only then changes the timetable on screen. If the class it
 * moves is no longer where the change expects, nothing is applied.
 */
function useRespond() {
  const queryClient = useQueryClient();
  const previewProposal = useTimetableStore((state) => state.previewProposal);
  const saveCourseOverride = useTimetableStore((state) => state.saveCourseOverride);
  const refreshCourses = useTimetableStore((state) => state.refreshCourses);
  const [busy, setBusy] = useState<number | null>(null);

  const respond = async (notification: TimetableNotification, response: 'accepted' | 'rejected') => {
    setBusy(notification.id);
    try {
      if (response === 'rejected') {
        await respondToNotification(notification.id, 'rejected');
        toast.success(`Kept your current timings for ${notification.courseCode}.`);
        return;
      }

      const outcome = notification.delta
        ? previewProposal(notification.courseCode, notification.delta)
        : { status: 'outdated' as const, missing: [] };
      if (outcome.status === 'outdated') {
        // The official timings may simply be newer than the page has loaded.
        void refreshCourses();
        toast.error(
          `${notification.courseCode} no longer has the class this change moves, so it was not applied. ` +
            'Open Edit timings to change it yourself.',
        );
        return;
      }

      const override =
        outcome.status === 'applied' && outcome.baseFingerprint
          ? { meetings: outcome.meetings, baseFingerprint: outcome.baseFingerprint }
          : undefined;
      await respondToNotification(notification.id, 'accepted', override);
      if (override) saveCourseOverride(notification.courseCode, override.meetings);
      toast.success(
        outcome.status === 'already'
          ? `${notification.courseCode} already has this change.`
          : `${notification.courseCode} updated in your timetable.`,
      );
    } catch (failure) {
      toast.error(
        failure instanceof ApiError
          ? failure.message
          : 'Could not save your choice. Check your connection and try again.',
      );
    } finally {
      setBusy(null);
      void queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    }
  };

  return { respond, busy };
}

function StatusChip({ notification }: { notification: TimetableNotification }) {
  const chip = (text: string, className: string) => (
    <span className={`text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded ${className}`}>{text}</span>
  );
  if (notification.kind === 'official_change') return chip('Official', 'bg-primary/10 text-primary');
  if (notification.kind === 'request_decision') {
    return notification.requestStatus === 'rejected'
      ? chip('Not approved', 'bg-red-500/10 text-red-600 dark:text-red-400')
      : chip('Approved', 'bg-green-500/10 text-green-700 dark:text-green-400');
  }
  if (notification.response === 'accepted') return chip('Accepted', 'bg-green-500/10 text-green-700 dark:text-green-400');
  if (notification.proposalState === 'official') return chip('Now official', 'bg-primary/10 text-primary');
  if (notification.proposalState === 'outdated' || notification.proposalState === 'closed') {
    return chip('No longer applies', 'bg-muted text-muted-foreground');
  }
  if (notification.response === 'rejected') return chip('Declined', 'bg-muted text-muted-foreground');
  return chip('Optional', 'bg-amber-500/10 text-amber-700 dark:text-amber-400');
}

function NotificationCard({
  notification, respond, busy,
}: {
  notification: TimetableNotification;
  respond: (notification: TimetableNotification, response: 'accepted' | 'rejected') => void;
  busy: boolean;
}) {
  const optional = notification.kind === 'optional_change';
  return (
    <div className="rounded-xl border border-border/60 bg-card p-3 space-y-2">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <StatusChip notification={notification} />
        <span className="text-[11px] text-muted-foreground">
          {notification.courseCode}
          {notification.semesterName ? ` · ${notification.semesterName}` : ''}
          {notification.decidedAt ? ` · ${when(notification.decidedAt)}` : ''}
        </span>
      </div>
      <p className="text-sm font-semibold leading-snug">{changeTitle(notification)}</p>
      <p className="text-xs text-muted-foreground">{provenance(notification)}</p>

      {notification.delta && (
        <div className="rounded-lg bg-muted/40 p-2">
          <DeltaView delta={notification.delta} />
        </div>
      )}

      {notification.explanation && !notification.mine && (
        <blockquote className="text-xs border-l-2 border-primary/40 pl-2 italic text-foreground/90">
          {notification.explanation}
        </blockquote>
      )}
      {notification.decisionNote && (
        <p className="text-xs text-muted-foreground">Developer&rsquo;s note: {notification.decisionNote}</p>
      )}

      {notification.kind === 'official_change' && (
        <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
          <ShieldCheck className="h-3.5 w-3.5 mt-0.5 shrink-0 text-primary" />
          This is now the official timetable and is already in yours. Nothing to do.
        </p>
      )}
      {optional && notification.proposalState !== 'open' && notification.response !== 'accepted' && (
        <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
          <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
          {notification.proposalStateNote ?? 'This update is no longer open.'}
        </p>
      )}
      {optional && !notification.courseSelected && (
        <p className="text-xs text-muted-foreground">You no longer have this course selected.</p>
      )}
      {optional && notification.response === 'accepted' && (
        <p className="flex items-center gap-1.5 text-xs text-green-700 dark:text-green-400">
          <CheckCircle2 className="h-3.5 w-3.5" /> In your timetable since {when(notification.respondedAt)}.
        </p>
      )}

      {canAccept(notification) && (
        <div className="flex flex-wrap gap-2 pt-1">
          <Button size="sm" disabled={busy} onClick={() => respond(notification, 'accepted')} className="rounded-lg">
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
            Accept change
          </Button>
          {notification.response === null && (
            <Button
              size="sm" variant="outline" disabled={busy}
              onClick={() => respond(notification, 'rejected')} className="rounded-lg"
            >
              <X className="h-3.5 w-3.5" /> Reject change
            </Button>
          )}
          {notification.response === 'rejected' && (
            <span className="text-[11px] text-muted-foreground self-center">You declined this; you can still accept it.</span>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * The bell in the header, the inbox it opens, and the one alert a student
 * gets for changes to courses they already had.
 *
 * However many updates are waiting, there is a single dialog listing them -
 * never a queue of popups - and it appears once: closing it without deciding
 * leaves everything in the inbox, marked by the bell.
 */
export function NotificationCenter() {
  const account = useAuthStore((state) => state.account);
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<InboxFilter>('all');
  const [alertIds, setAlertIds] = useState<number[]>([]);
  const { respond, busy } = useRespond();

  const { data } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: listNotifications,
    enabled: account !== null,
    // Catches an approval made while the app is open; a missed one is simply
    // there on the next visit, because the server keeps the inbox.
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
    retry: false,
  });
  const notifications = useMemo(() => data ?? [], [data]);

  useEffect(() => {
    const refresh = () => void queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    window.addEventListener('campus:notifications-changed', refresh);
    return () => window.removeEventListener('campus:notifications-changed', refresh);
  }, [queryClient]);

  // Open the alert once for whatever is waiting. Entries stay in the dialog
  // until it closes, so answering one does not make the rest jump around.
  useEffect(() => {
    if (alertIds.length > 0 || open) return;
    const waiting = alertsToShow(notifications);
    if (waiting.length > 0) setAlertIds(waiting.map((notification) => notification.id));
  }, [notifications, alertIds.length, open]);

  const alerts = notifications.filter((notification) => alertIds.includes(notification.id));
  const unread = unreadCount(notifications);
  const toAnswer = notifications.filter(awaitsAnswer).length;

  const closeAlert = () => {
    const ids = alertIds;
    setAlertIds([]);
    if (ids.length === 0) return;
    void markNotifications(ids, { alertSeen: true, read: true })
      .catch(() => undefined)
      .finally(() => void queryClient.invalidateQueries({ queryKey: QUERY_KEY }));
  };

  const openInbox = () => {
    setOpen(true);
    if (unread > 0) {
      void markNotifications('all', { read: true })
        .catch(() => undefined)
        .finally(() => void queryClient.invalidateQueries({ queryKey: QUERY_KEY }));
    }
  };

  if (!account) return null;
  const shown = filterInbox(notifications, filter);
  const optionalAlerts = alerts.filter((notification) => notification.kind === 'optional_change').length;

  return (
    <>
      <Button
        variant="outline"
        size="icon"
        onClick={openInbox}
        className="relative rounded-xl h-9 w-9 border-border/60 hover:bg-muted hover:text-foreground"
        title={unread > 0 ? `${unread} new timetable update${unread === 1 ? '' : 's'}` : 'Timetable updates'}
        aria-label={unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'}
      >
        <Bell className="h-4 w-4" />
        {(unread > 0 || toAnswer > 0) && (
          <span
            className={`absolute -top-1 -right-1 min-w-[1.1rem] h-[1.1rem] px-1 rounded-full text-[10px] font-bold flex items-center justify-center ${
              unread > 0 ? 'bg-primary text-primary-foreground' : 'bg-amber-500 text-black'
            }`}
          >
            {unread > 0 ? unread : toAnswer}
          </span>
        )}
      </Button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent className="w-full sm:max-w-md overflow-y-auto">
          <SheetHeader className="text-left">
            <SheetTitle>Timetable updates</SheetTitle>
            <SheetDescription>
              Changes reported by students and approved by the developer. Optional ones are yours to accept or
              decline; official ones are already in your timetable.
            </SheetDescription>
          </SheetHeader>

          <div className="flex flex-wrap gap-1 rounded-xl bg-muted/50 p-1 w-fit my-4">
            {FILTERS.map((entry) => (
              <button
                key={entry.value}
                onClick={() => setFilter(entry.value)}
                className={`text-xs font-medium py-1.5 px-2.5 rounded-lg transition-all ${
                  filter === entry.value ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {entry.label}
                {entry.value === 'to-answer' && toAnswer > 0 ? ` (${toAnswer})` : ''}
              </button>
            ))}
          </div>

          {shown.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">
              {notifications.length === 0 ? 'No timetable updates yet.' : 'Nothing here.'}
            </p>
          ) : (
            <div className="space-y-3 pb-6">
              {shown.map((notification) => (
                <NotificationCard
                  key={notification.id}
                  notification={notification}
                  respond={(target, response) => void respond(target, response)}
                  busy={busy === notification.id}
                />
              ))}
            </div>
          )}
        </SheetContent>
      </Sheet>

      <Dialog open={alerts.length > 0} onOpenChange={(next) => !next && closeAlert()}>
        <DialogContent className="max-w-lg max-h-[88vh] overflow-y-auto">
          <DialogHeader className="text-left">
            <DialogTitle>
              {alerts.length === 1 ? changeTitle(alerts[0]) : `${alerts.length} timetable updates for your courses`}
            </DialogTitle>
            <DialogDescription>
              {optionalAlerts > 0
                ? 'Reported by students and approved by the developer, not confirmed by your professor through this app. ' +
                  'Accept a change to use it in your timetable, or reject it to keep your current timings.'
                : 'The official timetable changed. These are already in your timetable.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {alerts.map((notification) => (
              <NotificationCard
                key={notification.id}
                notification={notification}
                respond={(target, response) => void respond(target, response)}
                busy={busy === notification.id}
              />
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeAlert} className="rounded-xl">
              {alerts.some(awaitsAnswer) ? 'Decide later' : 'Done'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
