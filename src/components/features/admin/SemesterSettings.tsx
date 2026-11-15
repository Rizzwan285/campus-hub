import { useState } from 'react';
import { AlertTriangle, CheckCircle2, Loader2, Plus, Save, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { ApiError } from '@/services/api';
import { updateSemester, type ImportSummary, type Semester } from '@/services/semesters';
import { WEEK_DAYS } from '@/engine/courseTimings';
import type { SemesterConfig, SlotDefinitions, VenueRule } from '@/engine/courseSchedule';
import type { MeetingDay, TimetableMeeting } from '@/engine/types';

const field = 'px-2 py-1.5 rounded-lg bg-background border border-border text-sm';
const errorText = (failure: unknown) => (failure instanceof ApiError ? failure.message : 'Saving failed. Is the API reachable?');
const codes = (text: string) => text.split(/[\s,]+/).map((code) => code.trim().toUpperCase()).filter(Boolean);

interface SlotRow {
  code: string;
  type: TimetableMeeting['type'];
  timings: Array<{ day: MeetingDay; startTime: string; endTime: string }>;
}

const toRows = (slots: SlotDefinitions): SlotRow[] =>
  Object.entries(slots)
    .sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }))
    .map(([code, definition]) => ({ code, type: definition.type, timings: definition.timings.map((timing) => ({ ...timing })) }));

/**
 * The semester's slot system: each slot code and when it meets.
 *
 * An import fills this in from the institute's document, but a Word table is
 * easy to misread, so nothing can be published until a person has looked at
 * it and confirmed it here.
 */
