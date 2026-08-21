"""Campus Analytics ETL DAG.

Reads the operational tables and loads a star schema into the `analytics`
schema of the same database: three dimensions (calendar, mess, courses) and
three facts (menu snapshot, bus daily, enrollment).

Every load is an idempotent upsert keyed on the DAG run's logical date, so a
rerun or a backfill rewrites that day's rows instead of duplicating them.
"""
from __future__ import annotations

from datetime import datetime, timedelta

import pendulum
from airflow import DAG
from airflow.operators.python import PythonOperator

from analytics_common import SCHEMA_SQL, ensure_analytics_schema, run_sql

IST = pendulum.timezone("Asia/Kolkata")

default_args = {
    "owner": "campus-hub",
    "depends_on_past": False,
    "email_on_failure": False,
    "retries": 1,
    "retry_delay": timedelta(minutes=3),
}


def create_analytics_schema(**_context) -> None:
    ensure_analytics_schema()
    print(f"Analytics schema applied from {SCHEMA_SQL}")


def load_dim_calendar(ds: str, **_context) -> None:
    """One row per day of the run's calendar year, flagged against academic_days."""
    year = int(ds[:4])
    run_sql(
        """
        insert into analytics.dim_calendar
            (date_key, day_of_week, day_type, is_holiday, holiday_name, week_number, month_name)
        select
            d::date,
            trim(to_char(d, 'Day')),
            case extract(dow from d)
                when 0 then 'sunday'
                when 5 then 'friday'
                when 6 then 'saturday'
                else 'weekday'
            end,
            exists (select 1 from academic_days ad
                     where ad.date = d::date and ad.kind = 'holiday'),
            (select ad.name from academic_days ad
              where ad.date = d::date and ad.kind = 'holiday'),
            extract(week from d)::int,
            trim(to_char(d, 'Month'))
        from generate_series(
            make_date(%s, 1, 1),
            make_date(%s, 12, 31),
            interval '1 day'
        ) d
        on conflict (date_key) do update set
            is_holiday   = excluded.is_holiday,
            holiday_name = excluded.holiday_name;
        """,
        (year, year),
    )
    print(f"Calendar dimension loaded for {year}")


def load_dim_mess(**_context) -> None:
    run_sql(
        """
        insert into analytics.dim_mess (slug, name, caterer, has_rotation)
        select slug, name, caterer, has_week_cycle
        from messes
        on conflict (slug) do update set
            name         = excluded.name,
            caterer      = excluded.caterer,
            has_rotation = excluded.has_rotation;
        """
    )
    print("Mess dimension loaded")


def load_dim_courses(**_context) -> None:
    run_sql(
        """
        insert into analytics.dim_courses
            (course_key, course_code, course_name, program, branch,
             category, credits, num_meetings, raw_slot)
        select
            co.id,
            co.course_code,
            co.course_name,
            co.program,
            co.branch,
            co.category,
            co.credits,
            (select count(*) from course_meetings cm where cm.offering_id = co.id),
            co.raw_slot
        from course_offerings co
        on conflict (course_key) do update set
            course_name  = excluded.course_name,
            category     = excluded.category,
            credits      = excluded.credits,
            num_meetings = excluded.num_meetings,
            raw_slot     = excluded.raw_slot;
        """
    )
    print("Courses dimension loaded")


def load_fct_menu(ds: str, **_context) -> None:
    """Snapshot every menu cell, carrying its seed/admin provenance."""
    run_sql(
        """
        insert into analytics.fct_menu_snapshot
            (snapshot_date, mess_key, week_cycle, day_of_week, meal,
             item_count, items, source)
        select
            %s::date,
            dm.mess_key,
            e.week_cycle,
            e.day_of_week,
            e.meal,
            cardinality(e.items),
            e.items,
            e.source
        from mess_menu_entries e
        join messes m             on m.id = e.mess_id
        join analytics.dim_mess dm on dm.slug = m.slug
        on conflict (snapshot_date, mess_key, week_cycle, day_of_week, meal)
        do update set
            item_count = excluded.item_count,
            items      = excluded.items,
            source     = excluded.source;
        """,
        (ds,),
    )
    print(f"Menu snapshot loaded for {ds}")


def load_fct_bus(ds: str, **_context) -> None:
    """First/last departure come from sort_order, never from string ordering.

    depart_time is stored as displayed ("7:45", "12:00") and AM/PM is inferred
    from position, so min()/max() on the text would put "10:00" before "7:45".
    """
    run_sql(
        """
        insert into analytics.fct_bus_daily
            (snapshot_date, day_type, direction, total_departures,
             first_departure, last_departure, multi_bus_count)
        select
            %s::date,
            day_type,
            direction,
            count(*),
            (array_agg(depart_time order by sort_order))[1],
            (array_agg(depart_time order by sort_order desc))[1],
            count(*) filter (where is_multiple_bus)
        from bus_departures
        group by day_type, direction
        on conflict (snapshot_date, day_type, direction) do update set
            total_departures = excluded.total_departures,
            first_departure  = excluded.first_departure,
            last_departure   = excluded.last_departure,
            multi_bus_count  = excluded.multi_bus_count;
        """,
        (ds,),
    )
    print(f"Bus facts loaded for {ds}")


def load_fct_enrollment(ds: str, **_context) -> None:
    run_sql(
        """
        insert into analytics.fct_enrollment (snapshot_date, course_key, enrolled_count)
        select %s::date, uc.offering_id, count(distinct uc.user_id)
        from user_courses uc
        group by uc.offering_id
        on conflict (snapshot_date, course_key) do update set
            enrolled_count = excluded.enrolled_count;
        """,
        (ds,),
    )
    print(f"Enrollment facts loaded for {ds}")


with DAG(
    dag_id="campus_analytics_etl",
    default_args=default_args,
    description="Daily ETL: operational tables -> analytics star schema",
    schedule="0 7 * * *",  # 07:00 IST, after the quality checks
    start_date=datetime(2026, 8, 1, tzinfo=IST),
    catchup=False,
    max_active_runs=1,
    tags=["etl", "analytics", "campus-hub"],
) as dag:
    create_schema = PythonOperator(
        task_id="create_schema", python_callable=create_analytics_schema
    )
    dim_calendar = PythonOperator(task_id="load_dim_calendar", python_callable=load_dim_calendar)
    dim_mess = PythonOperator(task_id="load_dim_mess", python_callable=load_dim_mess)
    dim_courses = PythonOperator(task_id="load_dim_courses", python_callable=load_dim_courses)
    fct_menu = PythonOperator(task_id="load_fct_menu", python_callable=load_fct_menu)
    fct_bus = PythonOperator(task_id="load_fct_bus", python_callable=load_fct_bus)
    fct_enrollment = PythonOperator(
        task_id="load_fct_enrollment", python_callable=load_fct_enrollment
    )

    # Dimensions first; each fact waits only on the dimension it references.
    create_schema >> [dim_calendar, dim_mess, dim_courses]
    dim_mess >> fct_menu
    dim_calendar >> fct_bus
    dim_courses >> fct_enrollment
