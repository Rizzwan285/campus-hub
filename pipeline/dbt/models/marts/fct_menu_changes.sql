-- Menu edits as recorded by the API's audit trail.
--
-- This is the *who changed what* view. Its namesake in the `analytics` schema
-- (written by the menu_change_tracker DAG) is the *what differs from the last
-- snapshot* view — they answer different questions and are not duplicates.
with menu_edits as (

    select
        a.id            as audit_id,
        a.created_at,
        a.actor_roll,
        a.target,
        a.before,
        a.after
    from {{ source('campus_hub', 'audit_log') }} a
    where a.action = 'mess.menu.update'

),

parsed as (

    select
        audit_id,
        created_at,
        actor_roll,
        target,
        -- target is "${messSlug}/${weekCycle}/${day}/${meal}".
        split_part(target, '/', 1) as mess_slug,
        split_part(target, '/', 2) as week_cycle,
        split_part(target, '/', 3) as day_of_week,
        split_part(target, '/', 4) as meal,
        after
    from menu_edits

)

select
    p.audit_id,
    p.created_at,
    p.created_at::date as edit_date,
    p.actor_roll,
    p.mess_slug,
    m.name as mess_name,
    p.week_cycle,
    p.day_of_week,
    p.meal,
    coalesce(jsonb_array_length(p.after -> 'items'), 0) as item_count_after,
    p.after -> 'veg'     as veg_after,
    p.after -> 'nonVeg'  as non_veg_after
from parsed p
left join {{ source('campus_hub', 'messes') }} m
  on m.slug = p.mess_slug
