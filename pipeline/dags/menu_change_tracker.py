"""Menu Change Tracker DAG (change data capture).

Compares the live mess menu against the most recent snapshot in
analytics.fct_menu_snapshot and records every cell that was added, removed or
modified since then, along with whether the current value came from the seed
files or from an admin edit.

The comparison is against the last *captured* state rather than "yesterday", so
this DAG has no ordering dependency on campus_analytics_etl — it just reports
against whatever the last snapshot was.
"""
from __future__ import annotations

from datetime import datetime, timedelta

import pendulum
from airflow import DAG
from airflow.exceptions import AirflowSkipException
from airflow.operators.python import PythonOperator

from analytics_common import ensure_analytics_schema, fetch_all, run_sql

IST = pendulum.timezone("Asia/Kolkata")

default_args = {
    "owner": "campus-hub",
    "depends_on_past": False,
    "email_on_failure": False,
    "retries": 1,
    "retry_delay": timedelta(minutes=3),
}


def prepare(**_context) -> None:
    ensure_analytics_schema()


def detect_changes(ds: str, **context) -> int:
    """Diff the live menu against the newest snapshot; store what moved."""
    baseline = fetch_all("select max(snapshot_date) from analytics.fct_menu_snapshot")
    baseline_date = baseline[0][0] if baseline else None

    if baseline_date is None:
        # Nothing to diff against yet — run campus_analytics_etl once first.
        raise AirflowSkipException(
            "analytics.fct_menu_snapshot is empty; no baseline to compare against"
        )

    run_sql(
        """
        with prior as (
            select mess_key, week_cycle, day_of_week, meal, items
            from analytics.fct_menu_snapshot
            where snapshot_date = %s
        ),
        live as (
            select dm.mess_key, e.week_cycle, e.day_of_week, e.meal, e.items, e.source
            from mess_menu_entries e
            join messes m              on m.id = e.mess_id
            join analytics.dim_mess dm on dm.slug = m.slug
        )
        insert into analytics.fct_menu_changes
            (detected_on, mess_key, week_cycle, day_of_week, meal,
             change_type, previous_items, current_items, source)
        select
            %s::date,
            mess_key,
            week_cycle,
            day_of_week,
            meal,
            case
                when prior.mess_key is null then 'added'
                when live.mess_key  is null then 'removed'
                else 'modified'
            end,
            prior.items,
            live.items,
            live.source
        from live
        full outer join prior using (mess_key, week_cycle, day_of_week, meal)
        where prior.mess_key is null
           or live.mess_key is null
           or live.items is distinct from prior.items
        on conflict (detected_on, mess_key, week_cycle, day_of_week, meal)
        do update set
            change_type    = excluded.change_type,
            previous_items = excluded.previous_items,
            current_items  = excluded.current_items,
            source         = excluded.source;
        """,
        (baseline_date, ds),
    )

    rows = fetch_all(
        "select count(*) from analytics.fct_menu_changes where detected_on = %s", (ds,)
    )
    changed = rows[0][0]
    context["ti"].xcom_push(key="baseline_date", value=str(baseline_date))
    print(f"{changed} menu cell(s) changed since {baseline_date}")
    return changed


def report(**context) -> None:
    ti = context["ti"]
    ds = context["ds"]
    baseline = ti.xcom_pull(key="baseline_date", task_ids="detect_changes")

    rows = fetch_all(
        """
        select dm.name, c.week_cycle, c.day_of_week, c.meal, c.change_type, c.source
        from analytics.fct_menu_changes c
        join analytics.dim_mess dm on dm.mess_key = c.mess_key
        where c.detected_on = %s
        order by 1, 2, 3, 4
        """,
        (ds,),
    )

    print("=" * 60)
    print(f"Menu changes on {ds} (baseline {baseline})")
    print("=" * 60)
    if not rows:
        print("  no changes")
    for name, cycle, day, meal, change_type, source in rows:
        print(f"  {change_type:<9} {name}/{cycle}/{day}/{meal}  (source: {source})")
    print("=" * 60)


with DAG(
    dag_id="menu_change_tracker",
    default_args=default_args,
    description="CDC: detect mess menu changes against the last analytics snapshot",
    schedule="30 7 * * *",  # 07:30 IST, just after the ETL snapshot
    start_date=datetime(2026, 8, 1, tzinfo=IST),
    catchup=False,
    max_active_runs=1,
    tags=["cdc", "analytics", "campus-hub"],
) as dag:
    t_prepare = PythonOperator(task_id="prepare", python_callable=prepare)
    t_detect = PythonOperator(task_id="detect_changes", python_callable=detect_changes)
    t_report = PythonOperator(task_id="report", python_callable=report)

    t_prepare >> t_detect >> t_report
