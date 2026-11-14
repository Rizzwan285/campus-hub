import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, PencilLine, Plus, Save, Star, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { apiFetch, ApiError } from '@/services/api';
import { getCurrentTimeInKolkata } from '@/utils/dateUtils';
import {
  formatServiceExceptions,
  formatServiceWindow,
  serviceStatus,
  type ServiceStatus,
} from '@/lib/specialServices';
import type { SpecialService } from '@/data/specialServiceData';

interface Draft {
  title: string;
  note: string;
  startDate: string;
  endDate: string;
  skipSundays: boolean;
  skipDates: string;
  nilaToSahyadri: string;
  sahyadriToNila: string;
}

const EMPTY_DRAFT: Draft = {
  title: '',
  note: '',
  startDate: '',
  endDate: '',
  skipSundays: true,
  skipDates: '',
  nilaToSahyadri: '',
  sahyadriToNila: '',
};

const toDraft = (service: SpecialService): Draft => ({
  title: service.title,
  note: service.note ?? '',
  startDate: service.startDate,
  endDate: service.endDate,
  skipSundays: service.skipSundays,
  skipDates: service.skipDates.join(', '),
  nilaToSahyadri: service.nilaToSahyadri.join(', '),
  sahyadriToNila: service.sahyadriToNila.join(', '),
});

/** "9:05 AM, 9:10 AM" or one per line → trimmed entries. The API validates them. */
const splitList = (text: string) =>
  text
    .split(/[,\n]/)
    .map((entry) => entry.trim())
    .filter(Boolean);

const STATUS_LABEL: Record<ServiceStatus, string> = {
  upcoming: 'Upcoming',
  running: 'Running',
  ended: 'Ended',
};

const STATUS_STYLE: Record<ServiceStatus, string> = {
  upcoming: 'text-primary bg-primary/10',
  running: 'text-green-700 dark:text-green-400 bg-green-500/10',
  ended: 'text-muted-foreground bg-muted',
};

/**
 * Temporary bus services — exam shuttles and the like.
 *
 * A service shows on the bus card only on the dates it runs and disappears by
 * itself the day after its last one, so deleting is housekeeping (or a way to
 * pull one early), not something that has to happen on time.
 */
