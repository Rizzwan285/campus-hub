-- Contacts directory on the Campus page: auto drivers, medical, restaurants,
-- and any category the developer adds from /admin → Contacts.
--
-- Seed-managed like the mess and canteen tables. `bundle_key` is the stable
-- id of a row that ships in src/data/contactsData.ts (null for one added in
-- /admin); the seed matches on it and never changes a row whose `source` is
-- 'admin'. Deleting a bundled row from /admin sets `removed_at` instead of
-- deleting it, so a reseed cannot bring it back. Only `npm run seed:reset`
-- restores the bundled list.

create table if not exists contact_categories (
  id            bigserial primary key,
  bundle_key    text unique,
  name          text not null check (length(btrim(name)) between 1 and 60),
  sort_order    integer not null default 0,
  source        text not null default 'seed' check (source in ('seed', 'admin')),
  customized_at timestamptz,
  removed_at    timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table if not exists contacts (
  id            bigserial primary key,
  category_id   bigint not null references contact_categories (id) on delete cascade,
  bundle_key    text unique,
  name          text not null check (length(btrim(name)) between 1 and 80),
  -- As typed, e.g. '9947872907' or '+914912092271'. The API checks that each
  -- one dials (src/lib/contactPhone.ts); the app builds the tel: link.
  phones        text[] not null check (cardinality(phones) between 1 and 5),
  location      text,
  link          text check (link is null or link like 'https://%'),
  note          text,
  sort_order    integer not null default 0,
  source        text not null default 'seed' check (source in ('seed', 'admin')),
  customized_at timestamptz,
  removed_at    timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists contacts_category_order_idx on contacts (category_id, sort_order);

alter table contact_categories enable row level security;
alter table contacts enable row level security;

drop policy if exists contact_categories_public_read on contact_categories;
create policy contact_categories_public_read on contact_categories
  for select using (removed_at is null);

drop policy if exists contacts_public_read on contacts;
create policy contacts_public_read on contacts
  for select using (removed_at is null);

-- The list supplied on 16 November 2026, identical to src/data/contactsData.ts
-- (a test compares the two). Loaded here so a database gets it from
-- `npm run migrate` alone; existing rows are left as they are.
insert into contact_categories (bundle_key, name, sort_order) values
  ('auto-drivers', 'Auto drivers', 0),
  ('medical', 'Medical', 1),
  ('restaurants', 'Restaurants', 2)
on conflict (bundle_key) do nothing;

insert into contacts (category_id, bundle_key, name, phones, location, link, sort_order)
select category.id, entry.bundle_key, entry.name, entry.phones, entry.location, entry.link, entry.sort_order
  from (values
    ('auto-drivers', 'auto-drivers/anil', 'Anil', array['9947872907'], null, null, 0),
    ('auto-drivers', 'auto-drivers/prasad', 'Prasad', array['9847381230'], null, null, 1),
    ('auto-drivers', 'auto-drivers/girish', 'Girish', array['9400588507'], null, null, 2),
    ('auto-drivers', 'auto-drivers/saravanan', 'Saravanan', array['9745680940'], null, null, 3),
    ('auto-drivers', 'auto-drivers/parameswaran', 'Parameswaran', array['9446469077'], null, null, 4),
    ('auto-drivers', 'auto-drivers/ramesh', 'Ramesh', array['9846918043'], null, null, 5),
    ('auto-drivers', 'auto-drivers/sasikumar', 'Sasikumar', array['9048458122'], null, null, 6),
    ('auto-drivers', 'auto-drivers/guruvayurappan', 'Guruvayurappan', array['9895314214'], null, null, 7),
    ('medical', 'medical/dr-manu-mohan', 'Dr. Manu Mohan', array['9400500832'], null, null, 0),
    ('medical', 'medical/institute-clinic', 'Institute Clinic', array['+914912092271', '+914912092270'],
      'Room 101, Bageshri Block, Nila Campus', null, 1),
    ('restaurants', 'restaurants/the-teee', 'The TEEE', array['9746909608'], null,
      'https://share.google/r8pAvNmRzwobyanZ1', 0),
    ('restaurants', 'restaurants/tea-time-palakkad', 'Tea Time Palakkad', array['9074352609'], null,
      'https://share.google/iNeniSQSvS3SO5nPD', 1),
    ('restaurants', 'restaurants/ginger-restaurant', 'Ginger Restaurant', array['9446486867'], null,
      'https://share.google/qp9ZtTeBrQLo02cbh', 2)
  ) as entry (category_key, bundle_key, name, phones, location, link, sort_order)
  join contact_categories category on category.bundle_key = entry.category_key
on conflict (bundle_key) do nothing;
