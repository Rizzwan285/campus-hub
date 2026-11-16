-- IIT Palakkad gazetted holidays for 2027, from the "List of holidays - 2027"
-- page of raw_data/Academic_Calender2027.pdf (cross-checked against the list
-- supplied on 17 Nov 2026; all 17 entries agree). Same pattern as 010: the
-- supplied list is admin-owned, so a reseed keeps it; 2026 rows are untouched.
--
-- * = subject to change based on the sighting of the moon; kept in the name.
-- academic_days holds one row per date, so the two holidays on 15 August
-- share one row. Weekdays are not stored: the PDF prints Buddha Purnima
-- (20 May 2027) as a Tuesday, but that date is a Thursday.
insert into academic_days (date, name, kind, source, customized_at) values
  ('2027-01-15', 'Pongal', 'holiday', 'admin', now()),
  ('2027-01-26', 'Republic Day', 'holiday', 'admin', now()),
  ('2027-03-10', 'Idu''l Fitr*', 'holiday', 'admin', now()),
  ('2027-03-23', 'Holi', 'holiday', 'admin', now()),
  ('2027-03-26', 'Good Friday', 'holiday', 'admin', now()),
  ('2027-04-19', 'Mahavir Jayanti', 'holiday', 'admin', now()),
  ('2027-05-17', 'Idu''l Zuha (Bakrid)*', 'holiday', 'admin', now()),
  ('2027-05-20', 'Buddha Purnima', 'holiday', 'admin', now()),
  ('2027-06-16', 'Muharram*', 'holiday', 'admin', now()),
  ('2027-08-15', 'Independence Day & Prophet Mohammad''s Birthday (Id-E-Milad)*', 'holiday', 'admin', now()),
  ('2027-10-02', 'Mahatma Gandhi''s Birthday', 'holiday', 'admin', now()),
  ('2027-10-08', 'Dussehra (Mahanavami)', 'holiday', 'admin', now()),
  ('2027-10-09', 'Dussehra (Vijaya Dashmi)', 'holiday', 'admin', now()),
  ('2027-10-29', 'Diwali (Deepavali)', 'holiday', 'admin', now()),
  ('2027-11-14', 'Guru Nanak''s Birthday', 'holiday', 'admin', now()),
  ('2027-12-25', 'Christmas Day', 'holiday', 'admin', now())
on conflict (date) do update
set name = excluded.name, kind = excluded.kind, source = excluded.source,
    customized_at = excluded.customized_at;
