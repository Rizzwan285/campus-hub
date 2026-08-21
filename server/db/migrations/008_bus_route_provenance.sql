-- Palakkad Town and Wise Park routes became admin-editable, so bus_routes
-- needs the provenance columns bus_departures got in 007. Without them the
-- seed's unconditional `delete from bus_routes` would discard every hand-typed
-- route on the next reseed.

alter table bus_routes add column if not exists source text not null default 'seed';
alter table bus_routes add column if not exists customized_at timestamptz;

alter table bus_routes drop constraint if exists bus_routes_source_check;
alter table bus_routes add constraint bus_routes_source_check
  check (source in ('seed', 'admin'));

-- The seed looks up edited rows on every run; keep it cheap.
create index if not exists bus_routes_source_idx
  on bus_routes (source) where source = 'admin';
