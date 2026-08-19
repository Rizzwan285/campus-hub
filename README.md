# IIT Palakkad Campus Hub

A web app for IIT Palakkad students to quickly check mess menus, bus schedules, and campus timings — all in one place.

**Live site:** [Rizzwan285.github.io/mess_bus_details](https://rizzwan285.github.io/mess_bus_details/)

---

## Features

- **Mess Menu** — 4-week rotating menu with daily breakfast, lunch, snacks, and dinner
- **Bus Schedule** — Weekday, Saturday/holiday, and Sunday timetables for campus, town, and Wise Park routes
- **Mess Timings** — Separate timings for weekdays and weekends
- **Date Preview** — Browse any date's menu and bus schedule
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
| Deployment | GitHub Pages via gh-pages |

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

## Available Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start local development server |
| `npm run build` | Build for production (outputs to `dist/`) |
| `npm run preview` | Preview the production build locally |
| `npm run lint` | Run ESLint |
| `npm run deploy` | Build and deploy to GitHub Pages |

---

## Project Structure

```
mess_bus_details/
├── public/              # Static assets (favicon, images, robots.txt)
├── server/              # Express + Postgres API (see server/README.md)
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
fall back to the data bundled in `src/data`. That keeps the app working when the
API is asleep, unreachable, or simply not configured — so the current GitHub
Pages deployment keeps working unchanged until you point `VITE_API_URL` at a
deployed backend.

---

## Deployment

**[DEPLOYMENT.md](DEPLOYMENT.md)** has the full walkthrough: API on Render,
database on Supabase, frontend on Vercel, plus the environment variables each
one needs.

The app currently deploys to GitHub Pages:

```bash
npm run deploy
```

This runs the production build and pushes the output to the `gh-pages` branch automatically.

The base path is configurable, so the same source deploys to either host —
GitHub Pages uses the default `/mess_bus_details/`, while Vercel sets
`VITE_BASE_PATH=/` to serve from the domain root.

---

## Contributing

Pull requests are welcome. For significant changes, open an issue first to discuss what you'd like to change.
