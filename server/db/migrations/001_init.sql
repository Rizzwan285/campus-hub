-- Campus Hub initial schema.
--
-- Everything the app used to import from src/data/*.ts and src/data/timetable/*.json
-- lives here. Content tables are world-readable through RLS; profile tables are not.

create extension if not exists "pgcrypto";

create or replace function set_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;


-- ---------------------------------------------------------------- mess

create table if not exists messes (
  id             smallserial primary key,
  slug           text not null unique,
  name           text not null,
  caterer        text,
  -- Kedaram rotates a two-week menu; Nila serves the same week every week.
  has_week_cycle boolean not null default false,
  sort_order     smallint not null default 0
);

create table if not exists mess_common_items (
  mess_id smallint not null references messes(id) on delete cascade,
  meal    text     not null check (meal in ('Breakfast', 'Lunch', 'Snacks', 'Dinner')),
  items   text     not null,
  primary key (mess_id, meal)
);

create table if not exists mess_menu_entries (
  id          bigserial primary key,
  mess_id     smallint not null references messes(id) on delete cascade,
  -- 'all' for messes without a rotating cycle.
  week_cycle  text     not null check (week_cycle in ('week13', 'week24', 'all')),
  day_of_week text     not null check (day_of_week in
                ('Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday')),
  meal        text     not null check (meal in ('Breakfast', 'Lunch', 'Snacks', 'Dinner')),
  items       text[]   not null default '{}',
  veg         text,
  non_veg     text,
  updated_at  timestamptz not null default now(),
  unique (mess_id, week_cycle, day_of_week, meal)
);

create index if not exists mess_menu_entries_lookup_idx
  on mess_menu_entries (mess_id, week_cycle, day_of_week);

drop trigger if exists mess_menu_entries_updated_at on mess_menu_entries;
create trigger mess_menu_entries_updated_at
  before update on mess_menu_entries
  for each row execute function set_updated_at();

create table if not exists mess_timings (
  day_type   text not null check (day_type in ('weekday', 'weekend')),
  meal       text not null check (meal in ('Breakfast', 'Lunch', 'Snacks', 'Dinner')),
  timing     text not null,
  sort_order smallint not null default 0,
  primary key (day_type, meal)
);


-- ---------------------------------------------------------------- bus

create table if not exists bus_day_types (
  slug       text primary key,
  label      text not null,
  sort_order smallint not null default 0
);

create table if not exists bus_departures (
  id              bigserial primary key,
  day_type        text not null references bus_day_types(slug) on delete cascade,
  direction       text not null check (direction in ('nila_to_sahyadri', 'sahyadri_to_nila')),
  -- Stored exactly as displayed ("7:45", "12:00"). The client resolves AM/PM from
  -- position in the list, so order is part of the data.
  depart_time     text not null,
  -- Same instant resolved to minutes past midnight, computed at seed time.
  -- Lets the server answer "next bus" without repeating the AM/PM inference.
  depart_minutes  smallint,
  sort_order      smallint not null,
  -- Times where two buses run instead of one.
  is_multiple_bus boolean not null default false,
  unique (day_type, direction, sort_order)
);

create index if not exists bus_departures_lookup_idx
  on bus_departures (day_type, direction, sort_order);

create table if not exists bus_routes (
  id          bigserial primary key,
  day_type    text not null references bus_day_types(slug) on delete cascade,
  category    text not null check (category in ('palakkad_town', 'wise_park')),
  description text not null,
  sort_order  smallint not null
);

create index if not exists bus_routes_lookup_idx
  on bus_routes (day_type, category, sort_order);


-- ---------------------------------------------------------------- canteen

create table if not exists canteen_sections (
  id         bigserial primary key,
  title      text not null unique,
  timing     text not null,
  start_hour smallint not null check (start_hour between 0 and 24),
  end_hour   smallint not null check (end_hour between 0 and 24),
  sort_order smallint not null
);

create table if not exists canteen_items (
  id         bigserial primary key,
  section_id bigint not null references canteen_sections(id) on delete cascade,
  name       text   not null,
  -- Null price marks a category header row rather than an orderable item.
  price      numeric(8, 2),
  variant    text,
  sort_order smallint not null
);

create index if not exists canteen_items_section_idx
  on canteen_items (section_id, sort_order);


-- ---------------------------------------------------------------- academic calendar

-- Unifies holidays2025, specialDays2025 and timetable/holidays.json.
create table if not exists academic_days (
  date date primary key,
  name text not null,
  -- 'instructional' days fall on a weekend but run the weekday schedule.
  kind text not null check (kind in ('holiday', 'instructional'))
);


-- ---------------------------------------------------------------- timetable

create table if not exists course_offerings (
  id          text primary key,
  program     text not null check (program in ('UG', 'PG')),
  branch      text not null,
  course_code text not null,
  course_name text not null,
  credits     text,
  -- Free text on purpose: the source workbooks use 'core', 'electives',
  -- 'institute core', 'gce/oe' and other one-off spellings.
  category    text,
  raw_slot    text,
  semester    text not null,
  unique (program, branch, course_code, semester)
);

create index if not exists course_offerings_branch_idx
  on course_offerings (program, branch);
create index if not exists course_offerings_code_idx
  on course_offerings (course_code);

create table if not exists course_meetings (
  id          bigserial primary key,
  offering_id text not null references course_offerings(id) on delete cascade,
  type        text not null check (type in ('lecture', 'lab', 'tutorial')),
  day         text not null check (day in
                ('Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday')),
  start_time  time not null,
  end_time    time not null,
  room        text,
  instructors text[] not null default '{}',
  recurrence  text not null default 'weekly'
                check (recurrence in ('weekly', 'biweekly_odd', 'biweekly_even', 'custom')),
  sort_order  smallint not null default 0,
  check (end_time > start_time)
);

create index if not exists course_meetings_offering_idx
  on course_meetings (offering_id, sort_order);

-- Replaces the batch-number venue logic that was hardcoded in the client store.
create table if not exists venue_overrides (
  id           bigserial primary key,
  course_code  text not null,
  -- Null matches any meeting type.
  meeting_type text check (meeting_type in ('lecture', 'lab', 'tutorial')),
  batch_min    smallint not null default 1,
  batch_max    smallint not null default 999,
  room         text not null,
  check (batch_max >= batch_min)
);

create index if not exists venue_overrides_code_idx
  on venue_overrides (course_code);

create table if not exists timetable_metadata (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now()
);


-- ---------------------------------------------------------------- users

-- id matches Supabase auth.users.id once OAuth is wired up. Kept as a plain
-- uuid (no FK) so the schema does not hard-depend on Supabase Auth.
create table if not exists profiles (
  id            uuid primary key default gen_random_uuid(),
  email         text unique,
  name          text,
  mess          text check (mess in ('Nila', 'Kedaram')),
  program       text check (program in ('UG', 'PG')),
  branch        text,
  year_of_study text,
  batch_no      text,
  role          text not null default 'student' check (role in ('student', 'admin')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

drop trigger if exists profiles_updated_at on profiles;
create trigger profiles_updated_at
  before update on profiles
  for each row execute function set_updated_at();

create table if not exists user_courses (
  user_id     uuid not null references profiles(id) on delete cascade,
  offering_id text not null references course_offerings(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (user_id, offering_id)
);


-- ---------------------------------------------------------------- row level security
--
-- The Express API connects as the postgres role and bypasses RLS. These policies
-- only govern direct PostgREST access with the public anon key, which the browser
-- holds. Content is public; profile data is not reachable with the anon key.

alter table messes             enable row level security;
alter table mess_common_items  enable row level security;
alter table mess_menu_entries  enable row level security;
alter table mess_timings       enable row level security;
alter table bus_day_types      enable row level security;
alter table bus_departures     enable row level security;
alter table bus_routes         enable row level security;
alter table canteen_sections   enable row level security;
alter table canteen_items      enable row level security;
alter table academic_days      enable row level security;
alter table course_offerings   enable row level security;
alter table course_meetings    enable row level security;
alter table venue_overrides    enable row level security;
alter table timetable_metadata enable row level security;
alter table profiles           enable row level security;
alter table user_courses       enable row level security;

do $$
declare t text;
begin
  foreach t in array array[
    'messes', 'mess_common_items', 'mess_menu_entries', 'mess_timings',
    'bus_day_types', 'bus_departures', 'bus_routes',
    'canteen_sections', 'canteen_items', 'academic_days',
    'course_offerings', 'course_meetings', 'venue_overrides', 'timetable_metadata'
  ] loop
    execute format('drop policy if exists %I on %I', t || '_public_read', t);
    execute format('create policy %I on %I for select using (true)', t || '_public_read', t);
  end loop;
end $$;

-- profiles / user_courses intentionally get no anon policy. Add owner-scoped
-- policies (auth.uid() = id) when Supabase Auth is wired up.
