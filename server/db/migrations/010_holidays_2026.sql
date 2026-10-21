-- IIT Palakkad gazetted holidays supplied for the full 2026 calendar year.
-- Preserve unrelated dates and mark this confirmed list as customized so reseeds keep it.
insert into academic_days (date, name, kind, source, customized_at) values
  ('2026-01-26', 'Republic Day', 'holiday', 'admin', now()),
  ('2026-03-04', 'Holi', 'holiday', 'admin', now()),
  ('2026-03-21', 'Idu''l Fitr*', 'holiday', 'admin', now()),
  ('2026-03-31', 'Mahavir Jayanti', 'holiday', 'admin', now()),
  ('2026-04-03', 'Good Friday', 'holiday', 'admin', now()),
  ('2026-05-01', 'Buddha Purnima', 'holiday', 'admin', now()),
  ('2026-05-27', 'Idu''l Zuha (Bakrid)*', 'holiday', 'admin', now()),
  ('2026-06-26', 'Muharram*', 'holiday', 'admin', now()),
  ('2026-08-15', 'Independence Day', 'holiday', 'admin', now()),
  ('2026-08-26', 'Prophet Mohammad''s Birthday (Id-E-Milad)*', 'holiday', 'admin', now()),
  ('2026-09-14', 'Ganesh Chaturthi/Vinayaka Chaturthi', 'holiday', 'admin', now()),
  ('2026-10-02', 'Mahatma Gandhi''s Birthday', 'holiday', 'admin', now()),
  ('2026-10-19', 'Dussehra (Mahashtami)', 'holiday', 'admin', now()),
  ('2026-10-20', 'Dussehra', 'holiday', 'admin', now()),
  ('2026-11-08', 'Diwali (Deepavali)', 'holiday', 'admin', now()),
  ('2026-11-24', 'Guru Nanak''s Birthday', 'holiday', 'admin', now()),
  ('2026-12-25', 'Christmas Day', 'holiday', 'admin', now())
on conflict (date) do update
set name = excluded.name, kind = excluded.kind, source = excluded.source,
    customized_at = excluded.customized_at;
