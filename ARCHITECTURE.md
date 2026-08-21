# Architecture

Campus Hub is a React app, an Express API, a Postgres database, and an Airflow
pipeline that reads the database. The pieces are separable on purpose: each one
can be down without taking the others with it.

---

## Deployed system

```
┌──────────────┐   HTTPS + CORS   ┌──────────────┐   Postgres   ┌────────────┐
│  Vercel      │ ───────────────► │  Render      │ ───────────► │  Supabase  │
│  React SPA   │   VITE_API_URL   │  Express API │ DATABASE_URL │  Postgres  │
└──────────────┘                  └──────────────┘              └────────────┘
       │                                                               ▲
       └── falls back to src/data/*.ts when the API is unreachable      │
                                                                       │
                                              ┌────────────────────────┘
                                              │  read + write analytics schema
                                       ┌──────┴───────┐
                                       │  Airflow     │  (local / self-hosted)
                                       │  3 DAGs      │
                                       └──────────────┘
```

## Local stack (`docker compose up`)

```
┌────────────┐   ┌────────────┐   ┌────────────┐   ┌────────────┐
│ frontend   │   │ api        │   │ api-init   │   │ airflow    │
│ nginx :80  │   │ tsx :4000  │   │ one-shot   │   │ web :8080  │
│ →  :8080   │   │ →  :4000   │   │ migrate +  │   │ + scheduler│
└─────┬──────┘   └─────┬──────┘   │ seed       │   │ →  :8081   │
      │                │          └─────┬──────┘   └─────┬──────┘
      │ VITE_API_URL   │                │                │
      └────────────────┴────────────────┴────────────────┘
                                │
                        ┌───────┴────────┐
                        │ db  postgres16 │
                        │  → :5433       │
                        │ campus_hub     │
                        │ airflow        │
                        └────────────────┘
```

`api` waits on `api-init` completing successfully, which waits on `db` being
healthy — so a fresh `docker compose up` yields a migrated, seeded, working app
with no manual steps.

---

## Why the boundaries sit where they do

**The frontend must survive the API being down.** Render's free tier cold-starts
in 30–60 seconds. Every card reads through `useApiData` / `TimetableLoader`,
which try the API and fall back to the data bundled in `src/data`. A component
that hard-fails on a fetch error is a bug, not a design choice.

**`src/data` is both the fallback and the seed source.** `server/scripts/seed.ts`
imports the same TypeScript files the app bundles, so the two cannot drift by
accident. Drift after an admin edit is expected: the files are the baseline, the
database holds the corrections. `npm run verify` diffs the whole API against the
files (1263 checks).

**Admin edits are provenance-tracked, not overwritten.** Every editable row
carries `source` (`seed` | `admin`) and `customized_at` (migrations 005 and 007).
`npm run seed` refreshes `seed` rows and leaves `admin` rows alone;
`npm run seed:reset` discards edits and matches the files exactly.

**Seeding deletes, never truncates.** `TRUNCATE ... RESTART IDENTITY` renumbers
serial ids, and `canteen_items` / `mess_menu_entries` hang off those ids —
truncating cascades away admin edits.

**Bus departure order is data.** Times are stored as displayed ("7:45") with no
AM/PM marker; the client infers the half of the day from a departure's position
in the list. That is why the admin editor rewrites a whole direction at once and
why a `sort_order` gap is a data-quality failure rather than cosmetic.

**Course `id` in API responses is the bare course code.** Users' localStorage
selections key on it. `offeringId` (`${program}_${branch}_${courseCode}`) is the
unique key; changing which one the API returns as `id` would silently wipe every
user's timetable.

**Analytics is a separate schema, not separate storage.** The dataset is small
enough that a warehouse would be ceremony. `analytics` (Airflow-owned) and
`analytics_dbt` (dbt-owned) sit beside `public` in the same database, and
Airflow's own metadata lives in a different database entirely.

---

## Request path

```
Browser
  └─► GET /api/mess
        └─► cache middleware   in-process Map, 5 min TTL, ETag → 304
              └─► content.routes.ts
                    └─► mess.repository.ts   hand-written SQL, no ORM
                          └─► pg Pool        SSL on for Supabase, off for local
```

Writes go through `/api/admin/*`, which requires an admin session token (or the
`X-Admin-Key` header), records the change in `audit_log`, and invalidates the
matching cache prefix so the next read is fresh.

---

## Data pipeline

```
public schema                    analytics schema           analytics_dbt schema
─────────────                    ────────────────           ────────────────────
mess_menu_entries ──┐            dim_calendar               stg_mess_menu
bus_departures    ──┼─ Airflow ─► dim_mess                  stg_bus_departures
course_offerings  ──┤   3 DAGs    dim_courses               stg_user_activity
course_meetings   ──┤            fct_menu_snapshot          dim_courses
profiles          ──┤            fct_menu_changes           fct_bus_utilization
user_courses      ──┤            fct_bus_daily              fct_menu_changes
academic_days     ──┘            fct_enrollment                    ▲
audit_log ───────────────────────────────────────────────── dbt ───┘
```

Quality checks run at 06:00 IST, the ETL at 07:00, change detection at 07:30.
Details in [`pipeline/README.md`](pipeline/README.md).

---

## Known limits

- **Rate limiting is per process.** The failed-login map lives in memory, so it
  protects one instance. More than one API instance needs Redis for the limit to
  mean anything. The map is bounded at 1000 entries regardless.
- **The response cache is per process** for the same reason, with a 5-minute TTL.
- **Roughly fifteen course offerings** carry free-text slot remarks ("alt weeks
  half batch") that the parser cannot turn into meetings. `RecurrenceRule`
  already supports `biweekly_odd` / `biweekly_even`; no data uses it yet. The
  quality DAG warns about these, and dbt's `dim_courses.has_unresolved_slot`
  lists them.
- **Multi-bus flags are matched by string.** A display time that occurs twice in
  a day is flagged in both places. The client renders it the same way, so the
  editor is consistent with what users see.
