import { pool, query } from '../db';

/** Matches `Contact` in src/data/contactsData.ts. */
export interface Contact {
  id: number;
  name: string;
  phones: string[];
  location: string | null;
  link: string | null;
  note: string | null;
}

/** Matches `ContactCategory` in src/data/contactsData.ts. */
export interface ContactCategory {
  id: number;
  name: string;
  contacts: Contact[];
}

/** What the editor needs on top: where a row came from, and whether it was changed. */
export interface AdminContact extends Contact {
  categoryId: number;
  /** Ships in src/data/contactsData.ts. */
  bundled: boolean;
  /** Edited from /admin, so `npm run seed` leaves it alone. */
  customized: boolean;
}

export interface AdminContactCategory {
  id: number;
  name: string;
  bundled: boolean;
  customized: boolean;
  contacts: AdminContact[];
}

export interface ContactInput {
  categoryId: number;
  name: string;
  phones: string[];
  location: string | null;
  link: string | null;
  note: string | null;
}

/** The bundled list, as src/data/contactsData.ts exports it. */
export interface BundledContactCategory {
  id: number | string;
  name: string;
  contacts: Array<{
    id: number | string;
    name: string;
    phones: string[];
    location?: string | null;
    link?: string | null;
    note?: string | null;
  }>;
}

interface Queryable {
  query: (text: string, params?: unknown[]) => Promise<{ rows: unknown[] }>;
}

interface CategoryRow {
  id: number;
  name: string;
  bundle_key: string | null;
  source: 'seed' | 'admin';
}

interface ContactRow {
  id: number;
  category_id: number;
  name: string;
  phones: string[];
  location: string | null;
  link: string | null;
  note: string | null;
  bundle_key: string | null;
  source: 'seed' | 'admin';
}

const CONTACT_COLUMNS = 'id, category_id, name, phones, location, link, note, bundle_key, source';

function toContact(row: ContactRow): Contact {
  return {
    id: Number(row.id),
    name: row.name,
    phones: row.phones,
    location: row.location,
    link: row.link,
    note: row.note,
  };
}

function toAdminContact(row: ContactRow): AdminContact {
  return {
    ...toContact(row),
    categoryId: Number(row.category_id),
    bundled: row.bundle_key !== null,
    customized: row.source === 'admin',
  };
}

async function visibleRows(): Promise<{ categories: CategoryRow[]; contacts: ContactRow[] }> {
  const [categories, contacts] = await Promise.all([
    query<CategoryRow>(
      `select id, name, bundle_key, source
         from contact_categories
        where removed_at is null
        order by sort_order, id`,
    ),
    query<ContactRow>(
      `select ${CONTACT_COLUMNS}
         from contacts
        where removed_at is null
        order by category_id, sort_order, id`,
    ),
  ]);
  return { categories, contacts };
}

/**
 * The public directory: categories in order, each with its contacts, and
 * categories with nothing in them left out.
 *
 * An empty array is a real answer — the developer removed everything — and
 * the client shows it as such. A database that migration 014 has not reached
 * makes this throw, and the route passes that on, so the client falls back to
 * its bundled copy instead of being told there are no contacts.
 */
export async function listContacts(): Promise<ContactCategory[]> {
  const { categories, contacts } = await visibleRows();
  return categories
    .map((category) => ({
      id: Number(category.id),
      name: category.name,
      contacts: contacts.filter((row) => Number(row.category_id) === Number(category.id)).map(toContact),
    }))
    .filter((category) => category.contacts.length > 0);
}

/** Every category, empty ones included, with provenance for the editor. */
export async function listContactsForAdmin(): Promise<AdminContactCategory[]> {
  const { categories, contacts } = await visibleRows();
  return categories.map((category) => ({
    id: Number(category.id),
    name: category.name,
    bundled: category.bundle_key !== null,
    customized: category.source === 'admin',
    contacts: contacts
      .filter((row) => Number(row.category_id) === Number(category.id))
      .map(toAdminContact),
  }));
}

export class ContactConflict extends Error {}

async function assertCategoryNameFree(name: string, exceptId: number | null): Promise<void> {
  const rows = await query<{ id: number }>(
    `select id from contact_categories
      where removed_at is null and lower(btrim(name)) = lower(btrim($1)) and id <> coalesce($2, 0)`,
    [name, exceptId],
  );
  if (rows.length > 0) throw new ContactConflict(`There is already a category called “${name}”.`);
}

export async function createCategory(name: string): Promise<AdminContactCategory> {
  await assertCategoryNameFree(name, null);
  const rows = await query<CategoryRow>(
    `insert into contact_categories (name, sort_order, source, customized_at)
     values ($1, (select coalesce(max(sort_order) + 1, 0) from contact_categories where removed_at is null),
             'admin', now())
     returning id, name, bundle_key, source`,
    [name],
  );
  const row = rows[0];
  return { id: Number(row.id), name: row.name, bundled: false, customized: true, contacts: [] };
}

