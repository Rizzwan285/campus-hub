-- Departure times are stored exactly as displayed and AM/PM is inferred from
-- position in the list, so sort_order — not the text — defines the timeline.
select
    d.id            as departure_id,
    d.day_type,
    t.label         as day_type_label,
    d.direction,
    d.depart_time,
    d.depart_minutes,
    d.sort_order,
    d.is_multiple_bus,
    row_number() over (
        partition by d.day_type, d.direction
        order by d.sort_order
    ) as position_in_day
from {{ source('campus_hub', 'bus_departures') }} d
left join {{ source('campus_hub', 'bus_day_types') }} t
  on t.slug = d.day_type
