import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ShieldCheck, Search, Loader2, Save, ArrowLeft, Clock, UtensilsCrossed, CalendarDays, History,
  FileDiff,
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuthStore } from '@/store/useAuthStore';
import { apiFetch, ApiError } from '@/services/api';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const MEALS = ['Breakfast', 'Lunch', 'Snacks', 'Dinner'];

interface CourseHit {
  id: string;
  course_code: string;
  course_name: string;
  program: string;
  branch: string;
  raw_slot: string | null;
}

interface Meeting {
  type: string;
  day: string;
  startTime?: string;
  start_time?: string;
  endTime?: string;
  end_time?: string;
  room?: string | null;
}

function Feedback({ message }: { message: { kind: 'ok' | 'error'; text: string } | null }) {
  if (!message) return null;
  return (
    <p
      className={`text-sm rounded-lg px-3 py-2 border ${
        message.kind === 'ok'
          ? 'text-green-700 dark:text-green-400 bg-green-500/10 border-green-500/20'
          : 'text-red-500 bg-red-500/10 border-red-500/20'
      }`}
    >
      {message.text}
    </p>
  );
}

/** Course slot editor: search, preview the expansion, then save. */
function CourseSlotEditor() {
  const queryClient = useQueryClient();
  const [term, setTerm] = useState('');
  const [hits, setHits] = useState<CourseHit[]>([]);
  const [selected, setSelected] = useState<CourseHit | null>(null);
  const [expression, setExpression] = useState('');
  const [preview, setPreview] = useState<Meeting[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  const search = async () => {
    if (term.trim().length < 2) return;
    setBusy(true);
    setMessage(null);
    try {
      setHits(await apiFetch<CourseHit[]>(`/api/admin/courses?q=${encodeURIComponent(term.trim())}`));
    } catch (error) {
      setMessage({ kind: 'error', text: error instanceof ApiError ? error.message : 'Search failed.' });
    } finally {
      setBusy(false);
    }
  };

  const runPreview = async (expr: string) => {
    if (!expr.trim()) {
      setPreview(null);
      return;
    }
    try {
      const result = await apiFetch<{ meetings: Meeting[]; notes: string[]; unknown: string[] }>(
        '/api/admin/slots/preview',
        { method: 'POST', body: { expression: expr } },
      );
      setPreview(result.meetings);
      if (result.unknown.length) {
        setMessage({ kind: 'error', text: `Unknown slot code: ${result.unknown.join(', ')}` });
      } else if (result.notes.length) {
        setMessage({ kind: 'error', text: `Not interpreted automatically: ${result.notes.join('; ')}` });
      } else {
        setMessage(null);
      }
    } catch {
      setPreview(null);
    }
  };

  const save = async () => {
    if (!selected) return;
    setBusy(true);
    try {
      await apiFetch(`/api/admin/courses/${encodeURIComponent(selected.id)}/schedule`, {
        method: 'PUT',
        body: { rawSlot: expression },
      });
      setMessage({ kind: 'ok', text: `Saved. ${selected.course_code} now uses "${expression}".` });
      // Students' cached timetable is now stale.
      void queryClient.invalidateQueries();
    } catch (error) {
      setMessage({ kind: 'error', text: error instanceof ApiError ? error.message : 'Save failed.' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <input
          value={term}
          onChange={(event) => setTerm(event.target.value)}
          onKeyDown={(event) => event.key === 'Enter' && search()}
          placeholder="Search course code or name…"
          className="flex-1 px-3.5 py-2.5 rounded-xl bg-background border border-border text-sm"
        />
        <Button onClick={search} disabled={busy} className="rounded-xl">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
        </Button>
      </div>

      {hits.length > 0 && !selected && (
        <div className="space-y-1.5 max-h-64 overflow-y-auto">
          {hits.map((hit) => (
            <button
              key={hit.id}
              onClick={() => {
                setSelected(hit);
                setExpression(hit.raw_slot ?? '');
                void runPreview(hit.raw_slot ?? '');
              }}
              className="w-full text-left px-3 py-2 rounded-lg border border-border/60 hover:bg-muted/50 transition"
            >
              <div className="text-sm font-medium">
                {hit.course_code} — {hit.course_name}
              </div>
              <div className="text-xs text-muted-foreground">
                {hit.program}/{hit.branch} · slot: {hit.raw_slot || '(none)'}
              </div>
            </button>
          ))}
        </div>
      )}

      {selected && (
        <div className="space-y-3 border border-border/60 rounded-xl p-4">
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="font-semibold">{selected.course_code}</div>
              <div className="text-xs text-muted-foreground">
                {selected.course_name} · {selected.program}/{selected.branch}
              </div>
            </div>
            <Button variant="ghost" size="sm" onClick={() => { setSelected(null); setPreview(null); setMessage(null); }}>
              Change
            </Button>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1.5">Slot expression</label>
            <input
              value={expression}
              onChange={(event) => {
                setExpression(event.target.value);
                void runPreview(event.target.value);
              }}
              placeholder="e.g. D [Mon,Wed], E [Fri] + PA5"
              className="w-full px-3.5 py-2.5 rounded-xl bg-background border border-border text-sm font-mono"
            />
            <p className="text-[11px] text-muted-foreground mt-1.5">
              Combine slots with <code>+</code> or <code>,</code>. Restrict days with
              <code className="mx-1">[Mon,Wed]</code> or <code>(Fri)</code>.
            </p>
          </div>

          {preview && (
            <div className="bg-muted/40 rounded-lg p-3">
              <div className="text-xs font-semibold mb-1.5 text-muted-foreground uppercase tracking-wide">
                Resulting classes ({preview.length})
              </div>
              {preview.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nothing — check the slot codes.</p>
              ) : (
                <ul className="text-sm space-y-0.5">
                  {preview.map((m, i) => (
                    <li key={i} className="flex gap-2">
                      <span className="w-16 text-muted-foreground">{m.type}</span>
                      <span className="w-24">{m.day}</span>
                      <span className="font-mono text-xs">
                        {m.startTime ?? m.start_time}–{m.endTime ?? m.end_time}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          <Feedback message={message} />

          <Button onClick={save} disabled={busy || !preview?.length} className="rounded-xl">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save schedule
          </Button>
        </div>
      )}
    </div>
  );
}

function MessTimingsEditor() {
  const queryClient = useQueryClient();
  const [dayType, setDayType] = useState<'weekday' | 'weekend'>('weekday');
  const [meal, setMeal] = useState('Breakfast');
  const [timing, setTiming] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  const save = async () => {
    setBusy(true);
    try {
      await apiFetch(`/api/admin/mess-timings/${dayType}/${meal}`, {
        method: 'PUT',
        body: { timing },
      });
      setMessage({ kind: 'ok', text: `${meal} (${dayType}) updated.` });
      void queryClient.invalidateQueries({ queryKey: ['mess'] });
    } catch (error) {
      setMessage({ kind: 'error', text: error instanceof ApiError ? error.message : 'Save failed.' });
    } finally {
      setBusy(false);
    }
  };

  const field = 'w-full px-3.5 py-2.5 rounded-xl bg-background border border-border text-sm';

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <select value={dayType} onChange={(e) => setDayType(e.target.value as 'weekday' | 'weekend')} className={field}>
          <option value="weekday">Weekday</option>
          <option value="weekend">Weekend / Holiday</option>
        </select>
        <select value={meal} onChange={(e) => setMeal(e.target.value)} className={field}>
          {MEALS.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
      </div>
      <input
        value={timing}
        onChange={(e) => setTiming(e.target.value)}
        placeholder="7:20 AM - 9:30 AM"
        className={field}
      />
      <Feedback message={message} />
      <Button onClick={save} disabled={busy || !timing.trim()} className="rounded-xl">
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save timing
      </Button>
    </div>
  );
}

function MessMenuEditor() {
  const queryClient = useQueryClient();
  const [mess, setMess] = useState('kedaram');
  const [cycle, setCycle] = useState('week13');
  const [day, setDay] = useState('Monday');
  const [meal, setMeal] = useState('Breakfast');
  const [items, setItems] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  const save = async () => {
    setBusy(true);
    try {
      const list = items.split(',').map((s) => s.trim()).filter(Boolean);
      await apiFetch(`/api/admin/mess/${mess}/${mess === 'nila' ? 'all' : cycle}/${day}/${meal}`, {
        method: 'PUT',
        body: { items: list },
      });
      setMessage({ kind: 'ok', text: `${mess} ${day} ${meal} updated (${list.length} items).` });
      void queryClient.invalidateQueries({ queryKey: ['mess'] });
    } catch (error) {
      setMessage({ kind: 'error', text: error instanceof ApiError ? error.message : 'Save failed.' });
    } finally {
      setBusy(false);
    }
  };

  const field = 'w-full px-3.5 py-2.5 rounded-xl bg-background border border-border text-sm';

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <select value={mess} onChange={(e) => setMess(e.target.value)} className={field}>
          <option value="kedaram">Kedaram</option>
          <option value="nila">Nila</option>
        </select>
        <select value={cycle} onChange={(e) => setCycle(e.target.value)} disabled={mess === 'nila'} className={field}>
          <option value="week13">Odd weeks (1 &amp; 3)</option>
          <option value="week24">Even weeks (2 &amp; 4)</option>
        </select>
        <select value={day} onChange={(e) => setDay(e.target.value)} className={field}>
          {DAYS.map((d) => <option key={d} value={d}>{d}</option>)}
        </select>
        <select value={meal} onChange={(e) => setMeal(e.target.value)} className={field}>
          {MEALS.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
      </div>
      <textarea
        value={items}
        onChange={(e) => setItems(e.target.value)}
        rows={3}
        placeholder="Idli, Wada, Sambhar, Chatni"
        className={field}
      />
      <p className="text-[11px] text-muted-foreground">Comma-separated. Replaces the whole item list for that meal.</p>
      <Feedback message={message} />
      <Button onClick={save} disabled={busy || !items.trim()} className="rounded-xl">
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save menu
      </Button>
    </div>
  );
}

/** Shows what currently overrides src/data, and therefore survives a reseed. */
function Customizations() {
  const { data, isLoading } = useQuery({
    queryKey: ['admin-customizations'],
    queryFn: () => apiFetch<Array<{ kind: string; label: string; customizedAt: string | null }>>(
      '/api/admin/customizations',
    ),
    staleTime: 30_000,
  });

  if (isLoading) return <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />;

  if (!data?.length) {
    return (
      <p className="text-sm text-muted-foreground">
        Nothing overridden — the database matches the files in <code>src/data</code>.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        {data.length} value{data.length === 1 ? '' : 's'} edited here rather than in the source
        files. These survive <code className="px-1 rounded bg-muted text-xs">npm run seed</code>;
        only <code className="px-1 rounded bg-muted text-xs">npm run seed:reset</code> reverts them.
      </p>
      <ul className="space-y-1.5 max-h-96 overflow-y-auto text-sm">
        {data.map((row, index) => (
          <li key={index} className="flex flex-wrap gap-x-2 border-b border-border/40 pb-1.5">
            <span className="text-xs font-semibold text-primary w-28 shrink-0">{row.kind}</span>
            <span className="truncate">{row.label}</span>
            {row.customizedAt && (
              <span className="text-xs text-muted-foreground ml-auto">
                {new Date(row.customizedAt).toLocaleDateString('en-IN')}
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function AuditTrail() {
  const { data, isLoading } = useQuery({
    queryKey: ['admin-audit'],
    queryFn: () => apiFetch<Array<{
      id: number; actor_roll: string | null; action: string; target: string; created_at: string;
    }>>('/api/admin/audit'),
    staleTime: 30_000,
  });

  if (isLoading) return <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />;
  if (!data?.length) return <p className="text-sm text-muted-foreground">No changes recorded yet.</p>;

  return (
    <ul className="space-y-1.5 max-h-96 overflow-y-auto text-sm">
      {data.map((row) => (
        <li key={row.id} className="flex flex-wrap gap-x-2 border-b border-border/40 pb-1.5">
          <span className="font-mono text-xs text-muted-foreground">
            {new Date(row.created_at).toLocaleString('en-IN')}
          </span>
          <span className="font-medium">{row.action}</span>
          <span className="text-muted-foreground truncate">{row.target}</span>
          <span className="text-xs text-muted-foreground ml-auto">{row.actor_roll}</span>
        </li>
      ))}
    </ul>
  );
}

export default function Admin() {
  const account = useAuthStore((state) => state.account);
  const navigate = useNavigate();

  if (account?.role !== 'admin') {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <Card className="p-6 max-w-sm text-center space-y-3">
          <ShieldCheck className="h-8 w-8 text-muted-foreground mx-auto" />
          <h1 className="text-lg font-semibold">Developer access only</h1>
          <p className="text-sm text-muted-foreground">
            Sign in with an administrator account to use these tools.
          </p>
          <Button variant="outline" onClick={() => navigate('/')} className="rounded-xl">
            <ArrowLeft className="h-4 w-4" /> Back to app
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-6 max-w-3xl">
      <div className="flex items-center gap-3 mb-6">
        <Button variant="outline" size="icon" onClick={() => navigate('/')} className="rounded-xl">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ShieldCheck className="h-6 w-6 text-primary" /> Developer tools
          </h1>
          <p className="text-sm text-muted-foreground">
            Changes go live immediately — no redeploy needed.
          </p>
        </div>
      </div>

      <Tabs defaultValue="courses">
        <TabsList className="grid grid-cols-5 mb-5">
          <TabsTrigger value="courses"><CalendarDays className="h-4 w-4 mr-1" />Slots</TabsTrigger>
          <TabsTrigger value="menu"><UtensilsCrossed className="h-4 w-4 mr-1" />Menu</TabsTrigger>
          <TabsTrigger value="timings"><Clock className="h-4 w-4 mr-1" />Timings</TabsTrigger>
          <TabsTrigger value="edits"><FileDiff className="h-4 w-4 mr-1" />Edits</TabsTrigger>
          <TabsTrigger value="audit"><History className="h-4 w-4 mr-1" />Log</TabsTrigger>
        </TabsList>

        <TabsContent value="courses"><Card className="p-5"><CourseSlotEditor /></Card></TabsContent>
        <TabsContent value="menu"><Card className="p-5"><MessMenuEditor /></Card></TabsContent>
        <TabsContent value="timings"><Card className="p-5"><MessTimingsEditor /></Card></TabsContent>
        <TabsContent value="edits"><Card className="p-5"><Customizations /></Card></TabsContent>
        <TabsContent value="audit"><Card className="p-5"><AuditTrail /></Card></TabsContent>
      </Tabs>
    </div>
  );
}