export function SpecialServicesEditor() {
  const queryClient = useQueryClient();
  const { data, isLoading, isError } = useQuery({
    queryKey: ['admin-special-services'],
    queryFn: () => apiFetch<SpecialService[]>('/api/admin/special-services'),
    staleTime: 30_000,
  });

  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  // null = adding a new service; otherwise the id being edited.
  const [editingId, setEditingId] = useState<SpecialService['id'] | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState<SpecialService['id'] | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((current) => ({ ...current, [key]: value }));

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ['admin-special-services'] });
    // The bus card reads this list, so every open dashboard should pick it up.
    void queryClient.invalidateQueries({ queryKey: ['special-services'] });
  };

  const reset = () => {
    setDraft(EMPTY_DRAFT);
    setEditingId(null);
  };

  const save = async () => {
    setBusy(true);
    try {
      const body = {
        title: draft.title.trim(),
        note: draft.note.trim() || null,
        startDate: draft.startDate,
        endDate: draft.endDate,
        skipSundays: draft.skipSundays,
        skipDates: splitList(draft.skipDates),
        nilaToSahyadri: splitList(draft.nilaToSahyadri),
        sahyadriToNila: splitList(draft.sahyadriToNila),
      };

      if (editingId === null) {
        await apiFetch('/api/admin/special-services', { method: 'POST', body });
      } else {
        await apiFetch(`/api/admin/special-services/${editingId}`, { method: 'PUT', body });
      }

      setMessage({ kind: 'ok', text: `${body.title} ${editingId === null ? 'added' : 'updated'}.` });
      reset();
      await refresh();
    } catch (error) {
      setMessage({ kind: 'error', text: error instanceof ApiError ? error.message : 'Save failed.' });
    } finally {
      setBusy(false);
    }
  };

  const remove = async (service: SpecialService) => {
    setBusy(true);
    try {
      await apiFetch(`/api/admin/special-services/${service.id}`, { method: 'DELETE' });
      setMessage({ kind: 'ok', text: `${service.title} removed.` });
      if (editingId === service.id) reset();
      await refresh();
    } catch (error) {
      setMessage({ kind: 'error', text: error instanceof ApiError ? error.message : 'Delete failed.' });
    } finally {
      setConfirmingDelete(null);
      setBusy(false);
    }
  };

  const field = 'w-full px-3.5 py-2.5 rounded-xl bg-background border border-border text-sm';
  const label = 'text-[11px] font-medium text-muted-foreground';
  const today = getCurrentTimeInKolkata();

  const canSave =
    draft.title.trim() !== '' &&
    draft.startDate !== '' &&
    draft.endDate !== '' &&
    draft.endDate >= draft.startDate &&
    splitList(draft.nilaToSahyadri).length + splitList(draft.sahyadriToNila).length > 0;

  return (
    <div className="space-y-3">
      <div>
        <h2 className="text-sm font-semibold flex items-center gap-2">
          <Star className="h-4 w-4 text-primary" /> Special services
        </h2>
        <p className="text-[11px] text-muted-foreground mt-1">
          Extra buses for a fixed run of dates, such as an exam shuttle. They appear on the bus
          card only on the days they run and stop showing by themselves the day after the last
          one — delete a service here to pull it sooner or to tidy up afterwards.
        </p>
      </div>

      {isLoading ? (
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      ) : isError ? (
        <p className="text-sm text-red-500">
          Could not load the services. If this is a fresh deploy, run the database migration first.
        </p>
      ) : (data ?? []).length === 0 ? (
        <p className="text-sm text-muted-foreground">No special services.</p>
      ) : (
        <ul className="space-y-2 text-sm">
          {(data ?? []).map((service) => {
            const status = serviceStatus(service, today);
            const exceptions = formatServiceExceptions(service);
            return (
              <li key={service.id} className="rounded-xl border border-border/60 p-3 space-y-1.5">
                <div className="flex items-center gap-2">
                  <span className="font-medium truncate">{service.title}</span>
                  <span className={`text-[10px] uppercase tracking-wide rounded px-1.5 py-0.5 shrink-0 ${STATUS_STYLE[status]}`}>
                    {STATUS_LABEL[status]}
                  </span>
                  <div className="ml-auto flex items-center gap-1 shrink-0">
                    {confirmingDelete === service.id ? (
                      <>
                        <Button
                          variant="destructive"
                          size="sm"
                          disabled={busy}
                          onClick={() => remove(service)}
                          className="h-7 px-2 text-xs"
                        >
                          Delete
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={busy}
                          onClick={() => setConfirmingDelete(null)}
                          className="h-7 px-2 text-xs"
                        >
                          Keep
                        </Button>
                      </>
                    ) : (
                      <>
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={busy}
                          aria-label={`Edit ${service.title}`}
                          onClick={() => {
                            setEditingId(service.id);
                            setDraft(toDraft(service));
                            setMessage(null);
                          }}
                          className="h-7 px-2 text-muted-foreground"
                        >
                          <PencilLine className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={busy}
                          aria-label={`Delete ${service.title}`}
                          onClick={() => setConfirmingDelete(service.id)}
                          className="h-7 px-2 text-muted-foreground hover:text-red-500"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </>
                    )}
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  {formatServiceWindow(service)}
                  {exceptions ? `, except ${exceptions}` : ''}
                  {service.note ? ` · ${service.note}` : ''}
                </p>
                <p className="text-xs">
                  <span className="text-muted-foreground">Nila → Sahyadri: </span>
                  {service.nilaToSahyadri.join(', ') || '—'}
                </p>
                <p className="text-xs">
                  <span className="text-muted-foreground">Sahyadri → Nila: </span>
                  {service.sahyadriToNila.join(', ') || '—'}
                </p>
              </li>
            );
          })}
        </ul>
      )}

      <div className="pt-3 border-t border-border/40 space-y-3">
        <h3 className="text-xs font-semibold flex items-center gap-1.5">
          {editingId === null ? <Plus className="h-3.5 w-3.5" /> : <PencilLine className="h-3.5 w-3.5" />}
          {editingId === null ? 'Add a service' : 'Edit service'}
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="space-y-1">
            <span className={label}>Name shown on the bus card</span>
            <input
              value={draft.title}
              onChange={(e) => set('title', e.target.value)}
              placeholder="Exam shuttle"
              maxLength={60}
              className={field}
            />
          </label>
          <label className="space-y-1">
            <span className={label}>Note (optional)</span>
            <input
              value={draft.note}
              onChange={(e) => set('note', e.target.value)}
              placeholder="End-semester examinations"
              maxLength={200}
              className={field}
            />
          </label>
          <label className="space-y-1">
            <span className={label}>First day</span>
            <input type="date" value={draft.startDate} onChange={(e) => set('startDate', e.target.value)} className={field} />
          </label>
          <label className="space-y-1">
            <span className={label}>Last day</span>
            <input
              type="date"
              value={draft.endDate}
              min={draft.startDate || undefined}
              onChange={(e) => set('endDate', e.target.value)}
              className={field}
            />
          </label>
        </div>

        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input
            type="checkbox"
            checked={draft.skipSundays}
            onChange={(e) => set('skipSundays', e.target.checked)}
            className="h-4 w-4 accent-primary"
          />
          No service on Sundays
        </label>

        <label className="space-y-1 block">
          <span className={label}>Other days without service, as YYYY-MM-DD, comma separated</span>
          <input
            value={draft.skipDates}
            onChange={(e) => set('skipDates', e.target.value)}
            placeholder="2026-11-24"
            className={`${field} font-mono`}
          />
        </label>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="space-y-1">
            <span className={label}>Nila → Sahyadri, with AM/PM</span>
            <input
              value={draft.nilaToSahyadri}
              onChange={(e) => set('nilaToSahyadri', e.target.value)}
              placeholder="9:05 AM, 9:10 AM, 12:50 PM"
              className={field}
            />
          </label>
          <label className="space-y-1">
            <span className={label}>Sahyadri → Nila, with AM/PM</span>
            <input
              value={draft.sahyadriToNila}
              onChange={(e) => set('sahyadriToNila', e.target.value)}
              placeholder="9:05 AM, 12:50 PM"
              className={field}
            />
          </label>
        </div>

        {message && (
          <p
            className={`text-sm rounded-lg px-3 py-2 border whitespace-pre-line ${
              message.kind === 'ok'
                ? 'text-green-700 dark:text-green-400 bg-green-500/10 border-green-500/20'
                : 'text-red-500 bg-red-500/10 border-red-500/20'
            }`}
          >
            {message.text}
          </p>
        )}

        <div className="flex items-center gap-2">
          <Button onClick={save} disabled={busy || !canSave} className="rounded-xl">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {editingId === null ? 'Add service' : 'Save changes'}
          </Button>
          {editingId !== null && (
            <Button variant="ghost" onClick={reset} disabled={busy} className="rounded-xl">
              <X className="h-4 w-4" /> Cancel
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
