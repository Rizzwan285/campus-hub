import { useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle, ArrowLeft, CheckCircle2, FileUp, Loader2, Plus, Rocket, Search, Trash2, Undo2, Upload,
} from 'lucide-react';
import { toast } from 'sonner';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { ApiError } from '@/services/api';
import * as api from '@/services/semesters';
import type { CourseListItem, ImportSummary, SemesterDetail, SemesterSummary } from '@/services/semesters';
import { batchAllowed } from '@/engine/courseSchedule';
import { CourseScheduleEditor } from './CourseScheduleEditor';
import { SemesterRulesEditor, SlotTableEditor } from './SemesterSettings';
import { WeekPreview } from './WeekPreview';

const field = 'px-3 py-2 rounded-xl bg-background border border-border text-sm';
const errorText = (failure: unknown, fallback: string) => (failure instanceof ApiError ? failure.message : fallback);
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '');

const STATUS: Record<string, { label: string; className: string }> = {
  draft: { label: 'Draft', className: 'bg-muted text-muted-foreground' },
  published: { label: 'Upcoming', className: 'bg-amber-500/10 text-amber-700 dark:text-amber-400' },
  active: { label: 'Current', className: 'bg-green-500/10 text-green-700 dark:text-green-400' },
  archived: { label: 'Archived', className: 'bg-muted text-muted-foreground' },
};

function StatusBadge({ status }: { status: string }) {
  const style = STATUS[status] ?? STATUS.draft;
  return <span className={`text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded ${style.className}`}>{style.label}</span>;
}

/** /admin → Semesters. A list of semesters, and a workspace for the one being worked on. */
export function SemestersAdmin() {
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<number | null>(null);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const { data, isLoading, isError } = useQuery({ queryKey: ['admin-semesters'], queryFn: api.listSemesters });

  const create = async () => {
    setBusy(true);
    try {
      const created = await api.createSemester({ name });
      setName('');
      await queryClient.invalidateQueries({ queryKey: ['admin-semesters'] });
      setSelected(created.id);
    } catch (failure) {
      toast.error(errorText(failure, 'Could not create the semester.'));
    } finally {
      setBusy(false);
    }
  };

  if (selected !== null) return <SemesterWorkspace id={selected} onBack={() => setSelected(null)} />;

  return (
    <Card className="p-5 space-y-5">
      <div>
        <h2 className="text-sm font-semibold">Semesters</h2>
        <p className="text-[11px] text-muted-foreground mt-1">
          Create a semester once the institute releases its files, import them, fix anything the importer was
          unsure about, then publish. Publishing lets students see the courses; making a semester current is a
          separate step. Old semesters are kept, never deleted.
        </p>
      </div>

      {isLoading ? (
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      ) : isError ? (
        <p className="text-sm text-red-500">
          Could not load semesters. If the API was just updated, run the database migrations first.
        </p>
      ) : (
        <ul className="space-y-2">
          {data?.map((semester: SemesterSummary) => (
            <li key={semester.id}>
              <button
                onClick={() => setSelected(semester.id)}
                className="w-full text-left rounded-xl border border-border/60 p-3 hover:bg-muted/40 transition-colors"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">{semester.name}</span>
                  <StatusBadge status={semester.status} />
                  <span className="text-xs text-muted-foreground ml-auto">
                    {semester.publishedVersion > 0 ? `v${semester.publishedVersion} · ${day(semester.publishedAt)}` : 'never published'}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {plural(semester.courseCount, 'course')}
                  {semester.invalid > 0 && <span className="text-red-500"> · {semester.invalid} to fix</span>}
                  {semester.needsReview > 0 && <span className="text-amber-600 dark:text-amber-400"> · {semester.needsReview} to review</span>}
                  {semester.unpublishedChanges > 0 && ` · ${plural(semester.unpublishedChanges, 'unpublished change')}`}
                </p>
              </button>
            </li>
          ))}
          {data?.length === 0 && <p className="text-sm text-muted-foreground">No semesters yet.</p>}
        </ul>
      )}

      <div className="flex flex-wrap gap-2 border-t border-border/60 pt-4">
        <input
          value={name}
          maxLength={60}
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => event.key === 'Enter' && name.trim().length >= 3 && void create()}
          placeholder="New semester, e.g. Jan-May 2027"
          className={`${field} flex-1 min-w-[12rem]`}
        />
        <Button onClick={() => void create()} disabled={busy || name.trim().length < 3} className="rounded-xl">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Create draft
        </Button>
      </div>
    </Card>
  );
}

