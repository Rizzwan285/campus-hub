-- Service-level metrics per (day_type, direction).
--
-- The shuttle has no ridership instrumentation, so "utilization" here means
-- how much service is offered — frequency, span, and where two buses run —
-- not how full the buses are.
with departures as (

    select *
    from {{ ref('stg_bus_departures') }}

),

gaps as (

    select
        day_type,
        direction,
        depart_minutes - lag(depart_minutes) over (
            partition by day_type, direction order by sort_order
        ) as gap_minutes
    from departures
    where depart_minutes is not null

)

select
    d.day_type,
    d.day_type_label,
    d.direction,
    count(*)                                        as total_departures,
    count(*) filter (where d.is_multiple_bus)       as multi_bus_departures,
    round(
        100.0 * count(*) filter (where d.is_multiple_bus) / nullif(count(*), 0),
        1
    )                                               as multi_bus_pct,
    (array_agg(d.depart_time order by d.sort_order))[1]      as first_departure,
    (array_agg(d.depart_time order by d.sort_order desc))[1] as last_departure,
    max(d.depart_minutes) - min(d.depart_minutes)   as service_span_minutes,
    (select round(avg(g.gap_minutes), 1)
       from gaps g
      where g.day_type = d.day_type
        and g.direction = d.direction)              as avg_gap_minutes,
    (select max(g.gap_minutes)
       from gaps g
      where g.day_type = d.day_type
        and g.direction = d.direction)              as max_gap_minutes
from departures d
group by d.day_type, d.day_type_label, d.direction
