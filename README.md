# IIT Palakkad Campus Hub

A web app for IIT Palakkad students to quickly check mess menus, bus schedules, and campus timings — all in one place.

**Live site:** deployed on Vercel — see [DEPLOYMENT.md](DEPLOYMENT.md)

---

## Features

- **Mess Menu** — 4-week rotating menu with daily breakfast, lunch, snacks, and dinner
- **Bus Schedule** — Weekday, Saturday/holiday, and Sunday timetables for campus, town, and Wise Park routes
- **Mess Timings** — Separate timings for weekdays and weekends
- **Date Preview** — Browse any date's menu and bus schedule
- **Class Timetable** — Pick your courses; the weekly grid resolves slots, rooms and clashes
- **Sign-in** — Roll number only, no password; profile and course picks sync across devices
- **Developer tools** — Edit mess menus, timings, bus schedules and course slots live at `/admin`, no redeploy
- **Dark Mode** — Toggle between light and dark themes
- **Real-time Clock** — Live time display with next-bus countdown

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | React 18 + TypeScript |
| Build Tool | Vite |
| Styling | Tailwind CSS |
| UI Components | shadcn/ui (Radix UI) |
| Routing | React Router v6 |
| Data Fetching | TanStack Query |
| Date Handling | date-fns + date-fns-tz |
| Backend | Express 5 + TypeScript ([`server/`](server/README.md)) |
| Database | PostgreSQL (Supabase) |
| Hosting | Vercel (frontend) · Render (API) · Supabase (Postgres) |
| Local stack | Docker Compose (Postgres + API + frontend + Airflow) |
| Data pipeline | Apache Airflow 2.9 + dbt ([`pipeline/`](pipeline/README.md)) |

---

## Getting Started

### Prerequisites

- Node.js 18+
- npm

### Installation

```bash
# Clone the repository
git clone https://github.com/Rizzwan285/mess_bus_details.git
cd mess_bus_details

# Install dependencies
npm install

# Start the development server
npm run dev
```

The app will be available at `http://localhost:8080`.

### Running with the backend

The frontend works standalone — every card falls back to the data bundled in
`src/data` when no API is configured. To run against the database instead:

```bash
cp .env.example .env          # set VITE_API_URL=http://localhost:4000
cd server && npm install
cp .env.example .env          # fill in your database credentials
npm run migrate && npm run seed
npm run dev                   # API on :4000
```

See [`server/README.md`](server/README.md) for the schema, the endpoint list and
deployment notes.

---

## Running with Docker

One command brings up Postgres, the API (migrated and seeded), the frontend and
Airflow. Nothing else to install — no Node, no Python, no local database.

```bash
docker compose up -d --build

# http://localhost:8080  app
# http://localhost:4000  API
# http://localhost:8081  Airflow  (admin / admin)
# localhost:5433         Postgres (dev / dev_password)
```

Migrations and the seed run automatically in a one-shot `api-init` container
before the API starts, so a fresh clone comes up with real data.

```bash
docker compose down       # stop, keep the database
docker compose down -v    # stop and wipe the database
```

Live reload for both the API and the frontend:

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build
```

Run the dbt models (a profile, so it stays out of the default `up`):

```bash
docker compose --profile dbt run --rm dbt build
```

Ports 4000, 8080 and 8081 must be free; Postgres is published on **5433**
because a local Postgres install usually already owns 5432.

---

## Data Pipeline

`pipeline/` holds an Airflow project with three DAGs and a dbt project:

| DAG | Schedule | What it does |
|---|---|---|
| `campus_data_quality` | 06:00 IST | Four integrity checks: empty menu cells, gaps in bus ordering, slotted courses with no meetings, duplicate roll numbers |
| `campus_analytics_etl` | 07:00 IST | Loads a star schema into the `analytics` schema — three dimensions, three facts |
| `menu_change_tracker` | 07:30 IST | Change data capture: diffs the live menu against the last snapshot |

See **[`pipeline/README.md`](pipeline/README.md)** for the schema, how to trigger
a DAG, and how to run the checks without Airflow.

---

## Available Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start local development server |
| `npm run build` | Build for production (outputs to `dist/`) |
| `npm run preview` | Preview the production build locally |
| `npm run lint` | Run ESLint |
| `npm test` | Run the unit tests |

---

## Project Structure

```
mess_bus_details/
├── docker-compose.yml   # Postgres + API + frontend + Airflow
├── Dockerfile           # Frontend build → nginx
├── pipeline/            # Airflow DAGs + dbt project (see pipeline/README.md)
│   ├── dags/            # campus_data_quality, campus_analytics_etl, menu_change_tracker
│   ├── dbt/             # staging + marts models with tests
│   └── scripts/         # Standalone quality checks, analytics DDL
├── public/              # Static assets (favicon, images, robots.txt)
├── server/              # Express + Postgres API (see server/README.md)
│   ├── Dockerfile       # Build from the repo root, not from server/
│   ├── db/migrations/   # Plain SQL migrations
│   ├── scripts/         # migrate, seed, verify
│   └── src/
│       ├── repositories/# SQL per domain
│       ├── routes/      # content (public) and admin (authenticated)
│       └── app.ts
├── src/
│   ├── components/
│   │   ├── features/    # BusScheduleCard, MessMenuCard, MessTimingsCard
│   │   ├── layout/      # Header, Footer
│   │   └── ui/          # shadcn/ui components
│   ├── data/            # Bundled fallback data, also the seed source
│   │   ├── busData.ts   # All bus routes and schedules
│   │   └── messData.ts  # 4-week rotating mess menu
│   ├── hooks/
│   │   └── useApiData.ts# API-backed queries with static fallback
│   ├── lib/             # Utility functions
│   ├── pages/           # Index (dashboard), NotFound
│   ├── services/
│   │   ├── api.ts       # Fetch wrapper for VITE_API_URL
│   │   └── timetableLoader.ts
│   ├── utils/
│   │   └── dateUtils.ts # Day-type detection, IST timezone, bus filtering
│   ├── App.tsx
│   ├── main.tsx
│   └── index.css
├── index.html
├── vite.config.ts
├── tailwind.config.ts
└── package.json
```

### How data loads

Cards read through `useApiData` / `TimetableLoader`, which try the API first and
fall back to the data bundled in `src/data`. That keeps the app usable while the
API is asleep (Render's free tier idles out), unreachable, or not configured at
all — a cold start shows correct content rather than an error, then refreshes
once the API answers.

---

## Deployment

Pushing to `main` deploys the frontend automatically via Vercel. The API is a
separate Render service, and the database is Supabase Postgres.

Full walkthrough, including every environment variable: **[DEPLOYMENT.md](DEPLOYMENT.md)**.

System diagram and the reasoning behind each boundary: **[ARCHITECTURE.md](ARCHITECTURE.md)**.

---

## Contributing

Pull requests are welcome. For significant changes, open an issue first to discuss what you'd like to change.
