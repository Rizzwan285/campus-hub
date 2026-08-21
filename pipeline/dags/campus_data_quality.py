"""Campus Data Quality DAG.

Runs the four integrity checks in scripts/data_quality_checks.py against the
operational database every morning. Failing checks fail the task, so Airflow's
own alerting surfaces bad data instead of the app doing it in front of students.
"""
from __future__ import annotations

from datetime import datetime, timedelta

import pendulum
from airflow import DAG
from airflow.operators.python import PythonOperator
from airflow.providers.postgres.hooks.postgres import PostgresHook

from data_quality_checks import CHECKS, FAIL, format_result

IST = pendulum.timezone("Asia/Kolkata")

default_args = {
    "owner": "campus-hub",
    "depends_on_past": False,
    "email_on_failure": False,
    "retries": 2,
    "retry_delay": timedelta(minutes=5),
}


def run_check(check_name: str, **context) -> str:
    """Run one named check and push its status to XCom."""
    hook = PostgresHook(postgres_conn_id="campus_hub_db")
    conn = hook.get_conn()
    try:
        result = CHECKS[check_name](conn)
    finally:
        conn.close()

    print(format_result(result))
    context["ti"].xcom_push(key=check_name, value=f"{result.status}: {result.detail}")

    if result.status == FAIL:
        raise ValueError(f"{result.name} failed — {result.detail}")
    return result.status


def quality_summary(**context) -> None:
    """Print one report covering every check that ran."""
    ti = context["ti"]
    print("=" * 60)
    print(f"Data Quality Report — {datetime.now().strftime('%Y-%m-%d')}")
    print("=" * 60)
    for name in CHECKS:
        # A failed upstream task pushes nothing; trigger_rule lets us say so.
        value = ti.xcom_pull(key=name, task_ids=f"check_{name}") or "NOT RUN"
        print(f"  {name}: {value}")
    print("=" * 60)


with DAG(
    dag_id="campus_data_quality",
    default_args=default_args,
    description="Daily data quality checks for Campus Hub",
    schedule="0 6 * * *",  # 06:00 IST, before the ETL
    start_date=datetime(2026, 8, 1, tzinfo=IST),
    catchup=False,
    max_active_runs=1,
    tags=["quality", "campus-hub"],
) as dag:
    checks = [
        PythonOperator(
            task_id=f"check_{name}",
            python_callable=run_check,
            op_kwargs={"check_name": name},
        )
        for name in CHECKS
    ]

    summary = PythonOperator(
        task_id="quality_summary",
        python_callable=quality_summary,
        # Report even when a check failed — the report is the useful artefact.
        trigger_rule="all_done",
    )

    checks >> summary
