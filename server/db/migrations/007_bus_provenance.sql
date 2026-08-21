-- The bus schedule gained an admin editor, so its rows need the same
-- provenance columns every other editable table got in migration 005:
-- a reseed must refresh the baseline without discarding hand-edited timings.

alter table bus_departures add column if not exists source text not null default 'seed';
alter table bus_departures add column if not exists customized_at timestamptz;

alter table bus_departures drop constraint if exists bus_departures_source_check;
alter table bus_departures add constraint bus_departures_source_check
  check (source in ('seed', 'admin'));

-- The seed looks up edited rows on every run; keep it cheap.
create index if not exists bus_departures_source_idx
  on bus_departures (source) where source = 'admin';
