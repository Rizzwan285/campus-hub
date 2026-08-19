-- Lets `npm run seed` refresh content from src/data without discarding edits
-- made through the admin panel.
--
-- Every editable row records where its current value came from. Seeding
-- rewrites rows that are still 'seed' and leaves 'admin' rows alone, so the
-- two sources of truth can coexist: the files stay the baseline, the database
-- holds the corrections.

do $$
declare t text;
begin
  foreach t in array array[
    'mess_menu_entries', 'mess_timings', 'canteen_items',
    'academic_days', 'course_offerings'
  ] loop
    execute format(
      'alter table %I add column if not exists source text not null default ''seed''', t);
    execute format(
      'alter table %I add column if not exists customized_at timestamptz', t);
    execute format(
      'alter table %I drop constraint if exists %I', t, t || '_source_check');
    execute format(
      'alter table %I add constraint %I check (source in (''seed'', ''admin''))',
      t, t || '_source_check');
  end loop;
end $$;

-- Finding customised rows is the seed's hot path; keep it cheap.
create index if not exists mess_menu_entries_source_idx on mess_menu_entries (source) where source = 'admin';
create index if not exists canteen_items_source_idx     on canteen_items (source)     where source = 'admin';
create index if not exists course_offerings_source_idx  on course_offerings (source)  where source = 'admin';
