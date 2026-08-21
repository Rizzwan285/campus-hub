-- Course dimension: one row per offering, with its resolved meeting profile.
--
-- course_key is course_offerings.id (`${program}_${branch}_${courseCode}`).
-- course_code alone is NOT unique — the same code is offered to several
-- branches — so never key on it.
with meetings as (

    select
        offering_id,
        count(*)                                        as num_meetings,
        count(*) filter (where type = 'lecture')        as num_lectures,
        count(*) filter (where type = 'lab')            as num_labs,
        count(*) filter (where type = 'tutorial')       as num_tutorials,
        count(distinct day)                             as days_per_week,
        sum(extract(epoch from (end_time - start_time)) / 3600.0) as contact_hours,
        count(*) filter (where recurrence <> 'weekly')  as num_biweekly_meetings
    from {{ source('campus_hub', 'course_meetings') }}
    group by offering_id

),

classified as (

    select
        co.id           as course_key,
        co.course_code,
        co.course_name,
        co.program,
        co.branch,
        co.semester,
        co.category,
        co.credits,
        co.raw_slot,
        co.source,
        co.source = 'admin'                 as is_admin_edited,
        coalesce(m.num_meetings, 0)         as num_meetings,
        coalesce(m.num_lectures, 0)         as num_lectures,
        coalesce(m.num_labs, 0)             as num_labs,
        coalesce(m.num_tutorials, 0)        as num_tutorials,
        coalesce(m.days_per_week, 0)        as days_per_week,
        round(coalesce(m.contact_hours, 0)::numeric, 2) as contact_hours,
        coalesce(m.num_biweekly_meetings, 0) as num_biweekly_meetings,

        -- raw_slot doubles as a status field. A course with no meetings is only
        -- a problem when its slot is a real expression; "TBD" / "N.A." / "Not
        -- required" / "-" are the workbook saying the course has no slot at all.
        -- Mirrors is_non_slot_status() in scripts/data_quality_checks.py.
        case
            when m.offering_id is not null                     then 'scheduled'
            when co.raw_slot is null or btrim(co.raw_slot) = '' then 'no_slot_required'
            when lower(btrim(co.raw_slot)) ~ '^(tbd|tba)\M'     then 'no_slot_required'
            when lower(btrim(co.raw_slot)) ~ '^n\.?\s?a\.?$'    then 'no_slot_required'
            when lower(btrim(co.raw_slot)) ~ '^n\s?/\s?a\M'     then 'no_slot_required'
            when lower(btrim(co.raw_slot)) ~ '^(nil|none)$'     then 'no_slot_required'
            when lower(btrim(co.raw_slot)) ~ '^no\s+slots?\M'   then 'no_slot_required'
            when lower(btrim(co.raw_slot)) ~ '(not|no|don''?t|do\s+not)\s+require'
                                                               then 'no_slot_required'
            when btrim(co.raw_slot) ~ '^[-–—.[:space:]]*$'      then 'no_slot_required'
            else 'unresolved'
        end as slot_status

    from {{ source('campus_hub', 'course_offerings') }} co
    left join meetings m on m.offering_id = co.id

)

select
    classified.*,
    -- A slot expression the parser could not turn into meetings: the real gap,
    -- as opposed to a course that legitimately has no slot.
    slot_status = 'unresolved' as has_unresolved_slot
from classified
