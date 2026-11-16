import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fallbackContacts, parseContacts, readSavedContacts, saveContacts, withContacts } from './contacts';
import { bundledContacts } from '@/data/contactsData';

/** The API's shape: database ids rather than the bundled keys. */
const fromApi = [
  {
    id: 7,
    name: 'Auto drivers',
    contacts: [{ id: 41, name: 'Anil', phones: ['9947872907'], location: null, link: null, note: 'Night trips' }],
  },
];

function memoryStorage(): Storage {
  const store = new Map<string, string>();
  return {
    get length() { return store.size; },
    clear: () => store.clear(),
    getItem: (key) => store.get(key) ?? null,
    key: (index) => [...store.keys()][index] ?? null,
    removeItem: (key) => { store.delete(key); },
    setItem: (key, value) => { store.set(key, String(value)); },
  };
}

describe('the Contacts card list', () => {
  beforeEach(() => vi.stubGlobal('localStorage', memoryStorage()));
  afterEach(() => vi.unstubAllGlobals());

  it('uses the bundled list on a device that has never reached the API', () => {
    expect(fallbackContacts()).toBe(bundledContacts);
    expect(withContacts(fallbackContacts()).map((category) => category.name))
      .toEqual(['Auto drivers', 'Medical', 'Restaurants']);
  });

  it('uses the last list the API sent once there is one', () => {
    saveContacts(parseContacts(fromApi));
    expect(fallbackContacts()).toEqual(fromApi);
  });

  it('keeps an empty answer empty instead of bringing the bundle back', () => {
    saveContacts(parseContacts([]));
    expect(fallbackContacts()).toEqual([]);
    expect(withContacts(parseContacts([{ id: 3, name: 'Medical', contacts: [] }]))).toEqual([]);
  });

  it('falls back to the bundle when the saved copy is unreadable', () => {
    localStorage.setItem('campus-contacts', '{not json');
    expect(readSavedContacts()).toBeNull();
    expect(fallbackContacts()).toBe(bundledContacts);
    localStorage.setItem('campus-contacts', JSON.stringify([{ id: 1, name: 'Broken' }]));
    expect(fallbackContacts()).toBe(bundledContacts);
  });

  it('still works where storage is unavailable', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => { throw new Error('blocked'); },
      setItem: () => { throw new Error('blocked'); },
    });
    expect(() => saveContacts(bundledContacts)).not.toThrow();
    expect(fallbackContacts()).toBe(bundledContacts);
  });

  it('refuses a payload that is not a contact list, so the fallback is used', () => {
    expect(() => parseContacts({ error: 'Internal server error' })).toThrow();
    expect(() => parseContacts([{ id: 1, name: 'Medical', contacts: [{ id: 2, name: 'X', phones: [] }] }])).toThrow();
  });
});
