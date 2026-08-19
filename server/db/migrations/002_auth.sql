-- Roll-number login.
--
-- Students sign in with their roll number alone: this app stores no sensitive
-- data, so the roll number acts as an identifier rather than a secret. Accounts
-- holding a password_hash (currently only the developer account) must supply it,
-- which is what protects the admin write endpoints.

alter table profiles add column if not exists roll_number   text;
alter table profiles add column if not exists password_hash text;
alter table profiles add column if not exists last_seen_at  timestamptz;

-- Roll numbers are compared case-insensitively; store them upper-cased.
create unique index if not exists profiles_roll_number_key
  on profiles (roll_number)
  where roll_number is not null;

-- name is collected during onboarding, after the account already exists.
alter table profiles alter column name drop not null;

-- Records every admin write so a bad edit can be traced and undone.
create table if not exists audit_log (
  id         bigserial primary key,
  actor_id   uuid references profiles(id) on delete set null,
  actor_roll text,
  action     text not null,
  target     text not null,
  before     jsonb,
  after      jsonb,
  created_at timestamptz not null default now()
);

create index if not exists audit_log_recent_idx on audit_log (created_at desc);

alter table audit_log enable row level security;
-- No policy: readable only through the API's postgres connection.

-- Courses gained an editable slot; keep the audit trail honest about who
-- changed what by recording edits rather than silently overwriting.
alter table course_offerings add column if not exists updated_at timestamptz not null default now();

drop trigger if exists course_offerings_updated_at on course_offerings;
create trigger course_offerings_updated_at
  before update on course_offerings
  for each row execute function set_updated_at();
