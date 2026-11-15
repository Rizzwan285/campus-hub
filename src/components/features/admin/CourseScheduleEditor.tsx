import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Copy, FileSpreadsheet, Loader2, Plus, RotateCcw, Save, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ApiError } from '@/services/api';
import { getCourse, resetCourse, saveCourse, type CatalogueCourse, type CourseIssue } from '@/services/semesters';
import {
  expandSchedule, inferSchedule,
  type CourseSchedule, type SlotAssignment, type SlotDefinitions,
} from '@/engine/courseSchedule';
import type { MeetingDay, TimetableMeeting } from '@/engine/types';
import { MeetingRowsEditor } from '@/components/features/timetable/MeetingRowsEditor';
import { MeetingDiff } from '@/components/features/timetable/MeetingDiff';
import { fromRows, rowsAreValid, toRows, type MeetingRow } from '@/components/features/timetable/meetingRows';
import { WeekPreview } from './WeekPreview';

const field = 'px-2.5 py-2 rounded-lg bg-background border border-border text-sm';
const label = 'block text-[11px] font-medium text-muted-foreground mb-1';

const SEVERITY: Record<CourseIssue['severity'], string> = {
  blocking: 'bg-red-500/10 border-red-500/30 text-red-700 dark:text-red-400',
  review: 'bg-amber-500/10 border-amber-500/30 text-amber-800 dark:text-amber-300',
  info: 'bg-muted/50 border-border text-muted-foreground',
};

function slotSummary(code: string, slots: SlotDefinitions): string {
  const timings = slots[code]?.timings ?? [];
  return `${code} — ${timings.map((timing) => `${timing.day.slice(0, 3)} ${timing.startTime}`).join(', ')}`;
}

