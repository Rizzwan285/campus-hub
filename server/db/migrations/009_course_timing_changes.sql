-- Professors move, add and cancel classes informally, so the published
-- timetable drifts from what actually happens. Two ways to correct it:
--
--   * a student fixes their own copy of a course's timings, instantly, for
--     themselves only (user_course_overrides);
--   * a student suggests a fix for everyone taking the course, which only
--     takes effect once the developer approves it in /admin
--     (course_change_requests).
--
-- Neither table has a foreign key to course_offerings, for the same reason as
-- user_courses (004): a reseed deletes and rewrites offerings, and must not
-- cascade away students' corrections or the history of suggestions.

create table if not exists user_course_overrides (
  user_id          uuid not null references profiles(id) on delete cascade,
  -- Bare course code, the identifier the client selects courses by.
  course_code      text not null,
  -- The student's complete list of meetings for the course, in the same shape
  -- the timetable API serves.
  meetings         jsonb not null,
  -- Fingerprint of the official meetings this correction was made against.
  -- Once the official timings change (an approved suggestion, an admin edit),
  -- the client stops applying the correction rather than letting it hide the
  -- new timings.
  base_fingerprint text not null,
  saved_at         timestamptz not null default now(),
  primary key (user_id, course_code)
);

create table if not exists course_change_requests (
  id                bigserial primary key,
  course_code       text not null,
  course_name       text,
  requested_by      uuid references profiles(id) on delete set null,
  requester_roll    text not null,
  -- The student's explanation, e.g. who announced the change and when.
  note              text,
  -- Official meetings when the suggestion was made, so a review can tell
  -- whether the timings have moved since.
  base_meetings     jsonb not null,
  proposed_meetings jsonb not null,
  status            text not null default 'pending'
                      check (status in ('pending', 'approved', 'rejected', 'withdrawn', 'superseded')),
  -- What approval actually wrote; differs from proposed_meetings when the
  -- developer corrected the suggestion before approving it.
  applied_meetings  jsonb,
  created_at        timestamptz not null default now(),
  decided_at        timestamptz,
  decided_by_roll   text,
  decision_note     text
);

create index if not exists course_change_requests_status_idx
  on course_change_requests (status, created_at desc);
create index if not exists course_change_requests_requester_idx
  on course_change_requests (requested_by, created_at desc);

-- One open suggestion per student per course: resubmitting replaces it rather
-- than stacking up duplicates for the reviewer.
create unique index if not exists course_change_requests_one_open_idx
  on course_change_requests (requested_by, course_code)
  where status = 'pending';

-- Readable only through the API, like profiles and audit_log.
alter table user_course_overrides  enable row level security;
alter table course_change_requests enable row level security;