export async function renameCategory(id: number, name: string): Promise<{ before: string; after: string } | null> {
  const existing = await query<CategoryRow>(
    'select id, name, bundle_key, source from contact_categories where id = $1 and removed_at is null',
    [id],
  );
  if (!existing[0]) return null;
  await assertCategoryNameFree(name, id);
  await query(
    `update contact_categories
        set name = $2, source = 'admin', customized_at = now(), updated_at = now()
      where id = $1`,
    [id, name],
  );
  return { before: existing[0].name, after: name };
}

/**
 * Removes an empty category. One with contacts in it is refused rather than
 * emptied, so a slip cannot delete a whole list of numbers.
 */
export async function deleteCategory(id: number): Promise<'deleted' | 'not_found' | 'not_empty'> {
  const existing = await query<CategoryRow>(
    'select id, name, bundle_key, source from contact_categories where id = $1 and removed_at is null',
    [id],
  );
  if (!existing[0]) return 'not_found';

  const inUse = await query<{ id: number }>(
    'select id from contacts where category_id = $1 and removed_at is null limit 1',
    [id],
  );
  if (inUse.length > 0) return 'not_empty';

  if (existing[0].bundle_key) {
    // Kept as a marker so a reseed does not recreate it.
    await query(
      `update contact_categories
          set removed_at = now(), source = 'admin', customized_at = now(), updated_at = now()
        where id = $1`,
      [id],
    );
  } else {
    await query('delete from contact_categories where id = $1', [id]);
  }
  return 'deleted';
}

/**
 * Rewrites the order of a list in one transaction. `ids` must be exactly the
 * visible rows of that list, so a stale editor cannot drop or duplicate one.
 */
