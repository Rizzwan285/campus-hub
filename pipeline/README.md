# Campus Hub Data Pipeline

Airflow DAGs and a dbt project that turn the app's operational tables into an
analytics star schema, and check the operational data for integrity problems
before students see them.

Everything runs in Docker; nothing here needs to be installed locally.

```bash
docker compose up -d --build          # Airflow at http://localhost:8081 (admin/admin)
docker compose --profile dbt run --rm dbt build
```

---

## Layout

```
pipeline/
├── dags/
│   ├── campus_data_quality.py     # 06:00 IST — four integrity checks
│   ├── campus_analytics_etl.py    # 07:00 IST — star schema load
│   └── menu_change_tracker.py     # 07:30 IST — change data capture
├── dbt/
│   ├── models/staging/            # Views over the operational tables
│   ├── models/marts/              # Materialised dimensions and facts
│   ├── models/schema.yml          # dbt tests
│   └── seeds/meal_order.csv       # Canonical meal ordering
├── scripts/
│   ├── data_quality_checks.py     # The checks, importable and standalone
│   ├── analytics_common.py        # Shared DAG plumbing
│   └── generate_analytics_schema.sql  # The star schema DDL
├── Dockerfile                     # Airflow image
├── entrypoint.sh
└── requirements.txt
```

---

## The DAGs

### `campus_data_quality`

Four checks, each its own task so a failure names itself in the Airflow UI:

| Check | Fails when | Why it matters |
|---|---|---|
| `mess_menu_completeness` | A (mess, cycle, day, meal) cell has no items **and** no veg/non-veg pair | An empty cell renders as a blank meal in the app |
| `bus_schedule_order` | `sort_order` has a gap or duplicate within a (day_type, direction) | AM/PM is inferred from position — a gap silently shifts every later departure |
| `course_meetings_exist` | A course has a `raw_slot` but no meetings (**warns**, does not fail) | Roughly fifteen offerings carry free-text remarks the parser cannot resolve |
| `no_duplicate_roll_numbers` | Two profiles share a roll number | Login resolves by roll number |

Run them without Airflow — useful against production:

```bash
DATABASE_URL=postgresql://dev:dev_password@localhost:5433/campus_hub \
  python pipeline/scripts/data_quality_checks.py
```

Exit code is 1 if any check fails, 0 otherwise, so CI can call it directly.

### `campus_analytics_etl`

Builds the `analytics` schema (DDL in `scripts/generate_analytics_schema.sql`):

| Table | Grain |
|---|---|
| `dim_calendar` | One row per date of the run's year, flagged against `academic_days` |
| `dim_mess` | One row per mess |
| `dim_courses` | One row per course offering, with its meeting count |
| `fct_menu_snapshot` | One row per menu cell per snapshot date |
| `fct_bus_daily` | One row per (date, day_type, direction) |
| `fct_enrollment` | One row per (date, course) with its enrolled count |

Every load is an upsert keyed on the run's logical date, so reruns and backfills
overwrite that day rather than duplicating it.

### `menu_change_tracker`

Compares the live menu against the newest row set in `fct_menu_snapshot` and
records what was added, removed or modified into `fct_menu_changes`, carrying
each cell's `seed` / `admin` provenance. It skips itself with a clear message
when no snapshot exists yet — run `campus_analytics_etl` once first.

Because it diffs against the last *captured* state rather than "yesterday", it
has no ordering dependency on the ETL DAG.

---

## dbt

The dbt project models the same source tables a second way — staging views over
the operational tables, then materialised marts — with tests in
`models/schema.yml`.

It writes to **`analytics_dbt`**, deliberately apart from the `analytics` schema
the DAGs own, so the two approaches never fight over a table name. Where a name
appears in both (`dim_courses`, `fct_menu_changes`) they answer different
questions: the DAG's `fct_menu_changes` is a snapshot diff, dbt's is the API
audit trail.

```bash
docker compose --profile dbt run --rm dbt build   # seed + run + test
docker compose --profile dbt run --rm dbt test
docker compose --profile dbt run --rm dbt docs generate
```

`dbt build` runs seeds before models; `dbt run` on its own needs a prior
`dbt seed`, because `stg_mess_menu` joins the `meal_order` seed.

---

## Notes on the image

`requirements.txt` deliberately does **not** pin `apache-airflow` — the base
image owns that, and everything added on top is resolved against the official
constraints file for that Airflow version.

dbt lives in its own image (`dbt/Dockerfile`) because dbt-core's dependency pins
conflict with the Airflow constraints. `great-expectations` is not installed for
the same reason; the four checks are plain SQL and need nothing extra.

Airflow keeps its metadata in a separate `airflow` database on the same Postgres
instance (created by `docker/initdb/01-airflow-db.sql`) so its ~40 tables stay
out of `campus_hub`, where the quality DAG queries the public schema.
