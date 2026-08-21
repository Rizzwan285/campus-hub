-- One row per student: how much of the timetable they have set up and when the
-- API last saw them. Nothing here identifies a student beyond their roll number.
select
    p.id                    as user_id,
    p.roll_number,
    p.mess,
    p.program,
    p.branch,
    p.year_of_study,
    p.role,
    p.created_at,
    p.last_seen_at,
    coalesce(c.course_count, 0)     as course_count,
    coalesce(c.course_count, 0) > 0 as has_timetable
from {{ source('campus_hub', 'profiles') }} p
left join (
    select user_id, count(*) as course_count
    from {{ source('campus_hub', 'user_courses') }}
    group by user_id
) c on c.user_id = p.id
