#!/usr/bin/env bash
# Single-container Airflow for local development: metadata DB migration, an
# admin user, then the scheduler alongside the webserver.
set -euo pipefail

airflow db migrate

airflow users create \
  --username "${_AIRFLOW_WWW_USER_USERNAME:-admin}" \
  --password "${_AIRFLOW_WWW_USER_PASSWORD:-admin}" \
  --firstname Admin --lastname User --role Admin \
  --email admin@example.com 2>/dev/null || true

airflow scheduler &

# exec so the webserver receives container signals directly.
exec airflow webserver