export function SlotTableEditor({
  semester, report, onSaved,
}: { semester: Semester; report: ImportSummary['slots'] | null; onSaved: () => void }) {
  const [rows, setRows] = useState<SlotRow[]>(() => toRows(semester.slotDefinitions));
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);

  const update = (index: number, next: SlotRow) => {
    setRows((list) => list.map((row, position) => (position === index ? next : row)));
    setDirty(true);
  };

  const problems: string[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    const code = row.code.trim();
    if (!/^[A-Za-z][A-Za-z0-9-]{0,9}$/.test(code)) problems.push(`"${code || '(blank)'}" is not a valid slot code.`);
    if (seen.has(code.toUpperCase())) problems.push(`Slot ${code} is listed twice.`);
    seen.add(code.toUpperCase());
    if (row.timings.length === 0) problems.push(`Slot ${code} has no meetings.`);
    for (const timing of row.timings) {
      if (!timing.startTime || !timing.endTime || timing.endTime <= timing.startTime) problems.push(`Slot ${code} on ${timing.day} has an invalid time.`);
    }
  }

  const save = async () => {
    setBusy(true);
    try {
      const slotDefinitions: SlotDefinitions = Object.fromEntries(
        rows.map((row) => [row.code.trim(), { type: row.type, timings: row.timings }]),
      );
      await updateSemester(semester.id, { slotDefinitions, slotsConfirmed: true });
      toast.success('Slot table saved and confirmed.');
      setDirty(false);
      onSaved();
    } catch (failure) {
      toast.error(errorText(failure));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold">Slot table</h3>
        <p className="text-[11px] text-muted-foreground mt-1">
          Which days and times each slot means this semester. Courses are expanded from this table, so a wrong
          time here is wrong for every course in that slot. Compare it with the institute&rsquo;s slot document,
          then confirm.
        </p>
      </div>

      {semester.slotsConfirmed && !dirty ? (
        <p className="flex items-center gap-2 text-sm text-green-700 dark:text-green-400"><CheckCircle2 className="h-4 w-4" /> Confirmed.</p>
      ) : (
        <p className="flex items-start gap-2 text-xs rounded-lg px-3 py-2 bg-amber-500/10 border border-amber-500/30">
          <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />
          Not confirmed yet{rows.length > 0 ? '' : ' — and empty. Import the slot document or add slots below'}. The semester cannot be published until it is.
        </p>
      )}
      {report?.issues.map((entry, index) => (
        <p key={index} className="text-xs text-amber-800 dark:text-amber-300">From the document: {entry.message}</p>
      ))}

      <div className="space-y-2 max-h-[34rem] overflow-y-auto pr-1">
        {rows.map((row, index) => (
          <div key={index} className="rounded-xl border border-border/60 p-2.5 space-y-2">
            <div className="flex gap-2 items-center">
              <input aria-label="Slot code" value={row.code} maxLength={10} onChange={(event) => update(index, { ...row, code: event.target.value })} className={`${field} w-24 font-semibold`} />
              <select aria-label="Slot type" value={row.type} onChange={(event) => update(index, { ...row, type: event.target.value as SlotRow['type'] })} className={field}>
                <option value="lecture">Lecture</option>
                <option value="lab">Lab</option>
                <option value="tutorial">Tutorial</option>
              </select>
              <Button variant="ghost" size="sm" onClick={() => update(index, { ...row, timings: [...row.timings, { day: 'Monday', startTime: '09:00', endTime: '09:50' }] })} className="h-7 rounded-lg text-xs">
                <Plus className="h-3.5 w-3.5" /> meeting
              </Button>
              <Button variant="ghost" size="icon" title="Remove this slot" onClick={() => { setRows((list) => list.filter((_, position) => position !== index)); setDirty(true); }} className="ml-auto h-7 w-7 text-muted-foreground hover:text-red-500">
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
            <div className="flex flex-wrap gap-2">
              {row.timings.map((timing, position) => {
                const set = (patch: Partial<SlotRow['timings'][number]>) =>
                  update(index, { ...row, timings: row.timings.map((entry, at) => (at === position ? { ...entry, ...patch } : entry)) });
                return (
                  <div key={position} className="flex items-center gap-1 rounded-lg bg-muted/40 px-1.5 py-1">
                    <select aria-label="Day" value={timing.day} onChange={(event) => set({ day: event.target.value as MeetingDay })} className="bg-transparent text-xs">
                      {WEEK_DAYS.map((day) => <option key={day} value={day}>{day.slice(0, 3)}</option>)}
                    </select>
                    <input type="time" aria-label="Starts" value={timing.startTime} onChange={(event) => set({ startTime: event.target.value })} className="bg-transparent text-xs w-[5.6rem]" />
                    <span className="text-xs text-muted-foreground">–</span>
                    <input type="time" aria-label="Ends" value={timing.endTime} onChange={(event) => set({ endTime: event.target.value })} className="bg-transparent text-xs w-[5.6rem]" />
                    <button aria-label="Remove this meeting" onClick={() => update(index, { ...row, timings: row.timings.filter((_, at) => at !== position) })} className="text-muted-foreground hover:text-red-500 px-0.5">×</button>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {problems.slice(0, 4).map((problem, index) => <p key={index} className="text-xs text-red-500">{problem}</p>)}
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={() => { setRows((list) => [...list, { code: '', type: 'lecture', timings: [{ day: 'Monday', startTime: '09:00', endTime: '09:50' }] }]); setDirty(true); }} className="rounded-xl">
          <Plus className="h-4 w-4" /> Add a slot
        </Button>
        <Button onClick={() => void save()} disabled={busy || problems.length > 0 || rows.length === 0} className="rounded-xl">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {semester.slotsConfirmed && !dirty ? 'Confirmed' : 'Save and confirm'}
        </Button>
      </div>
    </div>
  );
}

interface CohortRow { batchMin: string; batchMax: string; excluded: string }
interface BranchRow { branch: string; codes: string }
interface VenueRow { courseCode: string; meetingType: string; batchMin: string; batchMax: string; room: string }

/**
 * The semester's rules that used to be written into the app: which core
 * courses each first-year batch takes, and the rooms each batch uses.
 */
export function SemesterRulesEditor({ semester, onSaved }: { semester: Semester; onSaved: () => void }) {
  const firstYear = semester.config.firstYear ?? {};
  const [excluded, setExcluded] = useState((firstYear.excludedCodes ?? []).join(', '));
  const [cohorts, setCohorts] = useState<CohortRow[]>(() =>
    (firstYear.cohorts ?? []).map((cohort) => ({ batchMin: String(cohort.batchMin), batchMax: String(cohort.batchMax), excluded: cohort.excludedCodes.join(', ') })));
  const [extras, setExtras] = useState<BranchRow[]>(() =>
    Object.entries(firstYear.extraByBranch ?? {}).map(([branch, list]) => ({ branch, codes: list.join(', ') })));
  const [venues, setVenues] = useState<VenueRow[]>(() =>
    (semester.config.venueRules ?? []).map((rule) => ({
      courseCode: rule.courseCode, meetingType: rule.meetingType ?? '', batchMin: String(rule.batchMin),
      batchMax: String(rule.batchMax), room: rule.room,
    })));
  const [busy, setBusy] = useState(false);

  const save = async () => {
    const config: SemesterConfig = {
      firstYear: {
        excludedCodes: codes(excluded),
        cohorts: cohorts
          .filter((row) => row.batchMin && row.batchMax)
          .map((row) => ({ batchMin: Number(row.batchMin), batchMax: Number(row.batchMax), excludedCodes: codes(row.excluded) })),
        extraByBranch: Object.fromEntries(extras.filter((row) => row.branch.trim()).map((row) => [row.branch.trim(), codes(row.codes)])),
      },
      venueRules: venues
        .filter((row) => row.courseCode.trim() && row.room.trim())
        .map((row): VenueRule => ({
          courseCode: row.courseCode.trim().toUpperCase(),
          meetingType: (row.meetingType || null) as VenueRule['meetingType'],
          batchMin: Number(row.batchMin) || 1,
          batchMax: Number(row.batchMax) || 999,
          room: row.room.trim(),
        })),
    };
    setBusy(true);
    try {
      await updateSemester(semester.id, { config });
      toast.success('Rules saved.');
      onSaved();
    } catch (failure) {
      toast.error(errorText(failure));
    } finally {
      setBusy(false);
    }
  };

  const remove = <T,>(setter: (update: (list: T[]) => T[]) => void, index: number) =>
    setter((list) => list.filter((_, position) => position !== index));
  const edit = <T,>(setter: (update: (list: T[]) => T[]) => void, index: number, patch: Partial<T>) =>
    setter((list) => list.map((row, position) => (position === index ? { ...row, ...patch } : row)));

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-sm font-semibold">First-year core courses</h3>
        <p className="text-[11px] text-muted-foreground mt-1">
          First-year UG students get the Common Courses marked core automatically. These rules say which of
          them a batch does <em>not</em> take. They take effect as soon as you save.
        </p>
      </div>

      <label className="block">
        <span className="block text-[11px] font-medium text-muted-foreground mb-1">Core courses no first-year batch takes this semester</span>
        <input value={excluded} onChange={(event) => setExcluded(event.target.value)} placeholder="e.g. BT2010" className={`${field} w-full`} />
      </label>

      <div className="space-y-2">
        <span className="block text-[11px] font-medium text-muted-foreground">Batch groups and the core courses each skips</span>
        {cohorts.map((row, index) => (
          <div key={index} className="flex flex-wrap items-center gap-2">
            <span className="text-xs">B</span>
            <input aria-label="First batch" value={row.batchMin} onChange={(event) => edit(setCohorts, index, { batchMin: event.target.value.replace(/\D/g, '') })} className={`${field} w-14`} />
            <span className="text-xs">to B</span>
            <input aria-label="Last batch" value={row.batchMax} onChange={(event) => edit(setCohorts, index, { batchMax: event.target.value.replace(/\D/g, '') })} className={`${field} w-14`} />
            <span className="text-xs text-muted-foreground">skip</span>
            <input aria-label="Courses skipped" value={row.excluded} onChange={(event) => edit(setCohorts, index, { excluded: event.target.value })} placeholder="CY1140, EE1110" className={`${field} flex-1 min-w-[10rem]`} />
            <Button variant="ghost" size="icon" onClick={() => remove(setCohorts, index)} className="h-7 w-7 text-muted-foreground hover:text-red-500"><Trash2 className="h-3.5 w-3.5" /></Button>
          </div>
        ))}
        <Button variant="outline" size="sm" onClick={() => setCohorts((list) => [...list, { batchMin: '', batchMax: '', excluded: '' }])} className="rounded-lg"><Plus className="h-4 w-4" /> Add a batch group</Button>
      </div>

      <div className="space-y-2">
        <span className="block text-[11px] font-medium text-muted-foreground">Extra courses added for a branch&rsquo;s first years</span>
        {extras.map((row, index) => (
          <div key={index} className="flex flex-wrap items-center gap-2">
            <input aria-label="Branch" value={row.branch} onChange={(event) => edit(setExtras, index, { branch: event.target.value })} placeholder="DS" className={`${field} w-24`} />
            <input aria-label="Courses" value={row.codes} onChange={(event) => edit(setExtras, index, { codes: event.target.value })} placeholder="DS1010" className={`${field} flex-1 min-w-[10rem]`} />
            <Button variant="ghost" size="icon" onClick={() => remove(setExtras, index)} className="h-7 w-7 text-muted-foreground hover:text-red-500"><Trash2 className="h-3.5 w-3.5" /></Button>
          </div>
        ))}
        <Button variant="outline" size="sm" onClick={() => setExtras((list) => [...list, { branch: '', codes: '' }])} className="rounded-lg"><Plus className="h-4 w-4" /> Add a branch</Button>
      </div>

      <div className="space-y-2">
        <h3 className="text-sm font-semibold">Rooms by batch</h3>
        <p className="text-[11px] text-muted-foreground">
          For a course whose room text lists several batch ranges, the room a batch is shown instead. Courses
          imported here carry batches on each class already and rarely need this.
        </p>
        {venues.map((row, index) => (
          <div key={index} className="flex flex-wrap items-center gap-2">
            <input aria-label="Course code" value={row.courseCode} onChange={(event) => edit(setVenues, index, { courseCode: event.target.value })} placeholder="PH1030" className={`${field} w-24`} />
            <select aria-label="Class type" value={row.meetingType} onChange={(event) => edit(setVenues, index, { meetingType: event.target.value })} className={field}>
              <option value="">any class</option>
              <option value="lecture">lecture</option>
              <option value="lab">lab</option>
              <option value="tutorial">tutorial</option>
            </select>
            <span className="text-xs">B</span>
            <input aria-label="First batch" value={row.batchMin} onChange={(event) => edit(setVenues, index, { batchMin: event.target.value.replace(/\D/g, '') })} className={`${field} w-12`} />
            <span className="text-xs">–</span>
            <input aria-label="Last batch" value={row.batchMax} onChange={(event) => edit(setVenues, index, { batchMax: event.target.value.replace(/\D/g, '') })} className={`${field} w-14`} />
            <input aria-label="Room" value={row.room} onChange={(event) => edit(setVenues, index, { room: event.target.value })} placeholder="C06-105" className={`${field} flex-1 min-w-[8rem]`} />
            <Button variant="ghost" size="icon" onClick={() => remove(setVenues, index)} className="h-7 w-7 text-muted-foreground hover:text-red-500"><Trash2 className="h-3.5 w-3.5" /></Button>
          </div>
        ))}
        <Button variant="outline" size="sm" onClick={() => setVenues((list) => [...list, { courseCode: '', meetingType: '', batchMin: '1', batchMax: '999', room: '' }])} className="rounded-lg"><Plus className="h-4 w-4" /> Add a room rule</Button>
      </div>

      <Button onClick={() => void save()} disabled={busy} className="rounded-xl">
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save rules
      </Button>
    </div>
  );
}
