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
`src/data` and exits non-zero on any difference.

### Seeding and admin edits

`npm run seed` refreshes content from `src/data` **without discarding anything
edited through the admin panel**. Each editable row records whether its current
value came from the files (`source = 'seed'`) or from an admin (`source =
'admin'`); seeding rewrites the former and skips the latter, then reports what
it preserved.

```
mess_menu_entries       83   (1 kept from admin edits)
Seed complete. 6 admin-edited value(s) preserved.
```

`npm run seed:reset` discards admin edits and makes the database match the files
exactly. That is the only thing that undoes an admin change, so run
`npm run verify` after it rather than before.

The **Edits** tab in the admin panel lists everything currently overriding the
files, and `GET /api/admin/customizations` returns the same list.

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
| GET | `/api/ping` | `{"status":"ok"}` with no database access — the keep-alive target |
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
| GET | `/api/admin/course-changes?status=pending\|decided` |
| GET | `/api/admin/course-changes/count` |
| POST | `/api/admin/course-changes/:id/approve` — optional `note`, and `meetings` to correct the suggestion first |
| POST | `/api/admin/course-changes/:id/reject` — optional `note` |

Signed-in students (session token):

| Method | Path | Does |
|---|---|---|
| PUT | `/api/auth/course-overrides` | Syncs the student's own timings for individual courses |
| GET | `/api/course-changes/mine` | The student's timing suggestions and their outcome |
| POST | `/api/course-changes` | Suggests new timings for a course, for everyone taking it |
| DELETE | `/api/course-changes/:id` | Withdraws a suggestion that is still waiting |

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
- **Timing changes** (migration 009). A student's own timings for a course live
  in `user_course_overrides` and change nobody else's timetable. A suggestion in
  `course_change_requests` changes the course for everyone only once approved,
  and approval rewrites the meetings of *every* offering of that course code in
  one transaction — the client merges offerings by code, so one left behind
  could win the merge with the old timings. Approved courses are marked
  `source = 'admin'`, so a reseed keeps them.

## Deploying to Render

Root directory `server`, build `npm install`, start `npm start`, health check
`/api/health`. Set every variable from `.env.example` (Render provides `PORT`
itself), and add the deployed frontend origin to `CORS_ORIGIN`. Free instances
sleep when idle; the frontend falls back to its bundled data during a cold
start, so the app stays usable.

`CORS_ORIGIN` entries accept `*` as a single-label subdomain wildcard, e.g.
`https://*.vercel.app` to cover preview deployments.

## Keeping the API warm

**What sleeps.** Only this API. Render stops a free web service after 15
minutes without inbound traffic and takes up to a minute to start it again. The
Vercel frontend is static files on a CDN and has nothing to cold-start. Because
sign-in and the session check on page load both need the API, a sleeping API
makes the whole app feel slow, not just the data.

**What is pinged.** `GET /api/ping`, which returns `{"status":"ok"}`. It needs
no authentication, reads no session and never touches the database, so it
generates no Supabase traffic. `/api/health` is a different thing: it queries
Postgres and is what Render's own health check and the Docker health checks
use. Do not point a 5-minute pinger at it.

**How often, and from where.** Every 5 minutes, from
[`.github/workflows/health-check.yml`](../.github/workflows/health-check.yml).
Each run pings 24 times over about two hours and then starts the next run
itself. The `schedule:` trigger in that file is only a safety net — GitHub fired
a `*/10` cron every 2–8 hours on this repo, which is why the runs chain instead
of relying on it. Once per run the workflow also calls `/api/health`, about 12
times a day, so that a free Supabase project is not paused for inactivity
during a break.

**Recommended second pinger.** An external uptime monitor is more punctual than
GitHub and emails you when the API is down. It is configured outside the repo:

1. Create a free account at [UptimeRobot](https://uptimerobot.com) (its free
   plan checks every 5 minutes and is for non-commercial use; cron-job.org
   works equally well).
2. Add a monitor: type **HTTP(s)**, URL
   `https://campus-hub-api-nyw9.onrender.com/api/ping`, interval **5 minutes**,
   timeout 30 seconds or more.
3. Leave the workflow enabled. The two do not conflict, and the workflow still
   provides the daily database check.

**Plan limits.**

- *Render free:* 750 instance hours per workspace per month. One service awake
  all month uses up to 744, so this works for a single free service; a second
  one kept awake would exhaust the allowance and Render would suspend both
  until the next month. A paid instance never sleeps and makes all of this
  unnecessary.
- *Vercel Hobby:* cron jobs run at most once a day, and this project has no
  Vercel functions for a cron to call, so Vercel Cron is not used.
- *GitHub Actions:* free for public repositories. GitHub disables scheduled
  workflows after 60 days without repository activity; re-enable it under
  **Actions → API health check** if that happens.

**Checking that it works.**

```bash
# The endpoint itself: 200 and {"status":"ok"}.
curl -i https://campus-hub-api-nyw9.onrender.com/api/ping

# The chain: runs should follow each other with no gap, the newest in progress.
gh run list --workflow health-check.yml --limit 5

# The real test: after hours of no use this should take well under a second,
# and "uptime" (seconds since the API last started) should be large.
curl -s -w '\n%{time_total}s\n' https://campus-hub-api-nyw9.onrender.com/api/health
```

A small `uptime` means the API restarted recently. That is expected after a
deploy, since Render redeploys on every push to `main`; otherwise it means the
API slept. Render's **Logs** print `Campus Hub API listening` on every start.

To stop the pinger, disable the workflow under **Actions → API health check**
and cancel the run in progress.

Step-by-step instructions, including the Vercel migration, are in
[../DEPLOYMENT.md](../DEPLOYMENT.md).
