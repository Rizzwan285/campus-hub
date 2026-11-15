-- Semesters as first-class data.
--
-- Until now the timetable was one unlabelled set of courses, loaded from files
-- by `npm run seed`. A new semester meant new files, a commit and a redeploy,
-- and nothing kept one semester's selections or timing corrections apart from
-- the next. This migration:
--
--   * introduces `semesters` (draft -> published -> active -> archived);
--   * gives each semester a draft catalogue (`semester_courses`) that an import
--     fills and the admin corrects, separate from what students see;
--   * versions every publication (`semester_snapshots`) so it can be rolled back;
--   * ties offerings, selections, personal timings and change requests to a
--     semester, so a course code reused next semester inherits nothing.
--
-- Everything that exists today is adopted as one active semester. No student
-- data is deleted or rewritten: selections and corrections are only labelled.

create table if not exists semesters (
  id                bigserial primary key,
  -- URL-safe and stable: 'aug-dec-2026'. Prefixes new offering ids.
  code              text not null unique,
  name              text not null,
  status            text not null default 'draft'
                      check (status in ('draft', 'published', 'active', 'archived')),
  starts_on         date,
  ends_on           date,
  -- {"A": {"type": "lecture", "timings": [{day, startTime, endTime}]}, ...}
  slot_definitions  jsonb not null default '{}'::jsonb,
  -- The slot table was checked by a person. An import never sets this.
  slots_confirmed   boolean not null default false,
  -- First-year batch rules and venue rules; see SemesterConfig in src/engine.
  config            jsonb not null default '{}'::jsonb,
  published_version integer not null default 0,
  published_at      timestamptz,
  activated_at      timestamptz,
  archived_at       timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- At most one semester is the current one.
create unique index if not exists semesters_one_active_idx
  on semesters (status) where status = 'active';

drop trigger if exists semesters_updated_at on semesters;
create trigger semesters_updated_at
  before update on semesters
  for each row execute function set_updated_at();


-- ---------------------------------------------------------------- uploads

-- The institute's files, kept so an import can be re-run and a wrong course
-- traced back to its source. Stored in the database because the API host's
-- disk does not survive a restart.
create table if not exists semester_files (
  id           bigserial primary key,
  semester_id  bigint not null references semesters(id) on delete cascade,
  name         text not null,
  kind         text not null check (kind in ('workbook', 'slots')),
  -- Admin override for a file whose name does not say (or says wrongly).
  program      text check (program in ('UG', 'PG')),
  branch       text,
  size_bytes   integer not null,
  sha256       text not null,
  content      bytea not null,
  uploaded_at  timestamptz not null default now(),
  uploaded_by  text,
  unique (semester_id, name)
);

create table if not exists semester_imports (
  id             bigserial primary key,
  semester_id    bigint not null references semesters(id) on delete cascade,
  parser_version text,
  -- [{name, kind, sha256, size, program, branch, courses}]
  files          jsonb not null default '[]'::jsonb,
  -- {added, removed, modified, unchanged, keptManual, revalidate, ...}
  summary        jsonb not null default '{}'::jsonb,
  -- The slot document as parsed, and how it differs from the slots in force.
  slot_report    jsonb not null default '{}'::jsonb,
  warnings       jsonb not null default '[]'::jsonb,
  created_at     timestamptz not null default now(),
  created_by     text
);

create index if not exists semester_imports_recent_idx
  on semester_imports (semester_id, created_at desc);


-- ---------------------------------------------------------------- draft catalogue

-- One row per offering (programme + branch + course code) of a semester: the
-- working copy the admin reviews and edits. Students never read this table;
-- publishing copies it into course_offerings / course_meetings.
create table if not exists semester_courses (
  id                 bigserial primary key,
  semester_id        bigint not null references semesters(id) on delete cascade,
  program            text not null check (program in ('UG', 'PG')),
  branch             text not null,
  course_code        text not null,
  course_name        text not null default '',
  credits            text,
  category           text,
  instructors        text[] not null default '{}',
  -- The slot cell(s) as written, for reading alongside the structured result.
  raw_slot           text,
  -- 'import' from a workbook, 'manual' added by hand, 'legacy' adopted from
  -- the timetable that predates this table.
  origin             text not null default 'import' check (origin in ('import', 'manual', 'legacy')),
  -- [{file, sheet, row, cells: {header: value}}]
  source_rows        jsonb not null default '[]'::jsonb,
  -- Hash of everything in the source that affects the result. A manual
  -- correction is kept across re-imports for as long as this is unchanged.
  source_hash        text,
  -- What the parser produced, untouched, so a correction can be undone.
  parsed             jsonb,
  -- {assignments: [...], custom: [...]} - see CourseSchedule in src/engine.
  schedule           jsonb not null default '{"assignments":[],"custom":[]}'::jsonb,
  -- The concrete meetings the schedule expands to; what publishing writes.
  meetings           jsonb not null default '[]'::jsonb,
  -- [{code, severity: blocking|review|info, message, resolved}]
  issues             jsonb not null default '[]'::jsonb,
  review_status      text not null default 'ok'
                       check (review_status in ('ok', 'needs_review', 'invalid')),
  manual             boolean not null default false,
  manual_source_hash text,
  manual_at          timestamptz,
  manual_by          text,
  -- In an earlier import but not in the latest one. Kept, never published.
  removed            boolean not null default false,
  -- Differs from what is published.
  dirty              boolean not null default true,
  -- What the latest import did to this course: added | modified | unchanged |
  -- removed | kept_manual | revalidate. Null for a course no import touched.
  import_change      text,
  -- The meetings before the latest import changed them, for a before/after.
  previous_meetings  jsonb,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (semester_id, program, branch, course_code)
);

create index if not exists semester_courses_review_idx
  on semester_courses (semester_id, review_status);

drop trigger if exists semester_courses_updated_at on semester_courses;
create trigger semester_courses_updated_at
  before update on semester_courses
  for each row execute function set_updated_at();


-- ---------------------------------------------------------------- publications

-- Every publication of a semester, whole. Publishing replaces the semester's
-- live offerings in one transaction and records what it wrote here; rolling
-- back re-applies an earlier version.
create table if not exists semester_snapshots (
  id           bigserial primary key,
  semester_id  bigint not null references semesters(id) on delete cascade,
  version      integer not null,
  kind         text not null default 'publish' check (kind in ('publish', 'rollback', 'baseline')),
  -- {slots, config, courses: [{program, branch, courseCode, ..., schedule, meetings}]}
  payload      jsonb not null,
  course_count integer not null default 0,
  note         text,
  created_at   timestamptz not null default now(),
  created_by   text,
  unique (semester_id, version)
);


-- ---------------------------------------------------------------- live timetable

alter table course_offerings add column if not exists semester_id bigint references semesters(id);
alter table course_offerings add column if not exists instructors text[] not null default '{}';
create index if not exists course_offerings_semester_idx on course_offerings (semester_id);

alter table course_meetings add column if not exists slot_code text;
alter table course_meetings add column if not exists batches   text;
-- Set with recurrence = 'once': a single class on this date.
alter table course_meetings add column if not exists on_date   date;

alter table course_meetings drop constraint if exists course_meetings_recurrence_check;
alter table course_meetings add constraint course_meetings_recurrence_check
  check (recurrence in ('weekly', 'biweekly_odd', 'biweekly_even', 'custom', 'once'));
alter table course_meetings drop constraint if exists course_meetings_once_has_date;
alter table course_meetings add constraint course_meetings_once_has_date
  check (recurrence <> 'once' or on_date is not null);


-- ---------------------------------------------------------------- student data

alter table user_courses add column if not exists semester_id bigint references semesters(id) on delete cascade;
alter table user_course_overrides add column if not exists semester_id bigint references semesters(id) on delete cascade;
alter table course_change_requests add column if not exists semester_id bigint references semesters(id);

-- A selection or a correction now belongs to (student, semester), so the old
-- primary keys no longer describe a row. coalesce() keeps rows unique while
-- a database has no semester yet (a fresh install before its first seed).
alter table user_courses drop constraint if exists user_courses_pkey;
create unique index if not exists user_courses_semester_key
  on user_courses (user_id, coalesce(semester_id, 0), offering_id);

alter table user_course_overrides drop constraint if exists user_course_overrides_pkey;
create unique index if not exists user_course_overrides_semester_key
  on user_course_overrides (user_id, coalesce(semester_id, 0), course_code);

create index if not exists user_courses_offering_idx on user_courses (semester_id, offering_id);


-- ---------------------------------------------------------------- adopt what exists

-- Fills a semester's draft catalogue from its live offerings, for courses the
-- draft does not have yet. Used here for the semester already running, and by
-- `npm run seed` on a fresh database.
create or replace function backfill_semester_catalogue(sem bigint) returns integer as $$
declare inserted integer;
begin
  insert into semester_courses
    (semester_id, program, branch, course_code, course_name, credits, category, instructors,
     raw_slot, origin, schedule, meetings, manual, manual_at, dirty)
  select o.semester_id, o.program, o.branch, o.course_code, o.course_name, o.credits, o.category,
         coalesce(o.instructors, '{}'), o.raw_slot, 'legacy',
         -- No structure is known for these, only meetings; the editor infers
         -- slots from them when the course is opened.
         jsonb_build_object('assignments', '[]'::jsonb, 'custom', coalesce(m.meetings, '[]'::jsonb)),
         coalesce(m.meetings, '[]'::jsonb),
         o.source = 'admin', o.customized_at, false
    from course_offerings o
    left join lateral (
      select jsonb_agg(
               jsonb_strip_nulls(jsonb_build_object(
                 'type', cm.type,
                 'day', cm.day,
                 'startTime', to_char(cm.start_time, 'HH24:MI'),
                 'endTime', to_char(cm.end_time, 'HH24:MI'),
                 'room', coalesce(cm.room, ''),
                 'instructors', to_jsonb(cm.instructors),
                 'recurrence', jsonb_build_object('type', cm.recurrence),
                 'slot', cm.slot_code,
                 'batches', cm.batches,
                 'date', to_char(cm.on_date, 'YYYY-MM-DD')
               )) order by cm.sort_order) as meetings
        from course_meetings cm
       where cm.offering_id = o.id
    ) m on true
   where o.semester_id = sem
  on conflict (semester_id, program, branch, course_code) do nothing;
  get diagnostics inserted = row_count;
  return inserted;
end;
$$ language plpgsql;

do $$
declare
  current_name text;
  sem bigint;
begin
  -- The semester the existing offerings belong to; they all carry one name.
  select semester into current_name
    from course_offerings
   group by semester
   order by count(*) desc
   limit 1;

  if current_name is null then
    return;  -- Empty database: the seed creates the first semester.
  end if;

  insert into semesters
    (code, name, status, slot_definitions, slots_confirmed, config, published_version, published_at, activated_at)
  values (
    trim(both '-' from lower(regexp_replace(current_name, '[^A-Za-z0-9]+', '-', 'g'))),
    current_name,
    case when exists (select 1 from semesters where status = 'active') then 'published' else 'active' end,
    coalesce((select value from timetable_metadata where key = 'slots'), '{}'::jsonb),
    true,
    jsonb_build_object(
      'firstYear', jsonb_build_object(
        'excludedCodes', jsonb_build_array('BT2010'),
        'cohorts', jsonb_build_array(
          jsonb_build_object('batchMin', 1,  'batchMax', 12, 'excludedCodes', jsonb_build_array('CY1140', 'EE1110')),
          jsonb_build_object('batchMin', 13, 'batchMax', 24, 'excludedCodes', jsonb_build_array('PH1130', 'ME1150'))),
        'extraByBranch', jsonb_build_object('DS', jsonb_build_array('DS1010'))),
      'venueRules', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'courseCode', course_code, 'meetingType', meeting_type,
                 'batchMin', batch_min, 'batchMax', batch_max, 'room', room)
               order by course_code, meeting_type nulls last, batch_min)
          from venue_overrides), '[]'::jsonb)),
    1, now(), now())
  on conflict (code) do nothing;

  select id into sem from semesters where name = current_name;

  update course_offerings       set semester_id = sem where semester_id is null and semester = current_name;
  update user_courses           set semester_id = sem where semester_id is null;
  update user_course_overrides  set semester_id = sem where semester_id is null;
  update course_change_requests set semester_id = sem where semester_id is null;

  perform backfill_semester_catalogue(sem);
end $$;


-- ---------------------------------------------------------------- access

alter table semesters          enable row level security;
alter table semester_files     enable row level security;
alter table semester_imports   enable row level security;
alter table semester_courses   enable row level security;
alter table semester_snapshots enable row level security;
-- No policies: drafts, uploads and snapshots are reachable only through the
-- API. Published timetables are still read from course_offerings.
