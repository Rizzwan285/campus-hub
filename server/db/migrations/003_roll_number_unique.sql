-- 002 created a partial unique index (`where roll_number is not null`), which
-- ON CONFLICT can only use if every upsert repeats that predicate. A plain
-- unique index behaves the same here — Postgres already allows repeated NULLs
-- in a unique index — and keeps the upsert in findOrCreateByRoll simple.

drop index if exists profiles_roll_number_key;

create unique index if not exists profiles_roll_number_key
  on profiles (roll_number);
