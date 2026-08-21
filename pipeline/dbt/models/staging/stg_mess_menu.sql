-- One row per menu cell, with the Nila-style veg/non_veg pair folded into the
-- same shape as Kedaram's item array so downstream models see one grain.
with entries as (

    select
        e.id                as menu_entry_id,
        e.mess_id,
        e.week_cycle,
        e.day_of_week,
        e.meal,
        e.items,
        e.veg,
        e.non_veg,
        e.source,
        e.customized_at,
        e.updated_at
    from {{ source('campus_hub', 'mess_menu_entries') }} e

)

select
    entries.menu_entry_id,
    m.slug              as mess_slug,
    m.name              as mess_name,
    m.has_week_cycle    as mess_has_rotation,
    entries.week_cycle,
    entries.day_of_week,
    entries.meal,
    mo.meal_sort_order,
    mo.served_at,
    entries.items,
    cardinality(entries.items) as item_count,
    entries.veg,
    entries.non_veg,
    entries.source,
    entries.source = 'admin'   as is_admin_edited,
    entries.customized_at,
    entries.updated_at,
    -- An empty cell has neither an item list nor a veg/non_veg pair.
    (cardinality(entries.items) = 0
        and entries.veg is null
        and entries.non_veg is null) as is_empty
from entries
join {{ source('campus_hub', 'messes') }} m
  on m.id = entries.mess_id
-- Canonical meal ordering lives in a seed so it is not repeated in every model.
left join {{ ref('meal_order') }} mo
  on mo.meal = entries.meal
