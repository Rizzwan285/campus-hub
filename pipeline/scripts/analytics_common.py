"""Shared plumbing for the analytics DAGs.

Lives in scripts/ rather than dags/ because importing one DAG module from
another makes Airflow register the imported DAGs twice.
"""
from __future__ import annotations

from pathlib import Path

SCHEMA_SQL = Path(__file__).resolve().parent / "generate_analytics_schema.sql"

CAMPUS_HUB_CONN_ID = "campus_hub_db"


def run_sql(sql: str, params: tuple | None = None) -> None:
    """Execute a statement against the operational database and commit."""
    from airflow.providers.postgres.hooks.postgres import PostgresHook

    conn = PostgresHook(postgres_conn_id=CAMPUS_HUB_CONN_ID).get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute(sql, params)
        conn.commit()
    finally:
        conn.close()


def fetch_all(sql: str, params: tuple | None = None) -> list[tuple]:
    """Read rows from the operational database."""
    from airflow.providers.postgres.hooks.postgres import PostgresHook

    conn = PostgresHook(postgres_conn_id=CAMPUS_HUB_CONN_ID).get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute(sql, params)
            return cur.fetchall()
    finally:
        conn.close()


def ensure_analytics_schema() -> None:
    """Apply the star-schema DDL. Idempotent — every statement is IF NOT EXISTS."""
    run_sql(SCHEMA_SQL.read_text())
