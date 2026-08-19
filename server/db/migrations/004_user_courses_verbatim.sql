-- user_courses stores the client's own course identifiers.
--
-- The API exposes `id` as the bare course code (for backward compatibility with
-- selections already in users' localStorage) and `offeringId` as the unique
-- key. The timetable UI selects by the bare code, so the foreign key to
-- course_offerings(id) silently dropped every selection on save.
--
-- Dropping the constraint also means a semester reseed no longer cascades away
-- everyone's picks, which is the behaviour we want.

alter table user_courses drop constraint if exists user_courses_offering_id_fkey;

comment on column user_courses.offering_id is
  'Course identifier exactly as the client stores it (bare course code today).';
