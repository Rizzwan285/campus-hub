import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Clock, Loader2, RotateCcw, Save, Send, ShieldCheck, CheckCircle2, XCircle, Info } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { useTimetableStore } from '@/store/useTimetableStore';
import { useAuthStore } from '@/store/useAuthStore';
import { useUserStore } from '@/store/useUserStore';
import { ApiError, isApiConfigured } from '@/services/api';
import {
  approveSuggestion, listMySuggestions, submitSuggestion, withdrawSuggestion, type CourseChangeRequest,
} from '@/services/courseChanges';
import { overrideStatus, sameMeetings, type CourseOverride } from '@/engine/courseTimings';
import type { CourseOffering, TimetableMeeting } from '@/engine/types';
import { MeetingRowsEditor } from './MeetingRowsEditor';
import { MeetingDiff } from './MeetingDiff';
import { fromRows, rowsAreValid, toRows } from './meetingRows';

interface CourseTimingsEditorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The course to open on; the student can switch to any of their courses. */
  courseCode: string | null;
}

const BATCH_RANGE = /\bB\d+\s*-\s*B\d+\b/i;

const shortDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });

// Long enough for an awake API to answer; a sleeping one takes up to a minute,
// and the editor should not sit behind a spinner for that.
const FRESH_TIMINGS_WAIT_MS = 3000;

/** What the timetable shows for a course: the student's own timings, or the official ones. */
function meetingsShown(
  timetable: {
    loadedCourses: CourseOffering[];
    courseOverrides: Record<string, CourseOverride>;
    coursesAuthoritative: boolean;
  },
  code: string | null,
): TimetableMeeting[] {
  const course = timetable.loadedCourses.find((c) => c.courseCode === code);
  if (!course) return [];
  const own = code ? timetable.courseOverrides[code] : undefined;
  return own && overrideStatus(own, course.meetings, timetable.coursesAuthoritative) === 'active'
    ? own.meetings
    : course.meetings;
}

/**
 * Lets a student correct a course's timings — add a class, drop one, move one.
 *
 * Saving changes only their own timetable, immediately. Suggesting sends the
 * same change to the developer, and only an approval changes the course for
 * everyone who has it. Mounted afresh each time it opens (the parent keys it),
 * so it always starts from what the student currently sees.
 */