async function rewriteOrder(
  table: 'contact_categories' | 'contacts',
  scope: { sql: string; params: unknown[] },
  ids: number[],
): Promise<boolean> {
  const client = await pool.connect();
  try {
    await client.query('begin');
    const current = await client.query(
      `select id from ${table} where removed_at is null ${scope.sql} for update`,
      scope.params,
    );
    const currentIds = (current.rows as Array<{ id: number }>).map((row) => Number(row.id)).sort((a, b) => a - b);
    const wanted = [...ids].sort((a, b) => a - b);
    if (currentIds.length !== wanted.length || currentIds.some((id, index) => id !== wanted[index])) {
      await client.query('rollback');
      return false;
    }

    for (const [index, id] of ids.entries()) {
      await client.query(`update ${table} set sort_order = $2, updated_at = now() where id = $1`, [id, index]);
    }
    await client.query('commit');
    return true;
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}

export function reorderCategories(ids: number[]): Promise<boolean> {
  return rewriteOrder('contact_categories', { sql: '', params: [] }, ids);
}

export async function reorderContacts(categoryId: number, ids: number[]): Promise<boolean | null> {
  const category = await query<{ id: number }>(
    'select id from contact_categories where id = $1 and removed_at is null',
    [categoryId],
  );
  if (!category[0]) return null;
  return rewriteOrder('contacts', { sql: 'and category_id = $1', params: [categoryId] }, ids);
}

async function categoryExists(id: number): Promise<boolean> {
  const rows = await query<{ id: number }>(
    'select id from contact_categories where id = $1 and removed_at is null',
    [id],
  );
  return rows.length > 0;
}

export async function createContact(input: ContactInput): Promise<AdminContact | null> {
  if (!(await categoryExists(input.categoryId))) return null;
  const rows = await query<ContactRow>(
    `insert into contacts (category_id, name, phones, location, link, note, sort_order, source, customized_at)
     values ($1, $2, $3::text[], $4, $5, $6,
             (select coalesce(max(sort_order) + 1, 0) from contacts where category_id = $1 and removed_at is null),
             'admin', now())
     returning ${CONTACT_COLUMNS}`,
    [input.categoryId, input.name, input.phones, input.location, input.link, input.note],
  );
  return toAdminContact(rows[0]);
}

export async function getContact(id: number): Promise<AdminContact | null> {
  const rows = await query<ContactRow>(
    `select ${CONTACT_COLUMNS} from contacts where id = $1 and removed_at is null`,
    [id],
  );
  return rows[0] ? toAdminContact(rows[0]) : null;
}

/** Null when either the contact or the category it is moving to does not exist. */
export async function updateContact(id: number, input: ContactInput): Promise<AdminContact | null> {
  if (!(await categoryExists(input.categoryId))) return null;
  const rows = await query<ContactRow>(
    `update contacts
        set name = $2, phones = $3::text[], location = $4, link = $5, note = $6,
            -- Moving to another category puts it at the end of that one.
            sort_order = case when category_id = $7 then sort_order else
              (select coalesce(max(sort_order) + 1, 0) from contacts
                where category_id = $7 and removed_at is null) end,
            category_id = $7,
            source = 'admin', customized_at = now(), updated_at = now()
      where id = $1 and removed_at is null
      returning ${CONTACT_COLUMNS}`,
    [id, input.name, input.phones, input.location, input.link, input.note, input.categoryId],
  );
  return rows[0] ? toAdminContact(rows[0]) : null;
}

/**
 * A bundled contact is marked removed rather than deleted, so a reseed does
 * not put it back; one added in /admin is simply deleted.
 */
export async function deleteContact(id: number): Promise<AdminContact | null> {
  const existing = await getContact(id);
  if (!existing) return null;

  if (existing.bundled) {
    await query(
      `update contacts
          set removed_at = now(), source = 'admin', customized_at = now(), updated_at = now()
        where id = $1`,
      [id],
    );
  } else {
    await query('delete from contacts where id = $1', [id]);
  }
  return existing;
}

/** Contacts and categories edited or removed in /admin, for the Edits tab. */
export async function listContactCustomizations(): Promise<Array<{ label: string; customized_at: string | null }>> {
  return query<{ label: string; customized_at: string | null }>(
    `select case when removed_at is null then '' else 'Removed: ' end || name as label, customized_at
       from contact_categories where source = 'admin'
     union all
     select case when c.removed_at is null then '' else 'Removed: ' end || k.name || ' · ' || c.name,
            c.customized_at
       from contacts c join contact_categories k on k.id = c.category_id
      where c.source = 'admin'
      order by 2 desc nulls last`,
  );
}

/**
 * Brings the database in line with the bundled list — the seed's half of the
 * provenance rule.
 *
 * Inserts bundled rows that are missing and refreshes bundled rows still
 * marked 'seed'. Rows edited or removed in /admin, and rows added there, are
 * left exactly as they are. An existing row's position is never changed, so
 * a reorder made in /admin survives too. Bundled rows that have left the
 * bundle are deleted unless they were edited; a category is only deleted
 * once nothing added in /admin hangs off it.
 *
 * `reset` (seed:reset) instead discards every contact and category, edits
 * included, and loads the bundle afresh.
 */
export async function syncBundledContacts(
  client: Queryable,
  bundle: BundledContactCategory[],
  { reset = false }: { reset?: boolean } = {},
): Promise<{ written: number; preserved: number }> {
  if (reset) {
    await client.query('delete from contacts');
    await client.query('delete from contact_categories');
  }

  const preservedResult = await client.query(
    `select (select count(*) from contact_categories where source = 'admin')
          + (select count(*) from contacts where source = 'admin') as n`,
  );
  const preserved = Number((preservedResult.rows[0] as { n: number | string }).n);

  let written = 0;
  for (const [categoryIndex, category] of bundle.entries()) {
    const categoryKey = String(category.id);
    const upserted = await client.query(
      `insert into contact_categories (bundle_key, name, sort_order)
       values ($1, $2, $3)
       on conflict (bundle_key) do update
          set name = excluded.name, updated_at = now()
        where contact_categories.source = 'seed'
       returning id`,
      [categoryKey, category.name, categoryIndex],
    );
    written += upserted.rows.length;
    const categoryRow = await client.query('select id from contact_categories where bundle_key = $1', [categoryKey]);
    const categoryId = Number((categoryRow.rows[0] as { id: number }).id);

    for (const [contactIndex, contact] of category.contacts.entries()) {
      const result = await client.query(
        `insert into contacts (category_id, bundle_key, name, phones, location, link, note, sort_order)
         values ($1, $2, $3, $4::text[], $5, $6, $7, $8)
         on conflict (bundle_key) do update
            set category_id = excluded.category_id, name = excluded.name, phones = excluded.phones,
                location = excluded.location, link = excluded.link, note = excluded.note,
                updated_at = now()
          where contacts.source = 'seed'
         returning id`,
        [
          categoryId,
          String(contact.id),
          contact.name,
          contact.phones,
          contact.location ?? null,
          contact.link ?? null,
          contact.note ?? null,
          contactIndex,
        ],
      );
      written += result.rows.length;
    }
  }

  const contactKeys = bundle.flatMap((category) => category.contacts.map((contact) => String(contact.id)));
  const categoryKeys = bundle.map((category) => String(category.id));
  await client.query(
    `delete from contacts
      where source = 'seed' and bundle_key is not null and not (bundle_key = any($1::text[]))`,
    [contactKeys],
  );
  await client.query(
    `delete from contact_categories k
      where k.source = 'seed' and k.bundle_key is not null and not (k.bundle_key = any($1::text[]))
        and not exists (select 1 from contacts c where c.category_id = k.id)`,
    [categoryKeys],
  );

  return { written, preserved };
}
