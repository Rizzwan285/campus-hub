import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowDown, ArrowUp, Contact as ContactIcon, Loader2, MapPin, PencilLine, Phone, Plus, Save, Trash2, X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { apiFetch, ApiError } from '@/services/api';
import { isHttpsLink, telHref } from '@/lib/contactPhone';

interface AdminContact {
  id: number;
  categoryId: number;
  name: string;
  phones: string[];
  location: string | null;
  link: string | null;
  note: string | null;
}

interface AdminCategory {
  id: number;
  name: string;
  contacts: AdminContact[];
}

interface Draft {
  /** Null while adding. */
  id: number | null;
  categoryId: number;
  name: string;
  phones: string[];
  location: string;
  link: string;
  note: string;
}

type Message = { kind: 'ok' | 'error'; text: string } | null;

/** What a delete would remove, shown in the confirmation. */
type PendingDelete =
  | { kind: 'contact'; id: number; name: string }
  | { kind: 'category'; id: number; name: string };

const field = 'w-full px-3.5 py-2.5 rounded-xl bg-background border border-border text-sm';
const label = 'text-xs font-medium text-muted-foreground';

const errorText = (error: unknown, fallback: string) =>
  error instanceof ApiError ? error.message : fallback;

function Feedback({ message }: { message: Message }) {
  if (!message) return null;
  return (
    <p
      role={message.kind === 'error' ? 'alert' : 'status'}
      className={`text-sm rounded-lg px-3 py-2 border ${
        message.kind === 'ok'
          ? 'text-green-700 dark:text-green-400 bg-green-500/10 border-green-500/20'
          : 'text-red-600 dark:text-red-400 bg-red-500/10 border-red-500/20'
      }`}
    >
      {message.text}
    </p>
  );
}

/** Moves the item at `index` one place towards `step` (-1 up, +1 down). */
function moved<T>(list: T[], index: number, step: -1 | 1): T[] {
  const next = [...list];
  const target = index + step;
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

function ContactForm({
  draft,
  categories,
  busy,
  onChange,
  onSave,
  onCancel,
}: {
  draft: Draft;
  categories: AdminCategory[];
  busy: boolean;
  onChange: (draft: Draft) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  const set = (patch: Partial<Draft>) => onChange({ ...draft, ...patch });
  const setPhone = (index: number, value: string) =>
    set({ phones: draft.phones.map((phone, i) => (i === index ? value : phone)) });

  const linkProblem = draft.link.trim() !== '' && !isHttpsLink(draft.link);
  const hasPhone = draft.phones.some((phone) => phone.trim() !== '');

  return (
    <form
      className="space-y-3 rounded-xl border border-primary/30 bg-primary/5 p-4"
      onSubmit={(event) => {
        event.preventDefault();
        onSave();
      }}
    >
      <h3 className="text-sm font-semibold">{draft.id === null ? 'Add a contact' : `Edit ${draft.name || 'contact'}`}</h3>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="space-y-1">
          <span className={label}>Name</span>
          <input value={draft.name} onChange={(e) => set({ name: e.target.value })} className={field} maxLength={80} />
        </label>
        <label className="space-y-1">
          <span className={label}>Category</span>
          <select
            value={draft.categoryId}
            onChange={(e) => set({ categoryId: Number(e.target.value) })}
            className={field}
          >
            {categories.map((category) => (
              <option key={category.id} value={category.id}>{category.name}</option>
            ))}
          </select>
        </label>
      </div>

      <fieldset className="space-y-2">
        <legend className={label}>Phone numbers</legend>
        {draft.phones.map((phone, index) => {
          const problem = phone.trim() !== '' && !telHref(phone);
          return (
            <div key={index} className="space-y-1">
              <div className="flex gap-2">
                <input
                  value={phone}
                  onChange={(e) => setPhone(index, e.target.value)}
                  inputMode="tel"
                  placeholder="9947872907 or +914912092271"
                  aria-label={`Phone number ${index + 1}`}
                  aria-invalid={problem}
                  className={`${field} tabular-nums ${problem ? 'border-red-500/60' : ''}`}
                  maxLength={20}
                />
                {draft.phones.length > 1 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => set({ phones: draft.phones.filter((_, i) => i !== index) })}
                    aria-label={`Remove phone number ${index + 1}`}
                    className="shrink-0 rounded-xl"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>
              {problem && (
                <p className="text-xs text-red-600 dark:text-red-400">
                  This does not look like a phone number. Use 10 digits, or start with the country code (+91…).
                </p>
              )}
            </div>
          );
        })}
        {draft.phones.length < 5 && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => set({ phones: [...draft.phones, ''] })}
            className="rounded-lg"
          >
            <Plus className="h-3.5 w-3.5" /> Another number
          </Button>
        )}
      </fieldset>

      <label className="space-y-1 block">
        <span className={label}>Location (optional)</span>
        <input
          value={draft.location}
          onChange={(e) => set({ location: e.target.value })}
          placeholder="Room 101, Bageshri Block, Nila Campus"
          className={field}
          maxLength={160}
        />
      </label>
      <label className="space-y-1 block">
        <span className={label}>Map or website link (optional)</span>
        <input
          value={draft.link}
          onChange={(e) => set({ link: e.target.value })}
          inputMode="url"
          placeholder="https://…"
          aria-invalid={linkProblem}
          className={`${field} ${linkProblem ? 'border-red-500/60' : ''}`}
          maxLength={500}
        />
        {linkProblem && (
          <span className="block text-xs text-red-600 dark:text-red-400">
            Paste the full address, starting with https://
          </span>
        )}
      </label>
      <label className="space-y-1 block">
        <span className={label}>Note (optional)</span>
        <input value={draft.note} onChange={(e) => set({ note: e.target.value })} className={field} maxLength={200} />
      </label>

      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={busy || !draft.name.trim() || !hasPhone} className="rounded-xl">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {draft.id === null ? 'Add contact' : 'Save changes'}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel} disabled={busy} className="rounded-xl">
          Cancel
        </Button>
      </div>
    </form>
  );
}