export function CourseTimingsEditor({ open, onOpenChange, courseCode }: CourseTimingsEditorProps) {
  const loadedCourses = useTimetableStore((state) => state.loadedCourses);
  const selectedCourseIds = useTimetableStore((state) => state.selectedCourseIds);
  const courseOverrides = useTimetableStore((state) => state.courseOverrides);
  const authoritative = useTimetableStore((state) => state.coursesAuthoritative);
  const saveCourseOverride = useTimetableStore((state) => state.saveCourseOverride);
  const removeCourseOverride = useTimetableStore((state) => state.removeCourseOverride);
  const keepCourseOverride = useTimetableStore((state) => state.keepCourseOverride);
  const refreshCourses = useTimetableStore((state) => state.refreshCourses);
  const account = useAuthStore((state) => state.account);
  const profile = useUserStore((state) => state.profile);
  const queryClient = useQueryClient();

  const myCourses = useMemo(
    () =>
      loadedCourses
        .filter((course) => selectedCourseIds.includes(course.courseCode))
        .sort((a, b) => a.courseCode.localeCompare(b.courseCode)),
    [loadedCourses, selectedCourseIds],
  );

  const meetingsShownFor = (code: string | null) =>
    meetingsShown({ loadedCourses, courseOverrides, coursesAuthoritative: authoritative }, code);

  const [code, setCode] = useState<string | null>(() => courseCode ?? myCourses[0]?.courseCode ?? null);
  const [rows, setRows] = useState(() => toRows(meetingsShownFor(code)));
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState<'suggest' | 'withdraw' | null>(null);
  const [error, setError] = useState('');
  const [checking, setChecking] = useState(() => open && isApiConfigured());

  // The page holds whatever official timings it loaded when it opened: an
  // approval since then is missing from them, and after a cold start they are
  // the bundled ones. A correction is saved against the official timings, so
  // fetch them again first and start the editor from what is in force now.
  useEffect(() => {
    if (!open || !isApiConfigured()) return;

    let settled = false;
    const start = () => {
      if (settled) return;
      settled = true;
      setRows(toRows(meetingsShown(useTimetableStore.getState(), code)));
      setChecking(false);
    };
    const timer = setTimeout(start, FRESH_TIMINGS_WAIT_MS);
    void refreshCourses().finally(() => {
      clearTimeout(timer);
      start();
    });

    return () => {
      settled = true;
      clearTimeout(timer);
    };
    // Once per opening: the parent remounts the editor each time it opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const canSuggest = isApiConfigured() && account !== null;
  const isAdmin = account?.role === 'admin';

  const { data: mySuggestions } = useQuery({
    queryKey: ['course-changes', 'mine'],
    queryFn: listMySuggestions,
    enabled: open && canSuggest,
    staleTime: 30_000,
  });

  const official = loadedCourses.find((course) => course.courseCode === code) ?? null;
  const own = code ? courseOverrides[code] : undefined;
  const ownStatus = own && official ? overrideStatus(own, official.meetings, authoritative) : null;
  const shown = meetingsShownFor(code);
  const latestSuggestion = mySuggestions?.find(
    (request) => request.courseCode === code && request.status !== 'withdrawn',
  );

  const edited = fromRows(rows);
  const valid = rowsAreValid(rows);
  const changedFromShown = !sameMeetings(edited, shown);
  const differsFromOfficial = official !== null && !sameMeetings(edited, official.meetings);
  const splitByBatch =
    profile?.program === 'UG' &&
    profile.yearOfStudy === '1' &&
    (official?.meetings.some((meeting) => BATCH_RANGE.test(meeting.room)) ?? false);

  const switchCourse = (next: string) => {
    setCode(next);
    setRows(toRows(meetingsShownFor(next)));
    setNote('');
    setError('');
  };

  const saveForMe = () => {
    if (!code) return;
    saveCourseOverride(code, edited);
    toast.success(
      differsFromOfficial
        ? `Saved. Only you see these timings for ${code}.`
        : `${code} is back to the official timings.`,
    );
    onOpenChange(false);
  };

  const suggest = async () => {
    if (!code) return;
    setBusy('suggest');
    setError('');
    // The student sees the change straight away; everyone else waits for approval.
    saveCourseOverride(code, edited);
    try {
      const request = await submitSuggestion(code, edited, note);
      if (isAdmin) {
        await approveSuggestion(request.id, 'Applied directly by the developer.');
        // They are the official timings now, here as for everyone else.
        void refreshCourses();
        toast.success(`${code} now has these timings for everyone taking it.`);
      } else {
        toast.success('Suggestion sent. You see the new timings now; everyone else will once it is approved.');
      }
      void queryClient.invalidateQueries({ queryKey: ['course-changes'] });
      onOpenChange(false);
    } catch (failure) {
      setError(
        `Saved for you, but the suggestion was not sent: ${
          failure instanceof ApiError ? failure.message : 'the server could not be reached. Try again in a minute.'
        }`,
      );
    } finally {
      setBusy(null);
    }
  };

  const withdraw = async (request: CourseChangeRequest) => {
    setBusy('withdraw');
    setError('');
    try {
      await withdrawSuggestion(request.id);
      void queryClient.invalidateQueries({ queryKey: ['course-changes'] });
    } catch (failure) {
      setError(failure instanceof ApiError ? failure.message : 'Could not reach the server. Try again in a minute.');
    } finally {
      setBusy(null);
    }
  };

  const switchToOfficial = () => {
    if (!code || !official) return;
    removeCourseOverride(code);
    setRows(toRows(official.meetings));
    toast.success(`${code} is back to the official timings.`);
  };

  const reapplyMine = () => {
    if (!code || !own) return;
    keepCourseOverride(code);
    setRows(toRows(own.meetings));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader className="text-left">
          <DialogTitle>Edit class timings</DialogTitle>
          <DialogDescription>
            {isAdmin
              ? 'Save a change for yourself, or apply it to everyone taking the course straight away.'
              : 'Saving changes only your timetable. To change a course for everyone taking it, suggest the change — the timetable admin approves every suggestion first.'}
          </DialogDescription>
        </DialogHeader>

        {myCourses.length === 0 || !code ? (
          <p className="text-sm text-muted-foreground">Select your courses first, then edit their timings here.</p>
        ) : checking ? (
          <p className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Checking the latest timings…
          </p>
        ) : (
          <div className="space-y-4">
            <select
              aria-label="Course"
              value={code}
              onChange={(event) => switchCourse(event.target.value)}
              className="w-full px-3 py-2.5 rounded-xl bg-background border border-border text-sm"
            >
              {myCourses.map((course) => (
                <option key={course.courseCode} value={course.courseCode}>
                  {course.courseCode} — {course.courseName}
                </option>
              ))}
            </select>

            {ownStatus === 'active' && own && (
              <p className="flex items-start gap-2 text-sm rounded-xl px-3 py-2 bg-primary/5 border border-primary/20">
                <Info className="h-4 w-4 mt-0.5 shrink-0 text-primary" />
                <span>
                  You are seeing your own timings for {code}, saved {shortDate(own.savedAt)}. Only you see them.
                </span>
              </p>
            )}
            {ownStatus === 'superseded' && (
              <div className="text-sm rounded-xl px-3 py-2 bg-amber-500/10 border border-amber-500/30 space-y-2">
                <p>
                  The official timings for {code} changed after you saved your own, so you are now seeing the
                  official ones.
                </p>
                <Button size="sm" variant="outline" onClick={reapplyMine} className="rounded-lg">
                  Use my timings again
                </Button>
              </div>
            )}

            {latestSuggestion && (
              <SuggestionStatus
                request={latestSuggestion}
                busy={busy === 'withdraw'}
                onWithdraw={() => void withdraw(latestSuggestion)}
              />
            )}

            {splitByBatch && (
              <p className="text-[11px] text-muted-foreground">
                This course has separate sessions for different batches. A room marked with a batch range, such as
                (B1-B4), only appears in those batches&rsquo; timetables.
              </p>
            )}

            <MeetingRowsEditor rows={rows} onChange={setRows} template={official?.meetings[0]} />

            {differsFromOfficial && official && (
              <div className="rounded-xl bg-muted/40 p-3">
                <div className="text-xs font-semibold mb-1.5 text-muted-foreground uppercase tracking-wide">
                  Compared with the official timings
                </div>
                <MeetingDiff before={official.meetings} after={edited} />
              </div>
            )}

            {canSuggest ? (
              differsFromOfficial && (
                <div>
                  <label htmlFor="timing-note" className="block text-sm font-medium mb-1.5">
                    What changed, and who announced it?{' '}
                    <span className="font-normal text-muted-foreground">(optional, for the reviewer)</span>
                  </label>
                  <textarea
                    id="timing-note"
                    value={note}
                    maxLength={500}
                    rows={2}
                    onChange={(event) => setNote(event.target.value)}
                    placeholder="e.g. Prof. announced in class on 29 Sep that the Thursday lecture moves to Friday 3 pm."
                    className="w-full px-3 py-2 rounded-xl bg-background border border-border text-sm"
                  />
                </div>
              )
            ) : (
              <p className="text-[11px] text-muted-foreground">
                Suggesting a change for everyone needs the online service, which is not available here. You can
                still save changes for yourself.
              </p>
            )}

            {error && (
              <p className="text-sm text-red-500 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{error}</p>
            )}

            <div className="flex flex-col-reverse gap-2 border-t border-border/60 pt-4 sm:flex-row sm:items-center sm:justify-between">
              {own ? (
                <Button variant="ghost" onClick={switchToOfficial} className="rounded-xl">
                  <RotateCcw className="h-4 w-4" /> Use official timings
                </Button>
              ) : (
                <span />
              )}
              <div className="flex flex-col gap-2 sm:flex-row">
                <Button
                  variant="outline"
                  onClick={saveForMe}
                  disabled={!valid || !changedFromShown || busy !== null}
                  className="rounded-xl"
                >
                  <Save className="h-4 w-4" /> Save for me
                </Button>
                {canSuggest && (
                  <Button
                    onClick={() => void suggest()}
                    disabled={!valid || !differsFromOfficial || edited.length === 0 || busy !== null}
                    title={edited.length === 0 ? 'Keep at least one class to suggest a change.' : undefined}
                    className="rounded-xl"
                  >
                    {busy === 'suggest' ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : isAdmin ? (
                      <ShieldCheck className="h-4 w-4" />
                    ) : (
                      <Send className="h-4 w-4" />
                    )}
                    {isAdmin ? 'Apply for everyone' : 'Suggest for everyone'}
                  </Button>
                )}
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function SuggestionStatus({
  request,
  busy,
  onWithdraw,
}: {
  request: CourseChangeRequest;
  busy: boolean;
  onWithdraw: () => void;
}) {
  if (request.status === 'pending') {
    return (
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm rounded-xl px-3 py-2 bg-muted/50 border border-border">
        <span className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-primary shrink-0" />
          Your suggestion from {shortDate(request.createdAt)} is waiting for approval.
        </span>
        <Button size="sm" variant="ghost" onClick={onWithdraw} disabled={busy} className="rounded-lg h-8">
          {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Withdraw
        </Button>
      </div>
    );
  }

  const decided = request.decidedAt ? shortDate(request.decidedAt) : '';
  const approved = request.status === 'approved';
  const text = approved
    ? `Your suggestion was approved on ${decided}, so it now applies to everyone taking the course.`
    : request.status === 'rejected'
      ? `Your suggestion from ${shortDate(request.createdAt)} was not approved.`
      : `Your suggestion was closed on ${decided} because the timings changed in the meantime.`;

  return (
    <div
      className={`text-sm rounded-xl px-3 py-2 border ${
        approved ? 'bg-green-500/10 border-green-500/20' : 'bg-muted/50 border-border'
      }`}
    >
      <p className="flex items-start gap-2">
        {approved ? (
          <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0 text-green-600" />
        ) : (
          <XCircle className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
        )}
        {text}
      </p>
      {request.decisionNote && (
        <p className="text-xs text-muted-foreground mt-1 ml-6">Reviewer&rsquo;s note: {request.decisionNote}</p>
      )}
    </div>
  );
}
