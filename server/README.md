# Campus Hub API

REST API backing the IIT Palakkad Campus Hub. Express 5 + TypeScript on
Postgres (Supabase), using plain SQL migrations and a small repository layer
rather than an ORM.

## Setup

```bash
cd server
npm install
cp .env.example .env     # fill in DATABASE_URL and the rest
npm run migrate          # create the schema
npm run seed             # load src/data into Postgres
npm run dev              # http://localhost:4000
```

`npm run verify` compares every API response against the static data in
`src/data` and exits non-zero on any difference — run it after a reseed.

## Environment

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Transaction pooler (port 6543). Used at runtime. |
| `DIRECT_URL` | Session pooler (port 5432). Used by migrations and seeds, which need session-level DDL. |
| `CORS_ORIGIN` | Comma-separated list of allowed browser origins. |
| `ADMIN_API_KEY` | Shared secret for the write endpoints, sent as `X-Admin-Key`. |
| `SUPABASE_SERVICE_ROLE_KEY` | Not used yet; reserved for server-side Supabase Auth calls. |

Supabase's direct connection (`db.<ref>.supabase.co`) is IPv6-only. Both URLs
above use the IPv4 pooler so the API works from hosts without IPv6.

## Endpoints

Read (public):

| Method | Path | Returns |
|---|---|---|
| GET | `/api/health` | Liveness plus a database ping |
| GET | `/api/mess` | Both messes, their menus, daily extras and meal timings |
| GET | `/api/bus` | All four day-type schedules |
| GET | `/api/bus/:dayType` | One schedule (`weekday`, `friday`, `saturday_holiday`, `sunday`) |
| GET | `/api/bus/:dayType/upcoming` | Next departures; `?direction=`, `?after=HH:MM`, `?limit=` |
| GET | `/api/canteen` | Canteen sections with their items |
| GET | `/api/academic-days` | Holidays and instructional days |
| GET | `/api/holidays` | Holidays in the timetable engine's shape |
| GET | `/api/timetable/branches` | Branches grouped by program |
| GET | `/api/timetable/metadata` | Semester and generator metadata |
| GET | `/api/timetable/courses` | Every course offering |
| GET | `/api/timetable/:program/:branch` | Courses for one branch |
| GET | `/api/timetable/venue-overrides` | Batch-to-room rules |

Write (require `X-Admin-Key`):

| Method | Path |
|---|---|
| PUT | `/api/admin/mess/:messSlug/:weekCycle/:day/:meal` |
| PUT | `/api/admin/mess-timings/:dayType/:meal` |
| PATCH | `/api/admin/canteen/items/:id` |
| PUT | `/api/admin/academic-days/:date` |
| DELETE | `/api/admin/academic-days/:date` |

```bash
curl -X PUT localhost:4000/api/admin/mess/kedaram/week13/Monday/Dinner \
  -H "X-Admin-Key: $ADMIN_API_KEY" \
  -H 'Content-Type: application/json' \
  -d '{"items":["Cabbage Thoran","Steam Rice"],"veg":"Paneer Butter Masala"}'
```

## Notes on the schema

- **Course keys.** 56 course codes repeat across branches, so `course_offerings.id`
  is `${program}_${branch}_${courseCode}`. The API still exposes `id` as the bare
  course code for backward compatibility with ids already in users' localStorage,
  and adds `offeringId` alongside it.
- **`category` is free text.** The source workbooks use `core`, `electives`,
  `institute core`, `gce/oe` and other one-off spellings; a CHECK constraint
  would reject real data.
- **Bus times stay strings.** The client infers AM/PM from a departure's position
  in the list, so both the text and the ordering are load-bearing. A
  `depart_minutes` column carries the resolved value for server-side queries.
- **Venue overrides** replace the batch-number `if` chain that used to live in
  `useTimetableStore`. A rule naming a meeting type wins over one that applies to
  any type, matching the original early return for labs.
- **RLS** is enabled everywhere. Content tables allow public reads; `profiles`
  and `user_courses` have no anon policy, so the browser's anon key cannot reach
  them via PostgREST. The API connects as `postgres` and bypasses RLS.

## Deploying to Render

Root directory `server`, build `npm install`, start `npm start`, health check
`/api/health`. Set every variable from `.env.example` (Render provides `PORT`
itself), and add the deployed frontend origin to `CORS_ORIGIN`. Free instances
sleep when idle; the frontend falls back to its bundled data during a cold
start, so the app stays usable.

`CORS_ORIGIN` entries accept `*` as a single-label subdomain wildcard, e.g.
`https://*.vercel.app` to cover preview deployments.

Step-by-step instructions, including the Vercel migration, are in
[../DEPLOYMENT.md](../DEPLOYMENT.md).