/**
 * The Contacts directory on the Campus page: add, edit, reorder and delete
 * contacts, and add or rename the categories they are grouped under.
 *
 * Every change is checked and saved by the API, and students see it on their
 * next load. Deleting asks first.
 */
export function ContactsAdmin() {
  const queryClient = useQueryClient();
  const { data, isLoading, isError } = useQuery({
    queryKey: ['admin-contacts'],
    queryFn: () => apiFetch<AdminCategory[]>('/api/admin/contacts'),
    staleTime: 30_000,
  });

  const [draft, setDraft] = useState<Draft | null>(null);
  const [newCategory, setNewCategory] = useState('');
  const [renaming, setRenaming] = useState<{ id: number; name: string } | null>(null);
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<Message>(null);

  const categories = data ?? [];

  const run = async (work: () => Promise<unknown>, done: string, failed: string): Promise<boolean> => {
    setBusy(true);
    setMessage(null);
    try {
      await work();
      setMessage({ kind: 'ok', text: done });
      await queryClient.invalidateQueries({ queryKey: ['admin-contacts'] });
      void queryClient.invalidateQueries({ queryKey: ['contacts'] });
      return true;
    } catch (error) {
      setMessage({ kind: 'error', text: errorText(error, failed) });
      // A 404/409 usually means the list moved on; show the current one.
      void queryClient.invalidateQueries({ queryKey: ['admin-contacts'] });
      return false;
    } finally {
      setBusy(false);
    }
  };

  const startAdding = (categoryId: number) =>
    setDraft({ id: null, categoryId, name: '', phones: [''], location: '', link: '', note: '' });

  const startEditing = (contact: AdminContact) =>
    setDraft({
      id: contact.id,
      categoryId: contact.categoryId,
      name: contact.name,
      phones: contact.phones.length ? contact.phones : [''],
      location: contact.location ?? '',
      link: contact.link ?? '',
      note: contact.note ?? '',
    });

  const saveDraft = async () => {
    if (!draft) return;
    const body = {
      categoryId: draft.categoryId,
      name: draft.name.trim(),
      phones: draft.phones.map((phone) => phone.trim()).filter(Boolean),
      location: draft.location.trim() || null,
      link: draft.link.trim() || null,
      note: draft.note.trim() || null,
    };
    const ok = await run(
      () =>
        draft.id === null
          ? apiFetch('/api/admin/contacts', { method: 'POST', body })
          : apiFetch(`/api/admin/contacts/${draft.id}`, { method: 'PUT', body }),
      draft.id === null ? `${body.name} added.` : `${body.name} saved.`,
      'Could not save the contact.',
    );
    if (ok) setDraft(null);
  };

  const addCategory = async () => {
    const name = newCategory.trim();
    if (!name) return;
    const ok = await run(
      () => apiFetch('/api/admin/contacts/categories', { method: 'POST', body: { name } }),
      `Category “${name}” added. Add a contact to it to show it in the app.`,
      'Could not add the category.',
    );
    if (ok) setNewCategory('');
  };

  const renameCategory = async () => {
    if (!renaming) return;
    const name = renaming.name.trim();
    const ok = await run(
      () => apiFetch(`/api/admin/contacts/categories/${renaming.id}`, { method: 'PUT', body: { name } }),
      `Renamed to “${name}”.`,
      'Could not rename the category.',
    );
    if (ok) setRenaming(null);
  };

  const moveCategory = (index: number, step: -1 | 1) =>
    run(
      () => apiFetch('/api/admin/contacts/order', {
        method: 'PUT',
        body: { ids: moved(categories, index, step).map((category) => category.id) },
      }),
      'Order saved.',
      'Could not change the order.',
    );

  const moveContact = (category: AdminCategory, index: number, step: -1 | 1) =>
    run(
      () => apiFetch(`/api/admin/contacts/categories/${category.id}/order`, {
        method: 'PUT',
        body: { ids: moved(category.contacts, index, step).map((contact) => contact.id) },
      }),
      'Order saved.',
      'Could not change the order.',
    );

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    const target = pendingDelete;
    setPendingDelete(null);
    if (target.kind === 'contact' && draft?.id === target.id) setDraft(null);
    await run(
      () => apiFetch(
        target.kind === 'contact' ? `/api/admin/contacts/${target.id}` : `/api/admin/contacts/categories/${target.id}`,
        { method: 'DELETE' },
      ),
      `${target.name} deleted.`,
      'Could not delete it.',
    );
  };

  const iconButton = 'h-8 w-8 rounded-lg shrink-0';

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-sm font-semibold flex items-center gap-2">
          <ContactIcon className="h-4 w-4 text-primary" /> Contacts
        </h2>
        <p className="text-[11px] text-muted-foreground mt-1">
          Shown on the Campus page, grouped by category. Students tap a number to call it. A category with no
          contacts is hidden from students.
        </p>
      </div>

      <Feedback message={message} />

      {isLoading ? (
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      ) : isError ? (
        <p className="text-sm text-muted-foreground">
          Contacts could not be loaded. If this keeps happening, the database may still need its latest update
          (migration 014).
        </p>
      ) : (
        <>
          {draft && (
            <ContactForm
              draft={draft}
              categories={categories}
              busy={busy}
              onChange={setDraft}
              onSave={saveDraft}
              onCancel={() => setDraft(null)}
            />
          )}

          {categories.map((category, categoryIndex) => (
            <section key={category.id} className="rounded-xl border border-border/60 p-3 sm:p-4 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                {renaming?.id === category.id ? (
                  <form
                    className="flex flex-1 gap-2 min-w-0"
                    onSubmit={(event) => {
                      event.preventDefault();
                      void renameCategory();
                    }}
                  >
                    <input
                      value={renaming.name}
                      onChange={(e) => setRenaming({ id: category.id, name: e.target.value })}
                      aria-label="New category name"
                      className={`${field} py-1.5`}
                      maxLength={60}
                      autoFocus
                    />
                    <Button type="submit" size="sm" disabled={busy || !renaming.name.trim()} className="rounded-lg">
                      Save
                    </Button>
                    <Button type="button" size="sm" variant="ghost" onClick={() => setRenaming(null)} className="rounded-lg">
                      Cancel
                    </Button>
                  </form>
                ) : (
                  <>
                    <h3 className="font-semibold text-sm flex-1 min-w-0 break-words">
                      {category.name}
                      <span className="ml-2 text-xs font-normal text-muted-foreground">
                        {category.contacts.length === 0
                          ? 'empty, hidden from students'
                          : `${category.contacts.length} contact${category.contacts.length === 1 ? '' : 's'}`}
                      </span>
                    </h3>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost" size="icon" className={iconButton}
                        disabled={busy || categoryIndex === 0}
                        onClick={() => moveCategory(categoryIndex, -1)}
                        aria-label={`Move ${category.name} up`}
                      >
                        <ArrowUp className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost" size="icon" className={iconButton}
                        disabled={busy || categoryIndex === categories.length - 1}
                        onClick={() => moveCategory(categoryIndex, 1)}
                        aria-label={`Move ${category.name} down`}
                      >
                        <ArrowDown className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost" size="icon" className={iconButton}
                        disabled={busy}
                        onClick={() => setRenaming({ id: category.id, name: category.name })}
                        aria-label={`Rename ${category.name}`}
                      >
                        <PencilLine className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost" size="icon"
                        className={`${iconButton} text-muted-foreground hover:text-red-500`}
                        disabled={busy}
                        onClick={() =>
                          category.contacts.length > 0
                            ? setMessage({
                                kind: 'error',
                                text: `Move or delete the contacts in ${category.name} before deleting it.`,
                              })
                            : setPendingDelete({ kind: 'category', id: category.id, name: category.name })}
                        aria-label={`Delete ${category.name}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </>
                )}
              </div>

              {category.contacts.length > 0 && (
                <ul className="divide-y divide-border/50">
                  {category.contacts.map((contact, contactIndex) => (
                    <li key={contact.id} className="flex flex-wrap items-start gap-2 py-2.5">
                      <div className="min-w-0 flex-1 basis-48">
                        <p className="text-sm font-medium break-words">{contact.name}</p>
                        <p className="text-xs text-muted-foreground flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5">
                          {contact.phones.map((phone) => (
                            <span key={phone} className="inline-flex items-center gap-1 tabular-nums">
                              <Phone className="h-3 w-3" aria-hidden="true" />{phone}
                            </span>
                          ))}
                        </p>
                        {contact.location && (
                          <p className="text-xs text-muted-foreground mt-0.5 flex items-start gap-1">
                            <MapPin className="h-3 w-3 mt-0.5 shrink-0" aria-hidden="true" />{contact.location}
                          </p>
                        )}
                        {contact.link && <p className="text-xs text-muted-foreground mt-0.5 break-all">{contact.link}</p>}
                        {contact.note && <p className="text-xs text-muted-foreground mt-0.5">{contact.note}</p>}
                      </div>
                      <div className="flex gap-1 ml-auto">
                        <Button
                          variant="ghost" size="icon" className={iconButton}
                          disabled={busy || contactIndex === 0}
                          onClick={() => moveContact(category, contactIndex, -1)}
                          aria-label={`Move ${contact.name} up`}
                        >
                          <ArrowUp className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost" size="icon" className={iconButton}
                          disabled={busy || contactIndex === category.contacts.length - 1}
                          onClick={() => moveContact(category, contactIndex, 1)}
                          aria-label={`Move ${contact.name} down`}
                        >
                          <ArrowDown className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost" size="icon" className={iconButton}
                          disabled={busy}
                          onClick={() => startEditing(contact)}
                          aria-label={`Edit ${contact.name}`}
                        >
                          <PencilLine className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost" size="icon"
                          className={`${iconButton} text-muted-foreground hover:text-red-500`}
                          disabled={busy}
                          onClick={() => setPendingDelete({ kind: 'contact', id: contact.id, name: contact.name })}
                          aria-label={`Delete ${contact.name}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}

              <Button
                variant="outline" size="sm" className="rounded-lg"
                disabled={busy}
                onClick={() => startAdding(category.id)}
              >
                <Plus className="h-3.5 w-3.5" /> Add a contact to {category.name}
              </Button>
            </section>
          ))}

          <form
            className="flex flex-col sm:flex-row gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              void addCategory();
            }}
          >
            <input
              value={newCategory}
              onChange={(e) => setNewCategory(e.target.value)}
              placeholder="New category, e.g. Pharmacies"
              aria-label="New category name"
              className={field}
              maxLength={60}
            />
            <Button type="submit" variant="outline" disabled={busy || !newCategory.trim()} className="rounded-xl shrink-0">
              <Plus className="h-4 w-4" /> Add category
            </Button>
          </form>
        </>
      )}

      <AlertDialog open={pendingDelete !== null} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {pendingDelete?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDelete?.kind === 'contact'
                ? 'Students will no longer see this contact or its numbers. You can add it again later.'
                : 'This category is empty. It will be removed from the list.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => void confirmDelete()}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
