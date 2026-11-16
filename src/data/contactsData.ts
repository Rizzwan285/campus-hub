/**
 * Phone numbers students ask each other for: auto drivers, the doctor and the
 * institute clinic, and restaurants that deliver.
 *
 * Supplied by the developer on 16 November 2026. Names, spellings and numbers
 * are exactly as given; nothing here claims opening hours, fares or
 * availability, because none were supplied.
 *
 * This is the offline copy and the seed's source. Migration 014 loads the same
 * list into the database, where /admin → Contacts edits it. Each `id` here is
 * a stable key the seed uses to recognise the bundled rows, so renaming a
 * contact in the app does not orphan it — change an id only together with a
 * migration.
 */
export interface Contact {
  id: number | string;
  name: string;
  /** As written, e.g. "9947872907" or "+914912092271"; see src/lib/contactPhone.ts. */
  phones: string[];
  location?: string | null;
  /** An https:// page, such as a restaurant's map listing. */
  link?: string | null;
  note?: string | null;
}

export interface ContactCategory {
  id: number | string;
  name: string;
  contacts: Contact[];
}

export const bundledContacts: ContactCategory[] = [
  {
    id: 'auto-drivers',
    name: 'Auto drivers',
    contacts: [
      { id: 'auto-drivers/anil', name: 'Anil', phones: ['9947872907'] },
      { id: 'auto-drivers/prasad', name: 'Prasad', phones: ['9847381230'] },
      { id: 'auto-drivers/girish', name: 'Girish', phones: ['9400588507'] },
      { id: 'auto-drivers/saravanan', name: 'Saravanan', phones: ['9745680940'] },
      { id: 'auto-drivers/parameswaran', name: 'Parameswaran', phones: ['9446469077'] },
      { id: 'auto-drivers/ramesh', name: 'Ramesh', phones: ['9846918043'] },
      { id: 'auto-drivers/sasikumar', name: 'Sasikumar', phones: ['9048458122'] },
      { id: 'auto-drivers/guruvayurappan', name: 'Guruvayurappan', phones: ['9895314214'] },
    ],
  },
  {
    id: 'medical',
    name: 'Medical',
    contacts: [
      { id: 'medical/dr-manu-mohan', name: 'Dr. Manu Mohan', phones: ['9400500832'] },
      {
        id: 'medical/institute-clinic',
        name: 'Institute Clinic',
        phones: ['+914912092271', '+914912092270'],
        location: 'Room 101, Bageshri Block, Nila Campus',
      },
    ],
  },
  {
    id: 'restaurants',
    name: 'Restaurants',
    contacts: [
      {
        id: 'restaurants/the-teee',
        name: 'The TEEE',
        phones: ['9746909608'],
        link: 'https://share.google/r8pAvNmRzwobyanZ1',
      },
      {
        id: 'restaurants/tea-time-palakkad',
        name: 'Tea Time Palakkad',
        phones: ['9074352609'],
        link: 'https://share.google/iNeniSQSvS3SO5nPD',
      },
      {
        id: 'restaurants/ginger-restaurant',
        name: 'Ginger Restaurant',
        phones: ['9446486867'],
        link: 'https://share.google/qp9ZtTeBrQLo02cbh',
      },
    ],
  },
];
