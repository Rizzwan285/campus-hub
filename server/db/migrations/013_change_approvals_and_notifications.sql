-- Two ways to approve a timetable change request, and telling students about it.
--
-- Approving used to mean one thing: rewrite the course for everyone. Now the
-- developer chooses:
--
--   optional    the change is plausible but not forced on anyone. It becomes a
--               standing proposal each student accepts or declines for
--               themselves; the official timetable is untouched.
--   compulsory  the change becomes the official timetable, for everyone who
--               has the course and everyone who picks it up later.
--
-- The proposal is the request row itself (status 'approved', approval_mode
-- 'optional'); each student's answer and inbox entry live in
-- user_notifications. Nothing here changes existing requests: those approved
-- before this migration already rewrote the official timings, i.e. compulsory.

alter table course_change_requests
  add column if not exists approval_mode text
    check (approval_mode in ('optional', 'compulsory')),
  -- addition | deletion | modification, from the diff, for lists and the email.
  add column if not exists change_kind text
    check (change_kind in ('addition', 'deletion', 'modification')),
  -- The official meetings at the moment of approval, and the change against
  -- them as {remove: [...], add: [...]}. A student accepting an optional
  -- change applies this delta to their own timetable, touching nothing else.
  add column if not exists approved_base_meetings jsonb,
  add column if not exists delta jsonb,
  -- The developer edited the proposed meetings before approving.
  add column if not exists corrected boolean not null default false,
  -- For optional proposals: 'open' while students can still act on it;
  -- 'official' once the same change was made compulsory; 'outdated' once the
  -- official timings moved so that it no longer applies; 'closed' with the
  -- semester.
  add column if not exists proposal_state text
    check (proposal_state in ('open', 'official', 'outdated', 'closed')),
  add column if not exists proposal_state_note text;

update course_change_requests
   set approval_mode = 'compulsory'
 where status = 'approved' and approval_mode is null;

create index if not exists course_change_requests_proposals_idx
  on course_change_requests (semester_id, course_code)
  where status = 'approved';


-- One inbox entry per student per approved request, and that student's answer.
-- The unique key is what guarantees nobody is ever asked twice about the same
-- proposal, however many times it is fanned out.
create table if not exists user_notifications (
  id            bigserial primary key,
  user_id       uuid   not null references profiles(id) on delete cascade,
  request_id    bigint not null references course_change_requests(id) on delete cascade,
  -- optional_change   a proposal to accept or decline
  -- official_change   the official timetable changed; nothing to decide
  -- request_decision  the outcome of the student's own request
  kind          text not null
                  check (kind in ('optional_change', 'official_change', 'request_decision')),
  -- True when the student had the course at the moment of approval: they get
  -- one interrupting alert. False for a course picked up afterwards: inbox only.
  alert         boolean not null default false,
  alert_seen_at timestamptz,
  read_at       timestamptz,
  response      text check (response in ('accepted', 'rejected')),
  responded_at  timestamptz,
  created_at    timestamptz not null default now(),
  unique (user_id, request_id, kind)
);

create index if not exists user_notifications_inbox_idx
  on user_notifications (user_id, created_at desc);
create index if not exists user_notifications_request_idx
  on user_notifications (request_id);


-- Emails to the developer. A row is written in the same transaction as the
-- request it announces, and sending happens afterwards, so a mail provider
-- being down can delay a notification but never lose a request.
create table if not exists email_outbox (
  id              bigserial primary key,
  kind            text not null,
  -- Stops one event from being queued twice (e.g. a resubmitted request).
  dedupe_key      text not null unique,
  request_id      bigint references course_change_requests(id) on delete set null,
  to_address      text not null,
  subject         text not null,
  body_text       text not null,
  body_html       text,
  status          text not null default 'pending'
                    check (status in ('pending', 'sent', 'failed', 'cancelled')),
  attempts        integer not null default 0,
  last_error      text,
  next_attempt_at timestamptz not null default now(),
  created_at      timestamptz not null default now(),
  sent_at         timestamptz
);

create index if not exists email_outbox_due_idx
  on email_outbox (next_attempt_at) where status = 'pending';

alter table user_notifications enable row level security;
alter table email_outbox       enable row level security;
-- No policies: both are reachable only through the API.