/** One slot the course uses: which of its days, in which room, for whom. */
function AssignmentCard({
  assignment, slots, onChange, onRemove, onDuplicate,
}: {
  assignment: SlotAssignment;
  slots: SlotDefinitions;
  onChange: (next: SlotAssignment) => void;
  onRemove: () => void;
  onDuplicate: () => void;
}) {
  const definition = slots[assignment.slot];
  const timings = definition?.timings ?? [];
  const selected = (day: MeetingDay) => assignment.days === null || assignment.days.includes(day);
  const hasOverrides = Object.keys(assignment.overrides ?? {}).length > 0 || Boolean(assignment.startTime);
  const [showDetails, setShowDetails] = useState(hasOverrides);

  const toggleDay = (day: MeetingDay) => {
    const all = timings.map((timing) => timing.day);
    const current = assignment.days ?? all;
    const next = current.includes(day) ? current.filter((other) => other !== day) : all.filter((d) => d === day || current.includes(d));
    onChange({ ...assignment, days: next.length === all.length ? null : next });
  };

  const setOverride = (day: MeetingDay, patch: { room?: string; startTime?: string; endTime?: string }) => {
    const merged = { ...(assignment.overrides?.[day] ?? {}), ...patch };
    const cleaned = Object.fromEntries(Object.entries(merged).filter(([, value]) => value !== '' && value !== undefined));
    const overrides = { ...(assignment.overrides ?? {}) };
    if (Object.keys(cleaned).length > 0) overrides[day] = cleaned;
    else delete overrides[day];
    onChange({ ...assignment, overrides: Object.keys(overrides).length > 0 ? overrides : undefined });
  };

  const lectures = Object.keys(slots).filter((code) => slots[code].type !== 'lab').sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  const labs = Object.keys(slots).filter((code) => slots[code].type === 'lab').sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  return (
    <div className="rounded-xl border border-border/60 bg-card p-3 space-y-2.5">
      <div className="flex gap-2">
        <select
          aria-label="Slot"
          value={definition ? assignment.slot : ''}
          onChange={(event) => onChange({ ...assignment, slot: event.target.value, days: null, overrides: undefined, startTime: undefined, endTime: undefined })}
          className={`${field} flex-1 min-w-0 font-medium`}
        >
          {!definition && <option value="">{assignment.slot ? `${assignment.slot} (not a slot this semester)` : 'Choose a slot…'}</option>}
          <optgroup label="Lecture slots">
            {lectures.map((code) => <option key={code} value={code}>{slotSummary(code, slots)}</option>)}
          </optgroup>
          <optgroup label="Lab slots">
            {labs.map((code) => <option key={code} value={code}>{slotSummary(code, slots)}</option>)}
          </optgroup>
        </select>
        <Button variant="ghost" size="icon" title="Copy this slot for another batch or room" onClick={onDuplicate} className="shrink-0 text-muted-foreground">
          <Copy className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" title="Remove this slot" onClick={onRemove} className="shrink-0 text-muted-foreground hover:text-red-500">
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>

      {definition && (
        <div>
          <span className={label}>Which meetings of {assignment.slot} apply</span>
          <div className="flex flex-wrap gap-1.5">
            {timings.map((timing) => (
              <button
                key={timing.day}
                type="button"
                aria-pressed={selected(timing.day)}
                onClick={() => toggleDay(timing.day)}
                className={`rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors ${
                  selected(timing.day)
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-background text-muted-foreground border-border line-through'
                }`}
              >
                {timing.day.slice(0, 3)} {timing.startTime}–{timing.endTime}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <div className="col-span-2 sm:col-span-1">
          <span className={label}>Venue for this slot</span>
          <input
            value={assignment.room}
            maxLength={120}
            onChange={(event) => onChange({ ...assignment, room: event.target.value })}
            placeholder="e.g. A01-212"
            className={`${field} w-full`}
          />
        </div>
        <div className="col-span-2 sm:col-span-1">
          <span className={label}>Only for batches</span>
          <input
            value={assignment.batches ?? ''}
            maxLength={60}
            onChange={(event) => onChange({ ...assignment, batches: event.target.value || undefined })}
            placeholder="everyone — or B1-B6"
            className={`${field} w-full`}
          />
        </div>
        <div>
          <span className={label}>How often</span>
          <select
            value={assignment.recurrence ?? 'weekly'}
            onChange={(event) => onChange({ ...assignment, recurrence: event.target.value === 'weekly' ? undefined : (event.target.value as SlotAssignment['recurrence']) })}
            className={`${field} w-full`}
          >
            <option value="weekly">Every week</option>
            <option value="biweekly_odd">Alternate weeks (odd)</option>
            <option value="biweekly_even">Alternate weeks (even)</option>
          </select>
        </div>
        <div>
          <span className={label}>Class type</span>
          <select
            value={assignment.type ?? definition?.type ?? 'lecture'}
            onChange={(event) => onChange({ ...assignment, type: event.target.value === definition?.type ? undefined : (event.target.value as SlotAssignment['type']) })}
            className={`${field} w-full`}
          >
            <option value="lecture">Lecture</option>
            <option value="tutorial">Tutorial</option>
            <option value="lab">Lab</option>
          </select>
        </div>
      </div>

      {assignment.note && (
        <p className="text-xs text-amber-800 dark:text-amber-300">Source remark, not interpreted: “{assignment.note}”</p>
      )}

      {definition && (
        <div>
          <button type="button" onClick={() => setShowDetails((open) => !open)} className="text-xs text-primary font-medium">
            {showDetails ? 'Hide' : 'Set'} a different room or time for individual days
          </button>
          {showDetails && (
            <div className="mt-2 space-y-1.5">
              {timings.filter((timing) => selected(timing.day)).map((timing) => {
                const override = assignment.overrides?.[timing.day] ?? {};
                return (
                  <div key={timing.day} className="flex flex-wrap items-center gap-1.5">
                    <span className="w-9 text-xs font-medium">{timing.day.slice(0, 3)}</span>
                    <input
                      aria-label={`${timing.day} room`}
                      value={override.room ?? ''}
                      onChange={(event) => setOverride(timing.day, { room: event.target.value })}
                      placeholder={assignment.room || 'room'}
                      className={`${field} flex-1 min-w-[7rem] py-1.5`}
                    />
                    <input
                      type="time" aria-label={`${timing.day} start`}
                      value={override.startTime ?? assignment.startTime ?? timing.startTime}
                      onChange={(event) => setOverride(timing.day, { startTime: event.target.value === timing.startTime ? '' : event.target.value })}
                      className={`${field} w-[7.2rem] py-1.5`}
                    />
                    <input
                      type="time" aria-label={`${timing.day} end`}
                      value={override.endTime ?? assignment.endTime ?? timing.endTime}
                      onChange={(event) => setOverride(timing.day, { endTime: event.target.value === timing.endTime ? '' : event.target.value })}
                      className={`${field} w-[7.2rem] py-1.5`}
                    />
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

interface EditorProps {
  semesterId: number;
  courseId: number | null;
  slots: SlotDefinitions;
  onClose: (changed: boolean) => void;
}

/**
 * The visual editor for one course: its slots, the days of each that apply,
 * the venue per slot and per day, batch sessions, and classes outside the slot
 * system - with the original Excel row and a week preview that redraws on
 * every change. Nothing is typed as a slot expression.
 */
export function CourseScheduleEditor({ semesterId, courseId, slots, onClose }: EditorProps) {
  const [course, setCourse] = useState<CatalogueCourse | null>(null);
  const [details, setDetails] = useState({ courseCode: '', courseName: '', credits: '', category: '', instructors: '' });
  const [assignments, setAssignments] = useState<SlotAssignment[]>([]);
  const [custom, setCustom] = useState<MeetingRow[]>([]);
  const [inferred, setInferred] = useState(false);
  const [busy, setBusy] = useState<'save' | 'reset' | 'remove' | null>(null);
  const [error, setError] = useState('');
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (courseId === null) return;
    let cancelled = false;
    setCourse(null);
    setError('');
    getCourse(semesterId, courseId)
      .then((loaded) => {
        if (cancelled) return;
        // A course that only ever existed as a list of classes opens as slots
        // wherever its classes match one exactly.
        const onlyMeetings = loaded.schedule.assignments.length === 0 && loaded.schedule.custom.length > 0;
        const schedule = onlyMeetings ? inferSchedule(loaded.schedule.custom, slots) : loaded.schedule;
        setCourse(loaded);
        setInferred(onlyMeetings && schedule.assignments.length > 0);
        setAssignments(schedule.assignments);
        setCustom(toRows(schedule.custom));
        setDetails({
          courseCode: loaded.courseCode, courseName: loaded.courseName, credits: loaded.credits ?? '',
          category: loaded.category ?? '', instructors: loaded.instructors.join('\n'),
        });
        setDirty(false);
      })
      .catch((failure) => setError(failure instanceof ApiError ? failure.message : 'Could not load the course.'));
    return () => {
      cancelled = true;
    };
  }, [semesterId, courseId, slots]);

  const instructors = useMemo(
    () => details.instructors.split('\n').map((line) => line.trim()).filter(Boolean),
    [details.instructors],
  );
  const schedule: CourseSchedule = useMemo(
    () => ({ assignments, custom: fromRows(custom) }),
    [assignments, custom],
  );
  const { meetings, problems } = useMemo(() => expandSchedule(schedule, slots, { instructors }), [schedule, slots, instructors]);

  const touch = () => setDirty(true);
  const updateAssignment = (index: number, next: SlotAssignment) => {
    setAssignments((list) => list.map((entry, position) => (position === index ? next : entry)));
    touch();
  };
  const firstSlot = Object.keys(slots).sort()[0] ?? '';
  const openIssues = (course?.issues ?? []).filter((entry) => !entry.resolved && entry.origin !== 'schedule');
  const blockingProblems = problems.filter((problem) => problem.severity === 'blocking');
  const valid = rowsAreValid(custom) && details.courseCode.trim().length >= 2;

  const save = async (resolveOnly = false) => {
    if (!course) return;
    setBusy('save');
    setError('');
    try {
      await saveCourse(semesterId, course.id, resolveOnly
        ? { resolveIssues: true }
        : {
            courseCode: details.courseCode, courseName: details.courseName,
            credits: details.credits || null, category: details.category || null,
            instructors, schedule,
          });
      toast.success(`${details.courseCode} saved. Publish the semester to make it live.`);
      onClose(true);
    } catch (failure) {
      setError(failure instanceof ApiError ? failure.message : 'Saving failed. Is the API reachable?');
    } finally {
      setBusy(null);
    }
  };

  const reset = async () => {
    if (!course) return;
    setBusy('reset');
    try {
      await resetCourse(semesterId, course.id);
      toast.success(`${course.courseCode} is back to the imported version.`);
      onClose(true);
    } catch (failure) {
      setError(failure instanceof ApiError ? failure.message : 'Could not reset the course.');
    } finally {
      setBusy(null);
    }
  };

  const setRemoved = async (removed: boolean) => {
    if (!course) return;
    setBusy('remove');
    try {
      await saveCourse(semesterId, course.id, { removed });
      toast.success(removed ? `${course.courseCode} will be left out when you publish.` : `${course.courseCode} restored.`);
      onClose(true);
    } catch (failure) {
      setError(failure instanceof ApiError ? failure.message : 'Could not update the course.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <Dialog open={courseId !== null} onOpenChange={(open) => !open && onClose(false)}>
      <DialogContent className="max-w-6xl w-[96vw] max-h-[92vh] overflow-y-auto">
        <DialogHeader className="text-left">
          <DialogTitle>
            {course ? `${course.courseCode} — ${course.courseName || 'unnamed course'}` : 'Loading…'}
          </DialogTitle>
          <DialogDescription>
            {course ? `${course.program} / ${course.branch}` : ''}
            {course?.manual ? ' · corrected by hand' : course?.origin === 'import' ? ' · as imported' : ''}
            {course?.removed ? ' · removed from this semester' : ''}
          </DialogDescription>
        </DialogHeader>

        {!course ? (
          error ? <p className="text-sm text-red-500">{error}</p> : <Loader2 className="h-5 w-5 animate-spin text-muted-foreground mx-auto my-10" />
        ) : (
          <div className="grid gap-5 lg:grid-cols-2">
            {/* ---------------- left: what the course is and when it meets ---------------- */}
            <div className="space-y-4 min-w-0">
              {openIssues.length > 0 && (
                <div className="space-y-1.5">
                  {openIssues.map((entry, index) => (
                    <p key={index} className={`flex items-start gap-2 text-xs rounded-lg border px-3 py-2 ${SEVERITY[entry.severity]}`}>
                      <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                      <span>
                        <span className="font-semibold">{entry.severity === 'blocking' ? 'Must fix: ' : entry.severity === 'review' ? 'Check: ' : ''}</span>
                        {entry.message}
                      </span>
                    </p>
                  ))}
                </div>
              )}
              {inferred && (
                <p className="text-xs text-muted-foreground">
                  This course was stored as a plain list of classes. Those matching a slot exactly are shown as
                  slots below; saving keeps the same classes.
                </p>
              )}

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <span className={label}>Code</span>
                  <input value={details.courseCode} maxLength={40} onChange={(event) => { setDetails({ ...details, courseCode: event.target.value }); touch(); }} className={`${field} w-full`} />
                </div>
                <div>
                  <span className={label}>Credits</span>
                  <input value={details.credits} maxLength={40} onChange={(event) => { setDetails({ ...details, credits: event.target.value }); touch(); }} placeholder="3-0-0-3" className={`${field} w-full`} />
                </div>
                <div className="col-span-2">
                  <span className={label}>Name</span>
                  <input value={details.courseName} maxLength={300} onChange={(event) => { setDetails({ ...details, courseName: event.target.value }); touch(); }} className={`${field} w-full`} />
                </div>
                <div>
                  <span className={label}>Category</span>
                  <input value={details.category} maxLength={60} list="course-categories" onChange={(event) => { setDetails({ ...details, category: event.target.value }); touch(); }} className={`${field} w-full`} />
                  <datalist id="course-categories">
                    {['core', 'electives', 'institute core', 'sme', 'hse', 'gceoe', 'project', 'backlog'].map((value) => <option key={value} value={value} />)}
                  </datalist>
                </div>
                <div>
                  <span className={label}>Instructors (one per line)</span>
                  <textarea value={details.instructors} rows={2} onChange={(event) => { setDetails({ ...details, instructors: event.target.value }); touch(); }} className={`${field} w-full`} />
                </div>
              </div>

              <div className="space-y-2">
                <h3 className="text-sm font-semibold">Slots</h3>
                {assignments.length === 0 && (
                  <p className="text-sm text-muted-foreground rounded-xl border border-dashed border-border px-3 py-3 text-center">
                    No slots assigned.
                  </p>
                )}
                {assignments.map((assignment, index) => (
                  <AssignmentCard
                    key={index}
                    assignment={assignment}
                    slots={slots}
                    onChange={(next) => updateAssignment(index, next)}
                    onRemove={() => { setAssignments((list) => list.filter((_, position) => position !== index)); touch(); }}
                    onDuplicate={() => { setAssignments((list) => [...list.slice(0, index + 1), { ...assignment, batches: undefined }, ...list.slice(index + 1)]); touch(); }}
                  />
                ))}
                <Button variant="outline" size="sm" onClick={() => { setAssignments((list) => [...list, { slot: firstSlot, days: null, room: list[0]?.room ?? '' }]); touch(); }} className="rounded-lg">
                  <Plus className="h-4 w-4" /> Add a slot
                </Button>
              </div>

              <div className="space-y-2">
                <h3 className="text-sm font-semibold">Classes outside the slot system</h3>
                <p className="text-[11px] text-muted-foreground">
                  Any day and time, weekly or on a single date — a Saturday session, an extra class.
                </p>
                <MeetingRowsEditor
                  rows={custom}
                  onChange={(rows) => { setCustom(rows); touch(); }}
                  template={{ type: 'lecture', day: 'Monday', startTime: '09:00', endTime: '09:50', room: assignments[0]?.room ?? '', instructors: [], recurrence: { type: 'weekly' } }}
                />
              </div>
            </div>

            {/* ---------------- right: the result, and where it came from ---------------- */}
            <div className="space-y-4 min-w-0">
              <div>
                <h3 className="text-sm font-semibold mb-2">Weekly preview · {meetings.length} class{meetings.length === 1 ? '' : 'es'}</h3>
                <WeekPreview meetings={meetings} />
              </div>

              {problems.length > 0 && (
                <div className="space-y-1.5">
                  {problems.map((problem, index) => (
                    <p key={index} className={`text-xs rounded-lg border px-3 py-2 ${SEVERITY[problem.severity]}`}>{problem.message}</p>
                  ))}
                </div>
              )}

              {course.importChange === 'modified' && course.previousMeetings && (
                <div className="rounded-xl bg-muted/40 p-3">
                  <div className="text-xs font-semibold mb-1.5 text-muted-foreground uppercase tracking-wide">Changed by the last import</div>
                  <MeetingDiff before={course.previousMeetings} after={course.meetings} />
                </div>
              )}

              <div>
                <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
                  <FileSpreadsheet className="h-4 w-4 text-primary" /> Original Excel data
                </h3>
                {course.sourceRows.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    {course.origin === 'manual' ? 'Added by hand; there is no source row.' : 'This course predates the importer; no source row was kept.'}
                  </p>
                ) : (
                  <div className="space-y-2">
                    {course.sourceRows.map((row, index) => (
                      <div key={index} className="rounded-lg border border-border/60 text-xs overflow-hidden">
                        <div className="bg-muted/40 px-2.5 py-1.5 font-medium truncate" title={row.file}>
                          {row.sheet} · row {row.row} · <span className="font-normal text-muted-foreground">{row.file}</span>
                        </div>
                        <dl className="grid grid-cols-[minmax(6rem,34%)_1fr]">
                          {Object.entries(row.cells).map(([header, value]) => (
                            <div key={header} className="contents">
                              <dt className="px-2.5 py-1 text-muted-foreground border-t border-border/40 truncate" title={header}>{header}</dt>
                              <dd className="px-2.5 py-1 border-t border-border/40 whitespace-pre-wrap break-words font-mono text-[11px]">{value}</dd>
                            </div>
                          ))}
                        </dl>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* ---------------- actions ---------------- */}
            <div className="lg:col-span-2 space-y-2 border-t border-border/60 pt-4">
              {error && <p className="text-sm text-red-500 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{error}</p>}
              <div className="flex flex-wrap items-center gap-2">
                <Button onClick={() => void save()} disabled={busy !== null || !valid || blockingProblems.length > 0} className="rounded-xl">
                  {busy === 'save' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save course
                </Button>
                {openIssues.length > 0 && !dirty && (
                  <Button variant="outline" onClick={() => void save(true)} disabled={busy !== null} className="rounded-xl" title="The schedule is right as it is; close these findings.">
                    <CheckCircle2 className="h-4 w-4" /> Looks right — mark reviewed
                  </Button>
                )}
                {course.manual && course.parsed && (
                  <Button variant="ghost" onClick={() => void reset()} disabled={busy !== null} className="rounded-xl">
                    <RotateCcw className="h-4 w-4" /> Use the imported version
                  </Button>
                )}
                <Button variant="ghost" onClick={() => void setRemoved(!course.removed)} disabled={busy !== null} className="rounded-xl ml-auto text-muted-foreground">
                  {course.removed ? 'Restore to semester' : 'Remove from semester'}
                </Button>
              </div>
              {blockingProblems.length > 0 && <p className="text-xs text-red-500">Fix the errors above before saving.</p>}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