type Step = 'import' | 'courses' | 'slots' | 'rules' | 'publish';

function SemesterWorkspace({ id, onBack }: { id: number; onBack: () => void }) {
  const queryClient = useQueryClient();
  const [step, setStep] = useState<Step>('import');
  const { data, isLoading } = useQuery({ queryKey: ['admin-semester', id], queryFn: () => api.getSemester(id) });
  const courses = useQuery({ queryKey: ['admin-semester-courses', id], queryFn: () => api.listCourses(id) });

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['admin-semester', id] });
    void queryClient.invalidateQueries({ queryKey: ['admin-semester-courses', id] });
    void queryClient.invalidateQueries({ queryKey: ['admin-semesters'] });
  };

  if (isLoading || !data) return <Card className="p-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground mx-auto" /></Card>;
  const { semester, publishCheck } = data;
  const steps: Array<{ value: Step; label: string; flag?: string }> = [
    { value: 'import', label: '1 · Files' },
    { value: 'courses', label: '2 · Courses', flag: publishCheck.blocking.length > 0 ? String(publishCheck.blocking.length) : undefined },
    { value: 'slots', label: '3 · Slot table', flag: semester.slotsConfirmed ? undefined : '!' },
    { value: 'rules', label: '4 · Rules' },
    { value: 'publish', label: '5 · Publish' },
  ];

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="outline" size="icon" onClick={onBack} className="rounded-xl h-8 w-8" title="All semesters">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h2 className="text-lg font-semibold">{semester.name}</h2>
          <StatusBadge status={semester.status} />
          <span className="text-xs text-muted-foreground">
            {semester.publishedVersion > 0 ? `Published v${semester.publishedVersion}` : 'Not published'}
            {publishCheck.unpublishedChanges > 0 ? ` · ${plural(publishCheck.unpublishedChanges, 'unpublished change')}` : ''}
          </span>
        </div>
        <div className="flex flex-wrap gap-1 rounded-xl bg-muted/50 p-1 mt-3 w-fit">
          {steps.map((entry) => (
            <button
              key={entry.value}
              onClick={() => setStep(entry.value)}
              className={`text-sm font-medium py-1.5 px-3 rounded-lg transition-all ${
                step === entry.value ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {entry.label}
              {entry.flag && <span className="ml-1.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-red-500/15 text-red-600 dark:text-red-400">{entry.flag}</span>}
            </button>
          ))}
        </div>
      </Card>

      {step === 'import' && <ImportStep detail={data} onChanged={refresh} onReview={() => setStep('courses')} />}
      {step === 'courses' && (
        <CoursesStep id={id} detail={data} courses={courses.data ?? []} loading={courses.isLoading} onChanged={refresh} />
      )}
      {step === 'slots' && <Card className="p-5"><SlotTableEditor semester={semester} report={data.latestImport?.summary.slots ?? null} onSaved={refresh} /></Card>}
      {step === 'rules' && <Card className="p-5"><SemesterRulesEditor semester={semester} onSaved={refresh} /></Card>}
      {step === 'publish' && <PublishStep detail={data} onChanged={refresh} onFix={() => setStep('courses')} onSlots={() => setStep('slots')} />}
    </div>
  );
}

// ---------------------------------------------------------------- 1 · files and import

function ImportStep({ detail, onChanged, onReview }: { detail: SemesterDetail; onChanged: () => void; onReview: () => void }) {
  const { semester, files } = detail;
  const picker = useRef<HTMLInputElement>(null);
  const jsonPicker = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [needsLocal, setNeedsLocal] = useState(false);
  const [summary, setSummary] = useState<ImportSummary | null>(detail.latestImport?.summary ?? null);

  const upload = async (list: FileList | null) => {
    if (!list?.length) return;
    let failed = 0;
    for (const [index, file] of [...list].entries()) {
      setBusy(`Uploading ${index + 1} of ${list.length}…`);
      try {
        await api.uploadFile(semester.id, file);
      } catch (failure) {
        failed += 1;
        toast.error(`${file.name}: ${errorText(failure, 'upload failed')}`);
      }
    }
    setBusy(null);
    if (failed < list.length) toast.success(`${plural(list.length - failed, 'file')} uploaded.`);
    onChanged();
  };

  const run = async () => {
    setBusy('Reading the files…');
    try {
      setSummary(await api.runImport(semester.id));
      setNeedsLocal(false);
      onChanged();
    } catch (failure) {
      if (failure instanceof ApiError && failure.payload.importerUnavailable) setNeedsLocal(true);
      toast.error(errorText(failure, 'The import did not finish. Is the API reachable?'));
    } finally {
      setBusy(null);
    }
  };

  const importJson = async (file: File | undefined) => {
    if (!file) return;
    setBusy('Importing…');
    try {
      setSummary(await api.importParsed(semester.id, JSON.parse(await file.text())));
      onChanged();
    } catch (failure) {
      toast.error(failure instanceof SyntaxError ? 'That file is not JSON.' : errorText(failure, 'The import did not finish.'));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-4">
      <Card className="p-5 space-y-4">
        <div>
          <h3 className="text-sm font-semibold">Institute files</h3>
          <p className="text-[11px] text-muted-foreground mt-1">
            Upload every course workbook (.xlsx) and the slot-system document (.docx). Programme and branch are
            read from each file name, e.g. <code>03_UG_CSE_Jan-May-2027.xlsx</code>; set them by hand where a
            name does not say.
          </p>
        </div>

        <div
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => { event.preventDefault(); void upload(event.dataTransfer.files); }}
          className="rounded-xl border border-dashed border-border px-4 py-6 text-center"
        >
          <input ref={picker} type="file" multiple accept=".xlsx,.docx" className="hidden" onChange={(event) => { void upload(event.target.files); event.target.value = ''; }} />
          <Button variant="outline" onClick={() => picker.current?.click()} disabled={busy !== null} className="rounded-xl">
            <Upload className="h-4 w-4" /> Choose files
          </Button>
          <p className="text-xs text-muted-foreground mt-2">or drop them here · up to 20 MB each</p>
        </div>

        {files.length > 0 && (
          <ul className="divide-y divide-border/50 text-sm">
            {files.map((file) => (
              <FileRow key={file.id} semesterId={semester.id} file={file} onChanged={onChanged} />
            ))}
          </ul>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={() => void run()} disabled={busy !== null || !files.some((file) => file.kind === 'workbook')} className="rounded-xl">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileUp className="h-4 w-4" />}
            {busy ?? (summary ? 'Import again' : 'Import')}
          </Button>
          <input ref={jsonPicker} type="file" accept=".json,application/json" className="hidden" onChange={(event) => { void importJson(event.target.files?.[0]); event.target.value = ''; }} />
          <Button variant="ghost" onClick={() => jsonPicker.current?.click()} disabled={busy !== null} className="rounded-xl text-muted-foreground">
            Upload parsed JSON instead
          </Button>
        </div>
        {needsLocal && (
          <div className="text-xs rounded-lg px-3 py-2 bg-amber-500/10 border border-amber-500/30 space-y-1.5">
            <p>The API host has no Python, so it cannot read the workbooks itself. Run the same importer on your computer and upload its output:</p>
            <pre className="font-mono text-[11px] whitespace-pre-wrap break-all">
              python3 scripts/pipeline/import_semester.py --dir path/to/files --semester &quot;{semester.name}&quot; --out parsed.json
            </pre>
          </div>
        )}
        <p className="text-[11px] text-muted-foreground">
          Importing only fills the draft. Courses you corrected by hand keep the correction unless the
          institute changed their row. Nothing reaches students until you publish.
        </p>
      </Card>

      {summary && <ImportSummaryCard summary={summary} onReview={onReview} />}
    </div>
  );
}

function FileRow({ semesterId, file, onChanged }: { semesterId: number; file: api.SemesterFile; onChanged: () => void }) {
  const [branch, setBranch] = useState(file.branch ?? '');
  const [program, setProgram] = useState(file.program ?? '');
  const detected = /^\d+[a-z]?_(UG|PG)_/i.test(file.name);

  const save = async (nextProgram: string, nextBranch: string) => {
    try {
      await api.setFileTarget(semesterId, file.id, (nextProgram || null) as string | null, nextBranch.trim() || null);
      onChanged();
    } catch (failure) {
      toast.error(errorText(failure, 'Could not save.'));
    }
  };
  const remove = async () => {
    try {
      await api.deleteFile(semesterId, file.id);
      onChanged();
    } catch (failure) {
      toast.error(errorText(failure, 'Could not delete the file.'));
    }
  };

  return (
    <li className="flex flex-wrap items-center gap-2 py-2">
      <span className="min-w-0 flex-1 truncate" title={file.name}>{file.name}</span>
      {file.kind === 'slots' ? (
        <span className="text-xs text-muted-foreground">slot system</span>
      ) : (
        <>
          <select aria-label="Programme" value={program} onChange={(event) => { setProgram(event.target.value); void save(event.target.value, branch); }} className="px-2 py-1 rounded-lg bg-background border border-border text-xs">
            <option value="">{detected ? 'from name' : 'programme?'}</option>
            <option value="UG">UG</option>
            <option value="PG">PG</option>
          </select>
          <input aria-label="Branch" value={branch} onChange={(event) => setBranch(event.target.value)} onBlur={() => branch !== (file.branch ?? '') && void save(program, branch)} placeholder={detected ? 'branch from name' : 'branch?'} className="w-32 px-2 py-1 rounded-lg bg-background border border-border text-xs" />
        </>
      )}
      <span className="text-xs text-muted-foreground w-14 text-right">{Math.max(1, Math.round(file.size / 1024))} KB</span>
      <Button variant="ghost" size="icon" onClick={() => void remove()} title="Remove this file" className="h-7 w-7 text-muted-foreground hover:text-red-500">
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
    </li>
  );
}

function ImportSummaryCard({ summary, onReview }: { summary: ImportSummary; onReview: () => void }) {
  const tile = (value: number, label: string, className = '') => (
    <div className="rounded-xl bg-muted/40 px-3 py-2.5">
      <div className={`text-xl font-bold ${className}`}>{value}</div>
      <div className="text-[11px] text-muted-foreground">{label}</div>
    </div>
  );
  const list = (title: string, keys: string[]) =>
    keys.length > 0 && (
      <details className="text-xs">
        <summary className="cursor-pointer font-medium">{title} ({keys.length})</summary>
        <p className="mt-1 text-muted-foreground break-words">{keys.join(', ')}</p>
      </details>
    );

  return (
    <Card className="p-5 space-y-4">
      <h3 className="text-sm font-semibold">Import summary</h3>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {tile(summary.ok, 'read cleanly', 'text-green-600 dark:text-green-400')}
        {tile(summary.needsReview, 'to review', summary.needsReview > 0 ? 'text-amber-600 dark:text-amber-400' : '')}
        {tile(summary.invalid, 'must be fixed', summary.invalid > 0 ? 'text-red-500' : '')}
        {tile(summary.total, 'courses in the files')}
      </div>
      <div className="space-y-1.5">
        <p className="text-xs text-muted-foreground">
          Compared with the draft before this import: {summary.added.length} added, {summary.modified.length} changed,{' '}
          {summary.removed.length} no longer listed, {summary.unchanged} unchanged
          {summary.keptManual.length > 0 ? `, ${summary.keptManual.length} of your corrections kept` : ''}.
        </p>
        {list('Added', summary.added)}
        {list('Changed', summary.modified)}
        {list('No longer in the files', summary.removed)}
        {list('Your correction kept, but the source row changed — check these', summary.revalidate)}
      </div>

      {(summary.slots.status !== 'parsed' || summary.slots.issues.length > 0 || summary.slots.differs.length > 0) && (
        <div className="text-xs rounded-lg px-3 py-2 bg-amber-500/10 border border-amber-500/30 space-y-1">
          <p className="font-medium">Slot system</p>
          {summary.slots.status === 'missing' && <p>No slot document was uploaded; courses were checked against the slot table this semester already has.</p>}
          {summary.slots.status === 'failed' && <p>The slot document could not be read; the existing slot table was used. Check it in step 3.</p>}
          {summary.slots.differs.length > 0 && <p>The document differs from your confirmed slot table for: {summary.slots.differs.join(', ')}. Your table was kept.</p>}
          {summary.slots.issues.map((entry, index) => <p key={index}>{entry.message}</p>)}
        </div>
      )}
      {summary.warnings.length > 0 && (
        <details className="text-xs">
          <summary className="cursor-pointer font-medium text-amber-700 dark:text-amber-400">{plural(summary.warnings.length, 'file warning')}</summary>
          <ul className="mt-1 space-y-0.5 text-muted-foreground">
            {summary.warnings.map((warning, index) => (
              <li key={index}>{[warning.file, warning.sheet, warning.row && `row ${warning.row}`].filter(Boolean).join(' · ')}: {warning.message}</li>
            ))}
          </ul>
        </details>
      )}
      <Button onClick={onReview} className="rounded-xl">Review courses</Button>
    </Card>
  );
}

// ---------------------------------------------------------------- 2 · courses

type CourseFilter = 'problems' | 'invalid' | 'review' | 'changed' | 'manual' | 'removed' | 'all';

function CoursesStep({
  id, detail, courses, loading, onChanged,
}: { id: number; detail: SemesterDetail; courses: CourseListItem[]; loading: boolean; onChanged: () => void }) {
  const [filter, setFilter] = useState<CourseFilter>('problems');
  const [term, setTerm] = useState('');
  const [branch, setBranch] = useState('');
  const [editing, setEditing] = useState<number | null>(null);
  const [view, setView] = useState<'list' | 'preview'>('list');
  const [batch, setBatch] = useState('');
  const [adding, setAdding] = useState(false);

  const branches = useMemo(() => [...new Set(courses.map((course) => `${course.program}/${course.branch}`))].sort(), [courses]);
  const counts = useMemo(() => ({
    problems: courses.filter((c) => !c.removed && c.reviewStatus !== 'ok').length,
    invalid: courses.filter((c) => !c.removed && c.reviewStatus === 'invalid').length,
    review: courses.filter((c) => !c.removed && c.reviewStatus === 'needs_review').length,
    changed: courses.filter((c) => c.importChange && !['unchanged', 'kept_manual'].includes(c.importChange)).length,
    manual: courses.filter((c) => c.manual && !c.removed).length,
    removed: courses.filter((c) => c.removed).length,
    all: courses.filter((c) => !c.removed).length,
  }), [courses]);

  const shown = courses.filter((course) => {
    if (branch && `${course.program}/${course.branch}` !== branch) return false;
    const needle = term.trim().toLowerCase();
    if (needle && !`${course.courseCode} ${course.courseName}`.toLowerCase().includes(needle)) return false;
    switch (filter) {
      case 'problems': return !course.removed && course.reviewStatus !== 'ok';
      case 'invalid': return !course.removed && course.reviewStatus === 'invalid';
      case 'review': return !course.removed && course.reviewStatus === 'needs_review';
      case 'changed': return Boolean(course.importChange) && !['unchanged', 'kept_manual'].includes(course.importChange!);
      case 'manual': return course.manual && !course.removed;
      case 'removed': return course.removed;
      default: return !course.removed;
    }
  });

  const filters: Array<{ value: CourseFilter; label: string }> = [
    { value: 'problems', label: 'Needs attention' }, { value: 'invalid', label: 'Must fix' }, { value: 'review', label: 'To review' },
    { value: 'changed', label: 'Changed by import' }, { value: 'manual', label: 'Corrected by hand' },
    { value: 'removed', label: 'Removed' }, { value: 'all', label: 'All' },
  ];

  const previewBatch = Number(batch.replace(/\D/g, '')) || null;
  const previewMeetings = branch
    ? courses
        .filter((course) => !course.removed && `${course.program}/${course.branch}` === branch)
        .flatMap((course) => course.meetings
          .filter((meeting) => previewBatch === null || batchAllowed(meeting.batches, previewBatch))
          .map((meeting) => ({ ...meeting, label: course.courseCode })))
    : [];

  return (
    <Card className="p-5 space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-xl bg-muted/50 p-1">
          {(['list', 'preview'] as const).map((value) => (
            <button key={value} onClick={() => setView(value)} className={`text-sm font-medium py-1.5 px-3 rounded-lg ${view === value ? 'bg-background shadow-sm' : 'text-muted-foreground'}`}>
              {value === 'list' ? 'Courses' : 'Timetable preview'}
            </button>
          ))}
        </div>
        <select aria-label="Branch" value={branch} onChange={(event) => setBranch(event.target.value)} className={`${field} py-1.5`}>
          <option value="">{view === 'preview' ? 'Choose a branch…' : 'All branches'}</option>
          {branches.map((value) => <option key={value} value={value}>{value}</option>)}
        </select>
        {view === 'list' ? (
          <div className="relative flex-1 min-w-[10rem]">
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input value={term} onChange={(event) => setTerm(event.target.value)} placeholder="Search code or name…" className={`${field} w-full pl-9 py-1.5`} />
          </div>
        ) : (
          <input value={batch} onChange={(event) => setBatch(event.target.value)} placeholder="Batch, e.g. B7 (optional)" className={`${field} py-1.5 w-52`} />
        )}
        <Button variant="outline" size="sm" onClick={() => setAdding(true)} className="rounded-lg ml-auto"><Plus className="h-4 w-4" /> Add course</Button>
      </div>

      {view === 'preview' ? (
        branch ? (
          <>
            <p className="text-xs text-muted-foreground">
              Every class of every course in {branch}{previewBatch ? ` for batch B${previewBatch}` : ''}, as the draft
              stands. Side-by-side blocks are courses at the same time (normal for electives).
            </p>
            <WeekPreview meetings={previewMeetings} emptyText="No classes in this branch yet." />
          </>
        ) : (
          <p className="text-sm text-muted-foreground">Choose a branch to see its week.</p>
        )
      ) : (
        <>
          <div className="flex flex-wrap gap-1.5">
            {filters.map((entry) => (
              <button
                key={entry.value}
                onClick={() => setFilter(entry.value)}
                className={`text-xs font-medium py-1 px-2.5 rounded-full border transition-colors ${
                  filter === entry.value ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:text-foreground'
                }`}
              >
                {entry.label} {counts[entry.value]}
              </button>
            ))}
          </div>

          {loading ? (
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          ) : shown.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">
              {filter === 'problems' && courses.length > 0 ? 'Nothing needs attention.' : courses.length === 0 ? 'No courses yet. Import the files in step 1.' : 'No courses match.'}
            </p>
          ) : (
            <ul className="divide-y divide-border/50 max-h-[36rem] overflow-y-auto">
              {shown.map((course) => (
                <li key={course.id}>
                  <button onClick={() => setEditing(course.id)} className="w-full text-left py-2.5 px-1 hover:bg-muted/40 rounded-lg transition-colors">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className={`h-2 w-2 rounded-full shrink-0 ${course.removed ? 'bg-muted-foreground' : course.reviewStatus === 'invalid' ? 'bg-red-500' : course.reviewStatus === 'needs_review' ? 'bg-amber-500' : 'bg-green-500'}`} />
                      <span className="font-semibold text-sm">{course.courseCode}</span>
                      <span className="text-sm text-muted-foreground truncate max-w-[18rem]">{course.courseName}</span>
                      <span className="text-[11px] text-muted-foreground">{course.program}/{course.branch}</span>
                      {course.manual && <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary font-medium">corrected</span>}
                      {course.importChange === 'added' && <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-500/10 text-green-700 dark:text-green-400 font-medium">new</span>}
                      {course.importChange === 'modified' && <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-700 dark:text-amber-400 font-medium">changed</span>}
                      <span className="text-xs text-muted-foreground ml-auto">
                        {course.rawSlot ? `${course.rawSlot.slice(0, 28)} · ` : ''}{course.meetings.length === 1 ? '1 class' : `${course.meetings.length} classes`}
                      </span>
                    </div>
                    {course.issues.map((entry, index) => (
                      <p key={index} className={`text-xs mt-1 ml-4 ${entry.severity === 'blocking' ? 'text-red-500' : 'text-amber-700 dark:text-amber-400'}`}>
                        {entry.severity === 'blocking' ? 'Must fix: ' : 'Check: '}{entry.message}
                      </p>
                    ))}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      <CourseScheduleEditor
        semesterId={id}
        courseId={editing}
        slots={detail.semester.slotDefinitions}
        onClose={(changed) => { setEditing(null); if (changed) onChanged(); }}
      />
      {adding && <AddCourseDialog semesterId={id} branches={branches} onClose={(created) => { setAdding(false); if (created) { onChanged(); setEditing(created); } }} />}
    </Card>
  );
}

function AddCourseDialog({ semesterId, branches, onClose }: { semesterId: number; branches: string[]; onClose: (createdId: number | null) => void }) {
  const [target, setTarget] = useState(branches[0] ?? 'UG/CSE');
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);

  const create = async () => {
    const [program, branch] = target.split('/');
    setBusy(true);
    try {
      const created = await api.createCourse(semesterId, { program, branch, courseCode: code, courseName: name });
      onClose(created.id);
    } catch (failure) {
      toast.error(errorText(failure, 'Could not add the course.'));
      setBusy(false);
    }
  };

  return (
    <AlertDialog open onOpenChange={(open) => !open && onClose(null)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Add a course by hand</AlertDialogTitle>
          <AlertDialogDescription>For a course the files do not list. You set its slots next.</AlertDialogDescription>
        </AlertDialogHeader>
        <div className="space-y-2">
          <input value={target} onChange={(event) => setTarget(event.target.value)} list="known-branches" placeholder="UG/CSE" className={`${field} w-full`} />
          <datalist id="known-branches">{branches.map((value) => <option key={value} value={value} />)}</datalist>
          <input value={code} onChange={(event) => setCode(event.target.value)} placeholder="Course code" className={`${field} w-full`} />
          <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Course name" className={`${field} w-full`} />
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <Button onClick={() => void create()} disabled={busy || !/^(UG|PG)\/.+/.test(target) || code.trim().length < 2 || !name.trim()}>Add</Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// ---------------------------------------------------------------- 5 · publish

function PublishStep({
  detail, onChanged, onFix, onSlots,
}: { detail: SemesterDetail; onChanged: () => void; onFix: () => void; onSlots: () => void }) {
  const { semester, publishCheck, snapshots } = detail;
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{ kind: 'activate' } | { kind: 'rollback'; version: number } | null>(null);

  const act = async (label: string, action: () => Promise<unknown>, done: string) => {
    setBusy(label);
    try {
      await action();
      toast.success(done);
      setNote('');
      onChanged();
    } catch (failure) {
      toast.error(errorText(failure, 'That did not go through. Is the API reachable?'));
    } finally {
      setBusy(null);
      setConfirm(null);
    }
  };

  const check = (ok: boolean, text: string, fix?: { label: string; onClick: () => void }) => (
    <li className="flex flex-wrap items-center gap-2 text-sm">
      {ok ? <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" /> : <AlertTriangle className="h-4 w-4 text-red-500 shrink-0" />}
      <span>{text}</span>
      {!ok && fix && <button onClick={fix.onClick} className="text-xs text-primary font-medium">{fix.label}</button>}
    </li>
  );

  return (
    <div className="space-y-4">
      <Card className="p-5 space-y-4">
        <div>
          <h3 className="text-sm font-semibold">Publish</h3>
          <p className="text-[11px] text-muted-foreground mt-1">
            Publishing copies the draft to what students can see, all at once, and records it as a numbered
            version you can go back to. It only touches this semester&rsquo;s courses.
          </p>
        </div>
        <ul className="space-y-1.5">
          {check(publishCheck.courseCount > 0, `${plural(publishCheck.courseCount, 'course')} in the draft`)}
          {check(publishCheck.slotsConfirmed, publishCheck.slotsConfirmed ? 'Slot table confirmed' : 'The slot table has not been confirmed', { label: 'Check it', onClick: onSlots })}
          {check(publishCheck.blocking.length === 0,
            publishCheck.blocking.length === 0 ? 'No course has an unresolved error' : `${plural(publishCheck.blocking.length, 'course')} must be fixed: ${publishCheck.blocking.slice(0, 6).map((entry) => entry.key.split('/').pop()).join(', ')}${publishCheck.blocking.length > 6 ? '…' : ''}`,
            { label: 'Fix them', onClick: onFix })}
          {publishCheck.needsReview > 0 && (
            <li className="flex items-center gap-2 text-sm text-amber-700 dark:text-amber-400">
              <AlertTriangle className="h-4 w-4 shrink-0" /> {plural(publishCheck.needsReview, 'course')} still marked for review — allowed, but worth a look.
            </li>
          )}
        </ul>
        <div className="flex flex-wrap gap-2">
          <input value={note} maxLength={300} onChange={(event) => setNote(event.target.value)} placeholder="What changed? (optional, for the history)" className={`${field} flex-1 min-w-[12rem]`} />
          <Button
            onClick={() => void act('publish', () => api.publishSemester(semester.id, note), `${semester.name} published.`)}
            disabled={busy !== null || !publishCheck.ready}
            className="rounded-xl"
          >
            {busy === 'publish' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Rocket className="h-4 w-4" />}
            {semester.publishedVersion === 0 ? 'Publish' : `Publish v${semester.publishedVersion + 1}`}
          </Button>
        </div>
        {semester.publishedVersion > 0 && publishCheck.unpublishedChanges === 0 && (
          <p className="text-xs text-muted-foreground">The draft matches what is published.</p>
        )}
      </Card>

      <Card className="p-5 space-y-3">
        <h3 className="text-sm font-semibold">Current semester</h3>
        {semester.status === 'active' ? (
          <p className="text-sm text-muted-foreground">
            {semester.name} is the current semester: students&rsquo; timetables, selections and requests all belong to it.
          </p>
        ) : semester.status === 'draft' ? (
          <p className="text-sm text-muted-foreground">Publish first. A published semester is shown to students as upcoming until you make it current.</p>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              {semester.status === 'archived'
                ? 'This semester is archived. Making it current again restores students’ selections and timings for it.'
                : 'Students can browse this semester’s courses as upcoming. Their timetable does not change until you make it current.'}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => setConfirm({ kind: 'activate' })} disabled={busy !== null} className="rounded-xl">Make current</Button>
              {semester.status === 'published' && (
                <Button variant="ghost" onClick={() => void act('archive', () => api.archiveSemester(semester.id), `${semester.name} archived.`)} disabled={busy !== null} className="rounded-xl text-muted-foreground">
                  Hide from students (archive)
                </Button>
              )}
            </div>
          </>
        )}
      </Card>

      {snapshots.length > 0 && (
        <Card className="p-5 space-y-3">
          <h3 className="text-sm font-semibold">Published versions</h3>
          <ul className="divide-y divide-border/50 text-sm">
            {snapshots.map((snapshot) => (
              <li key={snapshot.version} className="flex flex-wrap items-center gap-2 py-2">
                <span className="font-semibold">v{snapshot.version}</span>
                <span className="text-xs text-muted-foreground">
                  {snapshot.kind} · {plural(snapshot.courseCount, 'course')} · {day(snapshot.createdAt)}{snapshot.createdBy ? ` · ${snapshot.createdBy}` : ''}
                  {snapshot.note ? ` · ${snapshot.note}` : ''}
                </span>
                {snapshot.version !== semester.publishedVersion && (
                  <Button variant="ghost" size="sm" onClick={() => setConfirm({ kind: 'rollback', version: snapshot.version })} disabled={busy !== null} className="ml-auto h-7 rounded-lg">
                    <Undo2 className="h-3.5 w-3.5" /> Go back to this
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}

      <AlertDialog open={confirm !== null} onOpenChange={(open) => !open && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirm?.kind === 'activate' ? `Make ${semester.name} the current semester?` : `Go back to version ${confirm?.kind === 'rollback' ? confirm.version : ''}?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirm?.kind === 'activate'
                ? 'Every student moves to this semester and starts with an empty course selection for it. The semester that is current now is archived, with its courses and everyone’s selections and timings kept. Requests still waiting for it are closed. You can switch back the same way.'
                : 'The draft and the published timetable both return to that version, including any timetable changes approved since. It is recorded as a new version, so it can be undone.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                void (confirm?.kind === 'activate'
                  ? act('activate', () => api.activateSemester(semester.id), `${semester.name} is now the current semester.`)
                  : confirm?.kind === 'rollback'
                    ? act('rollback', () => api.rollbackSemester(semester.id, confirm.version), `Rolled back to version ${confirm.version}.`)
                    : undefined)
              }
            >
              {confirm?.kind === 'activate' ? 'Make current' : 'Roll back'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
