import type {
  AdminContact,
  AdminContactCategory,
  BundledContactCategory,
  ContactCategory,
} from '../src/repositories/contacts.repository';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startHarness, type Harness } from './helpers/harness';
import { pool } from '../src/db';
import { invalidate } from '../src/middleware/cache';
import { syncBundledContacts } from '../src/repositories/contacts.repository';
import { bundledContacts } from '../../src/data/contactsData';

type ApiError = { error: string };

/** Content only: database ids and bundled keys differ by design. */
const content = (categories: BundledContactCategory[]) =>
  categories.map((category) => ({
    name: category.name,
    contacts: category.contacts.map((contact) => ({
      name: contact.name,
      phones: contact.phones,
      location: contact.location ?? null,
      link: contact.link ?? null,
      note: contact.note ?? null,
    })),
  }));

/**
 * Runs the seed's contact step on the test database. The real seed is a
 * separate process the API's response cache knows nothing about, so the
 * cache is dropped here the way its expiry would drop it.
 */
async function seedContacts(bundle: BundledContactCategory[], options: { reset?: boolean } = {}) {
  const client = await pool.connect();
  try {
    return await syncBundledContacts(client, bundle, options);
  } finally {
    client.release();
    invalidate();
  }
}

describe('contacts directory', () => {
  let h: Harness;
  let admin: { token: string };
  let student: { token: string };

  const adminList = async () =>
    (await h.api<AdminContactCategory[]>('GET', '/api/admin/contacts', { token: admin.token })).body;
  const category = async (name: string) => {
    const found = (await adminList()).find((entry) => entry.name === name);
    if (!found) throw new Error(`No category ${name}`);
    return found;
  };
  const publicList = async () => {
    const response = await h.api<ContactCategory[]>('GET', '/api/contacts');
    expect(response.status).toBe(200);
    return response.body;
  };

  beforeAll(async () => {
    h = await startHarness();
    admin = await h.user('142301026', { role: 'admin' });
    student = await h.user('112301001');
  });
  afterAll(async () => h.close());

  it('starts with exactly the bundled list, loaded by migration 014', async () => {
    expect(content(await publicList())).toEqual(content(bundledContacts));
    const clinic = (await category('Medical')).contacts.find((contact) => contact.name === 'Institute Clinic');
    expect(clinic).toMatchObject({
      phones: ['+914912092271', '+914912092270'],
      location: 'Room 101, Bageshri Block, Nila Campus',
      bundled: true,
      customized: false,
    });
  });

  it('is edited by the developer only, and reads no body from anyone else', async () => {
    expect((await h.api('GET', '/api/admin/contacts')).status).toBe(401);
    expect((await h.api('GET', '/api/admin/contacts', { token: student.token })).status).toBe(403);
    const body = { categoryId: 1, name: 'Sneaky', phones: ['9999999999'] };
    expect((await h.api('POST', '/api/admin/contacts', { body })).status).toBe(401);
    expect((await h.api('POST', '/api/admin/contacts', { token: student.token, body })).status).toBe(403);
    expect((await h.api('DELETE', '/api/admin/contacts/1', { token: student.token })).status).toBe(403);
    expect((await h.api('PUT', '/api/admin/contacts/order', { token: student.token, body: { ids: [1] } })).status)
      .toBe(403);
  });

  it('refuses numbers that would not dial and links that are not https, in plain words', async () => {
    const autos = await category('Auto drivers');
    const attempt = (body: Record<string, unknown>) =>
      h.api<ApiError>('POST', '/api/admin/contacts', { token: admin.token, body: { categoryId: autos.id, name: 'Test', phones: ['9846918043'], ...body } });

    const short = await attempt({ phones: ['12345'] });
    expect(short.status).toBe(400);
    expect(short.body.error).toContain('“12345” does not look like a phone number');

    expect((await attempt({ phones: [] })).body.error).toBe('Add at least one phone number.');
    expect((await attempt({ phones: ['+91 98469 18043', '9846918043'] })).body.error).toContain('listed twice');
    expect((await attempt({ phones: ['+9112345'] })).status).toBe(400);
    expect((await attempt({ phones: ['1'.repeat(6)] })).status).toBe(400);
    expect((await attempt({ link: 'http://maps.example.com/x' })).body.error).toContain('https://');
    expect((await attempt({ link: 'javascript:alert(1)' })).status).toBe(400);
    expect((await attempt({ name: '   ' })).body.error).toBe('Enter a name.');
    expect((await attempt({ categoryId: 999_999 })).status).toBe(404);
  });

  it('accepts the formats the institute uses, stored exactly as typed', async () => {
    const medical = await category('Medical');
    const created = await h.api<AdminContact>('POST', '/api/admin/contacts', {
      token: admin.token,
      body: {
        categoryId: medical.id,
        name: 'Ambulance',
        phones: ['108', '0491 209 2271', '+44 20 7946 0958'],
        location: '  ',
        link: 'https://example.org/ambulance',
        note: 'Test entry',
      },
    });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({
      name: 'Ambulance',
      phones: ['108', '0491 209 2271', '+44 20 7946 0958'],
      location: null,
      link: 'https://example.org/ambulance',
      bundled: false,
      customized: true,
    });
    expect((await h.api('DELETE', `/api/admin/contacts/${created.body.id}`, { token: admin.token })).status).toBe(204);
  });

  it('shows an edit on the public list at once, and records who made it', async () => {
    await publicList(); // primes the response cache
    const autos = await category('Auto drivers');
    const anil = autos.contacts.find((contact) => contact.name === 'Anil')!;

    const updated = await h.api<AdminContact>('PUT', `/api/admin/contacts/${anil.id}`, {
      token: admin.token,
      body: { categoryId: autos.id, name: 'Anil', phones: ['9947872907', '9846918043'], note: 'Night trips' },
    });
    expect(updated.status).toBe(200);
    expect(updated.body).toMatchObject({ customized: true, bundled: true, note: 'Night trips' });

    const after = (await publicList()).find((entry) => entry.name === 'Auto drivers')!;
    expect(after.contacts[0]).toMatchObject({ name: 'Anil', phones: ['9947872907', '9846918043'] });

    const [entry] = await h.sql<{ action: string; actor_roll: string; before: { phones: string[] } }>(
      "select action, actor_roll, before from audit_log where action = 'contacts.contact.update' order by id desc limit 1",
    );
    expect(entry).toMatchObject({ action: 'contacts.contact.update', actor_roll: '142301026' });
    expect(entry.before.phones).toEqual(['9947872907']);
  });

  it('reorders contacts and categories only from a complete list', async () => {
    const autos = await category('Auto drivers');
    const ids = autos.contacts.map((contact) => contact.id);
    const reversed = [...ids].reverse();

    const partial = await h.api<ApiError>('PUT', `/api/admin/contacts/categories/${autos.id}/order`, {
      token: admin.token, body: { ids: reversed.slice(1) },
    });
    expect(partial.status).toBe(409);

    expect((await h.api('PUT', `/api/admin/contacts/categories/${autos.id}/order`, {
      token: admin.token, body: { ids: reversed },
    })).status).toBe(200);
    const shown = (await publicList()).find((entry) => entry.name === 'Auto drivers')!;
    expect(shown.contacts.map((contact) => contact.id)).toEqual(reversed);

    const categoryIds = (await adminList()).map((entry) => entry.id);
    expect((await h.api('PUT', '/api/admin/contacts/order', {
      token: admin.token, body: { ids: [...categoryIds].reverse() },
    })).status).toBe(200);
    expect((await publicList()).map((entry) => entry.name)).toEqual(['Restaurants', 'Medical', 'Auto drivers']);
    expect((await h.api('PUT', '/api/admin/contacts/order', {
      token: admin.token, body: { ids: [categoryIds[0], categoryIds[0]] },
    })).status).toBe(400);
  });

  it('adds and renames categories, keeping names distinct', async () => {
    const created = await h.api<AdminContactCategory>('POST', '/api/admin/contacts/categories', {
      token: admin.token, body: { name: 'Pharmacies' },
    });
    expect(created.status).toBe(201);
    expect((await h.api<ApiError>('POST', '/api/admin/contacts/categories', {
      token: admin.token, body: { name: ' medical ' },
    })).status).toBe(409);

    const renamed = await h.api('PUT', `/api/admin/contacts/categories/${created.body.id}`, {
      token: admin.token, body: { name: 'Pharmacy' },
    });
    expect(renamed.status).toBe(200);
    // Empty categories are listed for the editor but not shown to students.
    expect((await adminList()).map((entry) => entry.name)).toContain('Pharmacy');
    expect((await publicList()).map((entry) => entry.name)).not.toContain('Pharmacy');
  });

  it('moves a contact to another category, at the end of it', async () => {
    const pharmacy = await category('Pharmacy');
    const medical = await category('Medical');
    const doctor = medical.contacts.find((contact) => contact.name === 'Dr. Manu Mohan')!;
    const moved = await h.api<AdminContact>('PUT', `/api/admin/contacts/${doctor.id}`, {
      token: admin.token, body: { categoryId: pharmacy.id, name: doctor.name, phones: doctor.phones },
    });
    expect(moved.body.categoryId).toBe(pharmacy.id);
    expect((await category('Pharmacy')).contacts.map((contact) => contact.name)).toEqual(['Dr. Manu Mohan']);

    // Put it back for the tests that follow.
    await h.api('PUT', `/api/admin/contacts/${doctor.id}`, {
      token: admin.token, body: { categoryId: medical.id, name: doctor.name, phones: doctor.phones },
    });
  });

  it('will not delete a category that still has contacts', async () => {
    const medical = await category('Medical');
    const refused = await h.api<ApiError>('DELETE', `/api/admin/contacts/categories/${medical.id}`, { token: admin.token });
    expect(refused.status).toBe(409);
    expect(refused.body.error).toBe('Move or delete the contacts in this category first.');

    const pharmacy = await category('Pharmacy');
    expect((await h.api('DELETE', `/api/admin/contacts/categories/${pharmacy.id}`, { token: admin.token })).status)
      .toBe(204);
    expect((await h.sql('select 1 from contact_categories where id = $1', [pharmacy.id]))).toHaveLength(0);
  });

  it('keeps edits, additions and removals through a reseed', async () => {
    const restaurants = await category('Restaurants');
    const teee = restaurants.contacts.find((contact) => contact.name === 'The TEEE')!;
    expect((await h.api('DELETE', `/api/admin/contacts/${teee.id}`, { token: admin.token })).status).toBe(204);
    const added = await h.api<AdminContact>('POST', '/api/admin/contacts', {
      token: admin.token, body: { categoryId: restaurants.id, name: 'New Place', phones: ['9000000001'] },
    });
    expect(added.status).toBe(201);

    // A later release corrects a bundled number that nobody edited.
    const corrected = bundledContacts.map((entry) => ({
      ...entry,
      contacts: entry.contacts.map((contact) =>
        contact.name === 'Prasad' ? { ...contact, phones: ['9847381231'] } : contact),
    }));
    const result = await seedContacts(corrected);
    expect(result.preserved).toBeGreaterThan(0);

    const autos = (await adminList()).find((entry) => entry.name === 'Auto drivers')!;
    expect(autos.contacts.find((contact) => contact.name === 'Prasad')!.phones).toEqual(['9847381231']);
    // Edited in /admin, so the seed left it alone.
    expect(autos.contacts.find((contact) => contact.name === 'Anil')!.note).toBe('Night trips');
    // The reorder survives as well.
    expect(autos.contacts.map((contact) => contact.name)[0]).toBe('Guruvayurappan');

    const names = (await category('Restaurants')).contacts.map((contact) => contact.name);
    expect(names).toContain('New Place');
    expect(names).not.toContain('The TEEE');
    // The removed bundled row is kept as a marker, not deleted.
    expect(await h.sql("select removed_at is not null as removed from contacts where bundle_key = 'restaurants/the-teee'"))
      .toEqual([{ removed: true }]);

    const edits = await h.api<Array<{ kind: string; label: string }>>('GET', '/api/admin/customizations', { token: admin.token });
    const labels = edits.body.filter((entry) => entry.kind === 'Contact').map((entry) => entry.label);
    expect(labels).toContain('Removed: Restaurants · The TEEE');
    expect(labels).toContain('Auto drivers · Anil');
  });

  it('answers an empty list once every contact is removed, rather than the bundle', async () => {
    for (const entry of await adminList()) {
      for (const contact of entry.contacts) {
        expect((await h.api('DELETE', `/api/admin/contacts/${contact.id}`, { token: admin.token })).status).toBe(204);
      }
    }
    const response = await h.api<ContactCategory[]>('GET', '/api/contacts');
    expect(response.status).toBe(200);
    expect(response.body).toEqual([]);

    // A reseed does not bring the bundled ones back either.
    await seedContacts(bundledContacts);
    expect(await publicList()).toEqual([]);
  });

  it('restores the bundled list only on seed:reset', async () => {
    await seedContacts(bundledContacts, { reset: true });
    expect(content(await publicList())).toEqual(content(bundledContacts));
    expect((await adminList()).every((entry) => !entry.customized && entry.contacts.every((c) => !c.customized)))
      .toBe(true);
  });
});

describe('contacts on a database migration 014 has not reached', () => {
  let h: Harness;
  let admin: { token: string };

  beforeAll(async () => {
    h = await startHarness({ migrations: (file) => file < '014' });
    admin = await h.user('142301026', { role: 'admin' });
  });
  afterAll(async () => h.close());

  it('fails the public list, so the app falls back to its bundled copy', async () => {
    const response = await h.api('GET', '/api/contacts');
    expect(response.status).toBe(500);
  });

  it('still lists the other edits in /admin', async () => {
    const response = await h.api('GET', '/api/admin/customizations', { token: admin.token });
    expect(response.status).toBe(200);
  });
});
