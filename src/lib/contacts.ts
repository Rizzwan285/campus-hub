import { z } from 'zod';
import { bundledContacts, type ContactCategory } from '@/data/contactsData';

/**
 * Where the Contacts card gets its list.
 *
 * When the API answers, its list is the whole truth — an empty one means the
 * developer removed every contact, and the bundled copy must not bring them
 * back. When it does not answer (offline, a server error, or a database that
 * migration 014 has not reached), the last list it did send is used, and
 * failing that the bundled one, so a number is always there to call.
 */

const SAVED_KEY = 'campus-contacts';

const contactSchema = z.object({
  id: z.union([z.number(), z.string()]),
  name: z.string().min(1),
  phones: z.array(z.string().min(1)).min(1),
  location: z.string().nullable().optional(),
  link: z.string().nullable().optional(),
  note: z.string().nullable().optional(),
});

const contactListSchema = z.array(
  z.object({
    id: z.union([z.number(), z.string()]),
    name: z.string().min(1),
    contacts: z.array(contactSchema),
  }),
);

/** The API's list, or an error when it is not the shape the card needs. */
export function parseContacts(payload: unknown): ContactCategory[] {
  const parsed = contactListSchema.safeParse(payload);
  if (!parsed.success) throw new Error('Unexpected /api/contacts payload');
  // The app's tsconfig is not strict, so zod infers every field as optional;
  // the schema has just checked that the required ones are there.
  return parsed.data as ContactCategory[];
}

/** Categories with nothing left in them have no place on the card. */
export function withContacts(categories: ContactCategory[]): ContactCategory[] {
  return categories.filter((category) => category.contacts.length > 0);
}

export function saveContacts(categories: ContactCategory[]): void {
  try {
    localStorage.setItem(SAVED_KEY, JSON.stringify(categories));
  } catch {
    // Private mode or a full store: the bundled copy still covers offline use.
  }
}

/** The last list the API sent on this device, if it is still readable. */
export function readSavedContacts(): ContactCategory[] | null {
  try {
    const raw = localStorage.getItem(SAVED_KEY);
    return raw ? parseContacts(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

/** The list to show until, or instead of, an answer from the API. */
export function fallbackContacts(): ContactCategory[] {
  return readSavedContacts() ?? bundledContacts;
}
