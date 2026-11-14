-- Temporary bus services that run for a fixed stretch of dates on top of the
-- regular timetable: exam shuttles, convocation runs and the like.
--
-- Kept apart from bus_departures on purpose. Those are ordered, am/pm-less
-- strings whose meaning depends on their position in a day type's list; these
-- carry an explicit AM/PM and belong to a date window rather than a day type,
-- so they are merged into the day by the instant they resolve to.
--
-- No source/customized_at columns: `npm run seed` never touches this table.
-- It is edited only from the Bus tab in /admin.

create table if not exists bus_special_services (
  id               bigserial primary key,
  title            text not null,
  note             text,
  -- Inclusive on both ends. The service stops showing the day after end_date
  -- without anyone deleting the row.
  start_date       date not null,
  end_date         date not null,
  skip_sundays     boolean not null default true,
  -- Individual dates inside the window with no service (e.g. a holiday).
  skip_dates       date[] not null default '{}',
  -- Display strings with AM/PM, e.g. '9:05 AM'.
  nila_to_sahyadri text[] not null default '{}',
  sahyadri_to_nila text[] not null default '{}',
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint bus_special_services_window_check check (end_date >= start_date)
);

alter table bus_special_services enable row level security;

drop policy if exists bus_special_services_public_read on bus_special_services;
create policy bus_special_services_public_read on bus_special_services
  for select using (true);

-- Examination Team circular: shuttle for the Aug–Dec 2026 end-semester
-- examinations, 16–28 November, excluding the 24 November holiday. No exams,
-- and so no shuttle, on Sunday the 22nd.
insert into bus_special_services
  (title, note, start_date, end_date, skip_sundays, skip_dates, nila_to_sahyadri, sahyadri_to_nila)
select
  'Exam shuttle',
  'End-semester examinations, Aug–Dec 2026',
  date '2026-11-16',
  date '2026-11-28',
  true,
  array[date '2026-11-24'],
  array['9:05 AM', '9:10 AM', '12:50 PM'],
  array['9:05 AM', '12:50 PM']
where not exists (
  select 1 from bus_special_services
   where title = 'Exam shuttle' and start_date = date '2026-11-16'
);
