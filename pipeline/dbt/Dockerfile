# dbt runner for the Campus Hub analytics models.
#
# Separate from the Airflow image on purpose: dbt-core's dependency pins fight
# the Airflow constraints file, so the two never share an environment.
FROM python:3.11-slim

RUN apt-get update && apt-get install -y --no-install-recommends git \
    && rm -rf /var/lib/apt/lists/*

# dbt-core must be pinned alongside the adapter. dbt-postgres 1.8.2 declares
# `dbt-core>=1.8.0a1` with no upper bound, and because that bound is itself a
# pre-release specifier pip will happily resolve dbt-core 2.0.0bN (Fusion),
# which then refuses to load the 1.8 Postgres adapter. 1.8.10 is the newest
# stable 1.8.x and pins dbt-common/dbt-adapters to stable 1.x in turn.
RUN pip install --no-cache-dir \
      "dbt-core==1.8.10" \
      "dbt-postgres==1.8.2"

WORKDIR /usr/app/dbt
ENV DBT_PROFILES_DIR=/usr/app/dbt

COPY . /usr/app/dbt
