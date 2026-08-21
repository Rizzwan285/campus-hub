-- Analytics star schema for Campus Hub.
--
-- Applied by the `create_schema` task of the campus_analytics_etl DAG, which
-- reads this file so the DDL has one home. Safe to run by hand too:
--   psql "$DATABASE_URL" -f generate_analytics_schema.sql

create schema if not exists analytics;

-- ---------------------------------------------------------------- dimensions

create table if not exists analytics.dim_calendar (
  date_key     date primary key,
  day_of_week  text not null,
  -- Matches the app's own bus/mess day buckets.
  day_type     text not null check (day_type in ('weekday', 'friday', 'saturday', 'sunday')),
  is_holiday   boolean not null default false,
  holiday_name text,
  week_number  int,
  month_name   text
);

create table if not exists analytics.dim_mess (
  mess_key     serial primary key,
  slug         text not null unique,
  name         text not null,
  caterer      text,
  has_rotation boolean
);

create table if not exists analytics.dim_courses (
  course_key   text primary key,   -- course_offerings.id
  course_code  text not null,
  course_name  text not null,
  program      text not null,
  branch       text not null,
  category     text,
  credits      text,
  num_meetings int,
  raw_slot     text
);

-- ---------------------------------------------------------------- facts

-- One row per menu cell per snapshot day: what the menu looked like that day.
create table if not exists analytics.fct_menu_snapshot (
  snapshot_date date not null,
  mess_key      int  not null references analytics.dim_mess(mess_key),
  week_cycle    text not null,
  day_of_week   text not null,
  meal          text not null,
  item_count    int  not null,
  items         text[] not null default '{}',
  -- 'seed' or 'admin' — provenance from migration 005.
  source        text,
  primary key (snapshot_date, mess_key, week_cycle, day_of_week, meal)
);

-- Change-data-capture output: menu cells whose contents differ from the
-- previous snapshot. Written by the menu_change_tracker DAG.
create table if not exists analytics.fct_menu_changes (
  id            bigserial primary key,
  detected_on   date not null,
  mess_key      int  not null references analytics.dim_mess(mess_key),
  week_cycle    text not null,
  day_of_week   text not null,
  meal          text not null,
  change_type   text not null check (change_type in ('added', 'removed', 'modified')),
  previous_items text[],
  current_items  text[],
  source        text,
  unique (detected_on, mess_key, week_cycle, day_of_week, meal)
);

create table if not exists analytics.fct_bus_daily (
  snapshot_date   date not null,
  day_type        text not null,
  direction       text not null,
  total_departures int not null,
  first_departure text,
  last_departure  text,
  multi_bus_count int not null default 0,
  primary key (snapshot_date, day_type, direction)
);

-- course_key is intentionally not a foreign key: user_courses stores client
-- identifiers verbatim (migration 004), so a row can reference an offering that
-- no longer exists.
create table if not exists analytics.fct_enrollment (
  snapshot_date  date not null,
  course_key     text not null,
  enrolled_count int  not null,
  primary key (snapshot_date, course_key)
);
