# IIT Palakkad Campus Hub

A web app for IIT Palakkad students to check mess menus, bus schedules, campus
timings and their class timetable in one place.

The frontend works on its own — every card falls back to data bundled in
`src/data`, so you can clone and run it with no database, no API and no
configuration. The API and Postgres add accounts, cross-device sync and
live content editing through `/admin`.

- **Run it locally:** [Quick start](#quick-start) — one command, no setup
- **Run the whole stack:** [With the API and database](#running-with-the-api-and-database)
- **Put it on your own hosting:** [Deploy your own copy](#deploy-your-own-copy)

---

## Features

- **Mess Menu** — 4-week rotating menu with daily breakfast, lunch, snacks, and dinner
- **Bus Schedule** — Weekday, Friday, Saturday/holiday and Sunday timetables for campus, town, and Wise Park routes
- **Mess Timings** — Separate timings for weekdays and weekends
- **Date Preview** — Browse any date's menu and bus schedule
- **Class Timetable** — Pick your courses; the weekly grid resolves slots, rooms and clashes
- **Timing corrections** — When a professor moves, adds or cancels a class, fix it in your own timetable at once, or suggest the change for everyone taking the course
- **Sign-in** — Roll number only, no password; profile, course picks and your own timings sync across devices
- **Developer tools** — Edit mess menus, timings, bus schedules and course slots live at `/admin`, and approve or reject students' timing suggestions, no redeploy
- **Dark Mode** — Toggle between light and dark themes
- **Real-time Clock** — Live time display with next-bus countdown

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | React 18 + TypeScript |
| Build Tool | Vite 5 |
| Styling | Tailwind CSS 3 |
| UI Components | shadcn/ui (Radix UI) |
| Routing | React Router v6 |
| Data Fetching | TanStack Query v5 |
| Client state | Zustand (persisted to localStorage) |
| Date Handling | date-fns + date-fns-tz (everything pinned to `Asia/Kolkata`) |
| Tests | Vitest |
| Backend | Express 5 + TypeScript on `tsx`, no build step ([`server/`](server/README.md)) |
| Database | PostgreSQL — hand-written SQL migrations, no ORM |
| Local stack | Docker Compose (Postgres + API + frontend + Airflow) |
| Data pipeline | Apache Airflow 2.9 + dbt ([`pipeline/`](pipeline/README.md)) |

---

## Quick start

### Prerequisites

| Tool | Version | Needed for |
|---|---|---|
| Node.js | **20 or newer** (20.12+ to run the tests) | Frontend and API. `server/` declares `engines.node >= 20`, and Vitest fails to start on Node 18 with a misleading `SyntaxError` about `styleText`. |
| npm | 9+ | Comes with Node. |
| Docker + Compose v2 | optional | Running the whole stack in containers, including Airflow. |
| Python 3.12 | optional | Only to re-parse institute timetable workbooks (`scripts/pipeline/`). Not needed to run or build the app. |

### Run the frontend on its own

```bash
git clone https://github.com/Rizzwan285/campus-hub.git
cd campus-hub
npm install
npm run dev
```

Open **http://localhost:8080** — the dev server is on 8080, not Vite's default
5173 (set in [`vite.config.ts`](vite.config.ts)).

No `.env` and no database needed. With `VITE_API_URL` unset, every card reads
the data bundled in `src/data`, which is the same resilience path the deployed
app uses when the API is asleep. Accounts, sync and `/admin` need the API — see
below.

---

## Running with the API and database

Two ways: Docker brings up everything in one command, or you can run the API
against a Postgres of your own.

### Option A — Docker Compose (everything, migrated and seeded)

```bash
docker compose up -d --build
```

| Service | URL | Notes |
|---|---|---|
| Frontend (nginx) | http://localhost:8080 | Production build |
| API | http://localhost:4000 | `GET /api/health` reports database connectivity |
| Airflow | http://localhost:8081 | Login `admin` / `admin`; DAGs start paused |
| Postgres | `localhost:5433` | user `dev`, password `dev_password`, database `campus_hub` |

Migrations and the seed run automatically in a one-shot `api-init` container
before the API starts, so a fresh clone comes up with real data and no manual
steps.

```bash
docker compose down       # stop, keep the database
docker compose down -v    # stop and wipe the database
```

Live reload for both the API and the frontend:

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build
```

Run the dbt models (a Compose profile, so it stays out of the default `up`):

```bash
docker compose --profile dbt run --rm dbt build
```

Things worth knowing before the first run:

- **Ports 4000, 8080 and 8081 must be free.** Postgres is deliberately published
  on **5433** because a local Postgres install usually already owns 5432. If one
  of the others clashes, change the left-hand number in
  [`docker-compose.yml`](docker-compose.yml).
- **Your user needs Docker access**, or every command needs `sudo`:
  ```bash
  sudo usermod -aG docker $USER && newgrp docker
  docker info        # should print server info, no permission error
  ```
- **The API image builds from the repo root, never from `server/`** — `seed.ts`
  imports `../../src/data`, so a `server/`-only build context cannot seed:
  ```bash
  docker build -f server/Dockerfile -t campus-hub-api .
  ```
- **The Compose Postgres is a separate database** from anything you host
  remotely. A change to `src/data` reaches it via `docker compose up --build`
  and your hosted database via `npm run migrate && npm run seed`. Doing one and
  assuming the other is how the two drift apart.
- **Sign in as the developer** with the roll number in `ADMIN_ROLL_NUMBER` in
  [`docker-compose.yml`](docker-compose.yml) — change it to yours — after
  setting a password (see [Signing in](#signing-in)).
- Disk: the Airflow image is ~2 GB and the Node build images add ~1.5 GB.

### Option B — API on your own Postgres

You need a Postgres you can reach: a local install, or a hosted one such as
Supabase. Then, from the repo root:

```bash
# 1. Point the frontend at the local API
cp .env.example .env               # VITE_API_URL=http://localhost:4000

# 2. Configure and start the API
cd server
npm install
cp .env.example .env               # fill in DATABASE_URL and SESSION_SECRET
npm run migrate                    # create the schema
npm run seed                       # load src/data into Postgres
npm run dev                        # API on http://localhost:4000
```

Then `npm run dev` at the repo root in a second terminal.

The two values you cannot skip in `server/.env`:

```bash
# A local Postgres needs no SSL — the API detects localhost and turns it off.
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/campus_hub

# Required, minimum 32 characters. Generate one:
#   node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
SESSION_SECRET=...
```

Everything else has a working default. See
[Environment variables](#environment-variables) for the full list and
[`server/README.md`](server/README.md) for the schema and endpoints.

Check the result:

```bash
curl -s localhost:4000/api/health      # {"status":"ok","database":true,...}
cd server && npm run verify            # diffs every API response against src/data
```

### Signing in

Students sign in with a **roll number only, no password** — the account is
created on first sign-in. The developer account does carry a password, because
it can write to everyone's data, so set one before using `/admin`:

```bash
cd server
npm run set-admin -- --password 'at-least-8-characters'
# or against a different roll number:
npm run set-admin -- --roll <your-roll-number> --password '...'
```

It creates or updates the account named by `ADMIN_ROLL_NUMBER` and stores only a
scrypt hash. Run it against the same database the app is using — the Docker
Postgres and a hosted one are different databases. Then open `/admin`.

### Seeding, and what it does to your edits

`npm run seed` refreshes content from `src/data` **without discarding anything
edited through `/admin`**: every editable row records whether its value came
from the files (`source = 'seed'`) or an admin (`source = 'admin'`), and seeding
rewrites only the former, then reports what it preserved.

`npm run seed:reset` discards admin edits and makes the database match the files
exactly. It is the only thing that undoes an admin change. The **Edits** tab in
`/admin` lists everything currently overriding the files.

---

## Tests and checks

```bash
npm test                      # Vitest unit tests (needs Node >= 20.12)
npm run lint                  # ESLint
cd server && npm run typecheck # tsc --noEmit
cd server && npm run verify    # API responses vs. the bundled static data
```

If `npm test` dies at startup complaining about `styleText`, your `node` is
older than 20.12 — switch with `nvm use 20`, not a code change.

`npm run verify` needs a running API pointed at a seeded database — by default
`http://localhost:4000`, or any other with `API=https://<your-api> npm run
verify`. A mismatch after a reseed usually means that value was edited in
`/admin` and was therefore preserved rather than refreshed; check the **Edits**
tab.

---

## Available scripts

Repo root (frontend):

| Command | Description |
|---|---|
| `npm run dev` | Dev server on http://localhost:8080 |
| `npm run build` | Production build into `dist/` |
| `npm run build:dev` | Production build in development mode |
| `npm run preview` | Serve the built bundle locally |
| `npm run lint` | Run ESLint |
| `npm test` | Run the unit tests |

`server/`:

| Command | Description |
|---|---|
| `npm run dev` | API with reload on http://localhost:4000 |
| `npm start` | API without reload (what Render runs) |
| `npm run migrate` | Apply pending `db/migrations/*.sql`; safe to re-run |
| `npm run seed` | Load `src/data` into Postgres, keeping admin edits |
| `npm run seed:reset` | Load `src/data`, discarding admin edits |
| `npm run verify` | Diff every API response against `src/data` |
| `npm run set-admin` | Create/update the developer account's password |
| `npm run typecheck` | `tsc --noEmit` |

---

## Project structure

```
campus-hub/
├── docker-compose.yml       # Postgres + api-init + API + frontend + Airflow
├── docker-compose.dev.yml   # Overlay: live reload for API and frontend
├── Dockerfile               # Frontend build → nginx
├── Dockerfile.dev           # Vite dev server image
├── docker/
│   ├── nginx.conf           # SPA fallback for the built frontend
│   └── initdb/              # Creates the separate `airflow` database
├── .github/workflows/
│   └── health-check.yml     # Keeps a free-tier API awake (see below)
├── pipeline/                # Airflow DAGs + dbt project (see pipeline/README.md)
│   ├── dags/                # campus_data_quality, campus_analytics_etl, menu_change_tracker
│   ├── dbt/                 # staging + marts models with tests
│   └── scripts/             # Standalone quality checks, analytics DDL
├── scripts/pipeline/        # Offline Python parsers: institute .xlsx → src/data/timetable
├── server/                  # Express + Postgres API (see server/README.md)
│   ├── Dockerfile           # Build from the repo root, not from server/
│   ├── db/migrations/       # Plain SQL, applied in order, never edited after the fact
│   ├── scripts/             # migrate, seed, verify, set-admin
│   └── src/
│       ├── auth/            # HMAC session tokens, scrypt password hashing
│       ├── middleware/      # auth, response cache
│       ├── repositories/    # Hand-written SQL per domain
│       ├── routes/          # content (public), admin, auth, course changes
│       └── app.ts
├── src/
│   ├── components/
│   │   ├── features/        # Cards, login, onboarding, account settings
│   │   │   └── timetable/   # Weekly grid, course selector, timings editor
│   │   ├── layout/          # AppLayout, Header, Footer
│   │   └── ui/              # shadcn/ui components
│   ├── data/                # Bundled fallback data, also the seed source
│   │   ├── busData.ts       # All bus routes and schedules
│   │   ├── messData.ts      # 4-week rotating mess menu
│   │   ├── canteenData.ts
│   │   └── timetable/       # Per-branch course JSON, slots, holidays
│   ├── engine/              # Slot → weekly-schedule resolution, clash detection
│   ├── hooks/
│   │   ├── useApiData.ts    # API-backed queries with static fallback
│   │   └── useAccountBridge.ts
│   ├── pages/               # Index, Campus, Timetable, Admin, NotFound
│   ├── services/            # api.ts (fetch wrapper), timetableLoader, courseChanges
│   ├── store/               # Zustand: auth, user, timetable
│   └── utils/               # dateUtils (IST, day types, bus resolution), colorUtils
├── index.html
├── vercel.json              # SPA rewrite for the hosted frontend
├── vite.config.ts
└── tailwind.config.ts
```

Not in the repository: `raw_data/` (source PDFs and workbooks) and the private
operator notes are gitignored, so `scripts/pipeline/` is reproducible only with
your own copies of the institute files. The committed JSON in
`src/data/timetable/` is its output.

### How data loads

Cards read through `useApiData` / `TimetableLoader`, which try the API first and
fall back to the data bundled in `src/data`. That keeps the app usable while the
API is asleep, unreachable, or not configured at all — a cold start shows
correct content rather than an error, then refreshes once the API answers.

Two consequences, both load-bearing:

- **A component must never hard-fail on a fetch error.** The fallback is the
  whole resilience story.
- **`src/data` drifts from the database** once anyone edits through `/admin`.
  That is by design: the files are the baseline, the database holds the
  corrections. They resync only on `npm run seed`.

System diagram and the reasoning behind each boundary:
**[ARCHITECTURE.md](ARCHITECTURE.md)**.

---

## Data pipeline

`pipeline/` holds an Airflow project with three DAGs and a dbt project. It reads
the app's operational tables and writes an analytics star schema; the app does
not depend on it.

| DAG | Schedule | What it does |
|---|---|---|
| `campus_data_quality` | 06:00 IST | Four integrity checks: empty menu cells, gaps in bus ordering, slotted courses with no meetings, duplicate roll numbers |
| `campus_analytics_etl` | 07:00 IST | Loads a star schema into the `analytics` schema — three dimensions, three facts |
| `menu_change_tracker` | 07:30 IST | Change data capture: diffs the live menu against the last snapshot |

The DAGs arrive paused. Unpause and trigger one:

```bash
docker compose exec airflow airflow dags unpause campus_data_quality
docker compose exec airflow airflow dags trigger campus_data_quality
```

`course_meetings_exist` **warns** rather than fails: roughly fifteen course
offerings carry free-text slot remarks ("alt weeks half batch") that the parser
cannot turn into meetings. That is a known data gap, not a broken check.

See **[`pipeline/README.md`](pipeline/README.md)** for the schema, the dbt
models, and how to run the checks without Airflow.

---

## Deploy your own copy

The deployed shape is a static frontend, a separate API, and a managed Postgres.
What follows uses Vercel, Render and Supabase because all three have a usable
free tier, but nothing in the code is tied to them.

```
┌─────────────┐      HTTPS + CORS       ┌──────────────┐      Postgres      ┌──────────────┐
│   Vercel    │ ──────────────────────► │    Render    │ ─────────────────► │   Supabase   │
│  (frontend) │   VITE_API_URL          │    (API)     │   DATABASE_URL     │  (Postgres)  │
└─────────────┘                         └──────────────┘                    └──────────────┘
```

> **Order matters.** Database → API → frontend → *then* add the frontend's URL
> to the API's `CORS_ORIGIN`. Until that last step the browser blocks every API
> call, and because of the static fallback **the page still looks completely
> fine while serving bundled data**. Step 6 is not optional.

### 1. Get the code into your own repository

Either fork it on GitHub, or start a clean copy with no fork link — create an
empty repository under your own account first, then:

```bash
git clone https://github.com/Rizzwan285/campus-hub.git my-campus-hub
cd my-campus-hub
git remote set-url origin https://github.com/<you>/<your-repo>.git
git push -u origin main
```

Then, before deploying, change the things that point at the original
deployment:

- `API_URL` in [`.github/workflows/health-check.yml`](.github/workflows/health-check.yml) — your API's URL
- `ADMIN_ROLL_NUMBER` in [`docker-compose.yml`](docker-compose.yml) — your roll number
- `SESSION_SECRET` in [`docker-compose.yml`](docker-compose.yml) if you expose the local stack to anyone

Nothing secret is committed: `.env` and `server/.env` are gitignored and only
the `.env.example` files are tracked. Confirm with
`git check-ignore .env server/.env` before your first push.

### 2. Create the database

1. Create a project at [supabase.com](https://supabase.com). Put it in the
   region closest to your users.
2. **Project Settings → Database → Connection pooling** gives you two URLs.
   Both matter:
   - port **6543**, the transaction pooler → `DATABASE_URL` (runtime queries)
   - port **5432**, the session pooler → `DIRECT_URL` (migrations and seeds,
     which need session-level DDL)
3. Copy both into `server/.env`.

Two traps that cost real debugging time:

- **Use the pooler hostname, not `db.<project-ref>.supabase.co`.** The direct
  host is IPv6-only, and most hosting providers only give you IPv4. The symptom
  is a confusing `ENOTFOUND`.
- **URL-encode special characters in the password:** `!` → `%21`, `@` → `%40`,
  `#` → `%23`. An unencoded `@` splits the URL in the wrong place.

### 3. Migrate and seed from your machine

Run these locally rather than on the host — they only need to run once per
schema change, and `DIRECT_URL` is easier to use from a laptop:

```bash
cd server
npm install
npm run migrate                                   # applies db/migrations/*.sql
npm run seed                                      # loads src/data
npm run set-admin -- --password 'your-password'    # developer account
```

`npm run migrate` records applied files in a `schema_migrations` table and skips
them next time, so it is safe to re-run. Add new migrations as new files —
**never edit one that has already been applied.**

### 4. Deploy the API

On [Render](https://dashboard.render.com): **New + → Web Service**, connect the
repository, then:

| Setting | Value |
|---|---|
| **Root Directory** | `server` ← easy to miss, and the build fails without it |
| Runtime | Node |
| Build Command | `npm install` |
| Start Command | `npm start` |
| Region | the same one as your database |
| Health Check Path | `/api/health` (under Advanced) |

Set these under **Environment**, from your `server/.env`:

`DATABASE_URL`, `DIRECT_URL`, `NODE_ENV=production`, `SESSION_SECRET`,
`SESSION_DAYS`, `ADMIN_ROLL_NUMBER`, `ADMIN_API_KEY`, and `CORS_ORIGIN` (you
will come back to that one in step 6).

**Do not set `PORT`** — Render injects it and the server already reads it.

Verify once it is live:

```bash
curl https://<your-api>.onrender.com/api/health
# {"status":"ok","database":true,"uptime":12}
```

`"database": true` is the part that matters; it means the pooler connection
works.

### 5. Deploy the frontend

On [vercel.com/new](https://vercel.com/new), import the repository. Vercel
detects Vite; leave **Root Directory** as `./` (the frontend is at the repo
root, only the API lives in `server/`). The build command and output directory
are already pinned in [`vercel.json`](vercel.json), which also supplies the SPA
rewrite that makes `/timetable` survive a hard refresh.

Add one environment variable, for all environments:

| Variable | Value |
|---|---|
| `VITE_API_URL` | `https://<your-api>.onrender.com` — **no trailing slash** |

> **Anything prefixed `VITE_` is compiled into the public JavaScript bundle**,
> and it is baked in at **build** time. Never put a database password or a
> service role key there, and remember that changing one of these does nothing
> until you redeploy.

Then check: the dashboard renders, `/timetable` survives a hard refresh, and
DevTools → Network shows calls to your API. CORS errors at this point are
expected — that is the next step.

### 6. Connect the two (required)

Your frontend's origin is not in the API's allowlist yet, so the browser is
blocking the calls and the app is quietly serving bundled fallback data.

On Render, set `CORS_ORIGIN` to a comma-separated list — no spaces, no trailing
slashes:

```
https://<your-app>.vercel.app,https://*.vercel.app
```

Render redeploys automatically. Reload the frontend and confirm in DevTools that
the API calls return 200 with an `access-control-allow-origin` header. **Check
this in DevTools, not by looking at the page** — the fallback makes a CORS
failure look like success.

The `*` is a single-label subdomain wildcard, so `https://*.vercel.app` covers
per-branch preview deployments but rejects `evil.vercel.app.attacker.com`. Drop
that entry if you don't want previews reaching the live API; they will fall back
to bundled data, which still works.

### 7. Keep a free-tier API awake

Render stops a free web service after 15 minutes without traffic and takes up to
a minute to start it again. The frontend's fallback covers the content, but
sign-in and the session check on page load need the API, so a sleeping API makes
the whole app feel slow.

[`.github/workflows/health-check.yml`](.github/workflows/health-check.yml) pings
`GET /api/ping` (no auth, no database) every 5 minutes. Set `API_URL` in it to
your API, then enable it:

1. **Actions** tab → enable workflows (GitHub disables them in forks by default).
2. Run **API health check** once manually — each run dispatches its successor,
   so the chain needs one push to start.

Why it is built this way: GitHub throttles high-frequency `schedule` events
hard, so a `*/5` cron fires nowhere near every 5 minutes. Each run therefore
loops for ~2 hours and then starts the next one itself via `workflow_dispatch`;
the cron in the file is only a safety net that restarts a broken chain. One
request per run goes to `/api/health` instead, which touches Postgres — enough
database activity to stop a free Supabase project being paused for inactivity
over a long break.

Limits worth knowing: Render's free allowance is 750 instance-hours per
workspace per month, and one always-awake service uses up to 744 — a second one
would exhaust it. GitHub Actions is free and unmetered for public repositories,
but disables scheduled workflows after 60 days without repository activity. An
external uptime monitor (UptimeRobot or cron-job.org, 5-minute interval, pointed
at `/api/ping`) is more punctual than GitHub and will email you when the API is
down; the two do not conflict.

### 8. Updating content after deployment

The point of the backend is that content no longer needs a code change and a
redeploy. Sign in as the developer account and edit at **`/admin`**: mess menus
and timings, bus departures and special routes, canteen prices, course slots,
holidays and instructional days, plus students' timing suggestions under
**Requests**.

Scripts and curl can use the write endpoints directly with the `X-Admin-Key`
header:

```bash
curl -X PUT https://<your-api>.onrender.com/api/admin/mess/kedaram/week13/Monday/Dinner \
  -H "X-Admin-Key: $ADMIN_API_KEY" \
  -H 'Content-Type: application/json' \
  -d '{"items":["Cabbage Thoran","Steam Rice"],"veg":"Paneer Butter Masala"}'
```

Changes appear within 5 minutes (the response cache window) or immediately on
refresh. The full endpoint list is in
[`server/README.md`](server/README.md#endpoints).

---

## Environment variables

### Repo root — frontend, compiled into the public bundle

| Variable | Required | Notes |
|---|---|---|
| `VITE_API_URL` | no | No trailing slash. Omit it and the app runs entirely on bundled data. |
| `VITE_SUPABASE_URL` | no | Only needed if you add Supabase Auth on the client. |
| `VITE_SUPABASE_ANON_KEY` | no | Public by design. |

Never add a database password or a service role key here.

### `server/` — the API, where the secrets live

| Variable | Required | Notes |
|---|---|---|
| `DATABASE_URL` | **yes** | Runtime queries. Transaction pooler (port 6543) on Supabase. |
| `DIRECT_URL` | no | Migrations and seeds. Session pooler (port 5432). |
| `SESSION_SECRET` | **yes** | 32+ characters, signs session tokens. **Rotating it signs everyone out.** |
| `PORT` | no | Defaults to 4000. Render injects its own — don't set it there. |
| `NODE_ENV` | no | `production` hides internal error messages from responses. |
| `CORS_ORIGIN` | no | Comma-separated origins; defaults to `http://localhost:8080`. `*` works as a single-label subdomain wildcard. |
| `SESSION_DAYS` | no | Defaults to 30. Days a session survives unused. |
| `ADMIN_ROLL_NUMBER` | no | Roll number granted developer rights. |
| `ADMIN_API_KEY` | no | Shared secret for the write endpoints, sent as `X-Admin-Key`. Admin UI uses the session instead; without it those endpoints return 503. |
| `SUPABASE_URL` | no | Reserved for future server-side Supabase Auth. |
| `SUPABASE_SERVICE_ROLE_KEY` | no | Server-only. Never expose to the browser. |

Templates: [`.env.example`](.env.example) and
[`server/.env.example`](server/.env.example). SSL is decided per connection —
on for hosted Postgres, off for `localhost` or `?sslmode=disable`, because a
plain Postgres refuses the handshake outright.

---

## Troubleshooting

| Symptom | Cause |
|---|---|
| `npm test` fails at startup on `styleText` | Node older than 20.12. `nvm use 20`. |
| `/api/health` returns `"database": false` | API is up, Postgres is not reachable. Check the pooler hostname (not `db.<ref>.supabase.co`, which is IPv6-only) and that the password is URL-encoded. |
| Page looks right but edits and sign-in don't work | CORS. The exact origin, including `https://` and with no trailing slash, must be in `CORS_ORIGIN`; redeploy the API after changing it. The fallback hides this — check DevTools. |
| `/timetable` 404s on hard refresh | The SPA rewrite is missing. `vercel.json` must be committed at the repo root. |
| Changing `VITE_API_URL` has no effect | `VITE_*` values are baked in at build time. Rebuild or redeploy. |
| Admin save returns 500 | A migration hasn't been applied to that database. Run `npm run migrate`. |
| Admin endpoints return 503 | `ADMIN_API_KEY` isn't set. A 401 instead means it is set but the `X-Admin-Key` header didn't match. |
| First request after idle takes ~40s | The free-tier API slept. See [step 7](#7-keep-a-free-tier-api-awake). |
| `docker compose` → permission denied | Your user isn't in the `docker` group. |
| Port already in use | 4000, 8080 and 8081 must be free; Postgres is on 5433 on purpose. |
| Frontend shows stale content | Responses are cached ~5 minutes by TanStack Query. Hard-refresh. |

---

## Further reading

| Document | Covers |
|---|---|
| [ARCHITECTURE.md](ARCHITECTURE.md) | System diagram, why each boundary sits where it does, request path, known limits |
| [`server/README.md`](server/README.md) | API setup, every endpoint, schema notes, keeping the API warm |
| [`pipeline/README.md`](pipeline/README.md) | Airflow DAGs, dbt models, the analytics schema |

---

## Contributing

Pull requests are welcome. For significant changes, open an issue first to
discuss what you'd like to change. Two house rules that are easy to trip over:

- **Never let a component hard-fail on a fetch error** — the static fallback is
  what keeps the app usable during a cold start.
- **Bus times are ordered strings, not times.** They carry no AM/PM marker; it
  is inferred from a departure's position in the list, so sorting or
  deduplicating a direction silently reinterprets every time after the edit.
