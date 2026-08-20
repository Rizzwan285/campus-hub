-- Lets a developer realign the odd/even menu rotation without a redeploy.
--
-- Which cycle is "this week" is derived on the client from a fixed anchor date.
-- That derivation cannot know when the mess restarts its own count — after a
-- semester break the caterer may resume on the week the anchor calls the other
-- one, and every student then sees the wrong menu until the anchor is patched.
-- This flag flips the derived cycle for one mess, so the correction is a toggle
-- in the admin panel rather than a code change.
--
-- Only meaningful where has_week_cycle is true; ignored for the rest.
alter table messes
  add column if not exists week_cycle_flipped boolean not null default false;
