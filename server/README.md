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
| GET | `/api/special-services` | Temporary bus services (exam shuttles), each with its date window and AM/PM departures |
| GET | `/api/contacts` | The Campus page's Contacts directory: categories in order, each with its contacts (name, phone numbers, optional location, link and note). Empty categories are left out; `[]` means everything was removed. Fails (rather than answering `[]`) before migration 014 |
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
| GET | `/api/admin/special-services` — the uncached list the editor reads |
| POST | `/api/admin/special-services` — `title`, `startDate`, `endDate`, optional `note`, `skipSundays`, `skipDates`, `nilaToSahyadri`, `sahyadriToNila` |
| PUT | `/api/admin/special-services/:id` — same body, replaces the service |
| DELETE | `/api/admin/special-services/:id` |
| GET | `/api/admin/contacts` — the uncached list the editor reads, with empty categories |
| POST | `/api/admin/contacts` — `categoryId`, `name`, `phones` (1–5), optional `location`, `link` (https only), `note` |
| PUT | `/api/admin/contacts/:id` — same body, replaces the contact (a new `categoryId` moves it) |
| DELETE | `/api/admin/contacts/:id` |
| POST | `/api/admin/contacts/categories` — `name` |
| PUT | `/api/admin/contacts/categories/:id` — `name` (rename) |
| DELETE | `/api/admin/contacts/categories/:id` — refused with 409 while it has contacts |
| PUT | `/api/admin/contacts/order` — `ids`: every category, in the new order |
| PUT | `/api/admin/contacts/categories/:id/order` — `ids`: every contact in it, in the new order |
| PATCH | `/api/admin/canteen/items/:id` |
| PUT | `/api/admin/academic-days/:date` |
| DELETE | `/api/admin/academic-days/:date` |
| GET | `/api/admin/course-changes?status=pending\|decided` |
| GET | `/api/admin/course-changes/count` |
| POST | `/api/admin/course-changes/:id/approve` — optional `note`, and `meetings` to correct the suggestion first |
| POST | `/api/admin/course-changes/:id/reject` — optional `note` |
| GET | `/api/admin/emails` — email setup (variable names only, never values) and recent deliveries |
| POST | `/api/admin/emails/retry` — optional `id`; re-queues undelivered emails and sends now |
| POST | `/api/admin/emails/test` — queues a test email and sends it through the configured provider; answers with the outcome in words |

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
- **Contacts** (migration 014). `contact_categories` and `contacts` are
  seed-managed like the canteen: `bundle_key` names a row that ships in
  `src/data/contactsData.ts`, and the seed refreshes only rows still marked
  `source = 'seed'`, never moving an existing row. Deleting a bundled row in
  /admin sets `removed_at` so a reseed cannot bring it back; `seed:reset`
  restores the bundled list. Phone numbers are stored as typed and must dial
  by the rules in `src/lib/contactPhone.ts`, which the app also uses to build
  `tel:` links (`+91` added to ten-digit numbers).
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

## Contacts directory

Migration **014** creates the Contacts tables and loads the supplied auto
driver, medical and restaurant numbers, so `npm run migrate` alone is enough;
no seed is needed. Deploy the API with `src/lib/contactPhone.ts` beside the
other shared modules (the root `server/Dockerfile` copies it). Until 014 is
applied, `/api/contacts` fails and the app shows its bundled copy. Edit the
list from **/admin → Contacts**.

## 2027 holidays

Migration **015** adds the 16 dates (17 holidays) of the institute's 2027
list as admin-owned `academic_days` rows, so `npm run migrate` alone is
enough and a reseed keeps them. 2026 rows are not touched. `academic_days` has
one row per date, so 15 August 2027 is one row naming both Independence Day
and Id-E-Milad. Until 015 runs, the API serves only the 2026 holidays and the
app follows the API, so 2027 dates do not get holiday bus, mess or class
handling yet. The bundled fallback (`src/data/timetable/holidays.json`) holds
the same rows.

## Semester management and timetable notifications

The `semester-management` branch adds migrations **012** (semester catalogues,
publication history and isolated student data) and **013** (approval modes,
notifications and email outbox). Existing offerings, selections, personal edits
and request history are adopted into the existing semester; do not reset/seed
production to enable this feature.

Admin workflow: **Semesters → Create → Upload XLSX/DOCX → Import → Review courses
→ Confirm slot table → Publish → Make current**. Publishing makes the catalogue
available for upcoming-semester browsing; activation changes the student
semester. Fix blocking errors before publishing. Manual corrections survive
unchanged imports. Versions support rollback, and old semesters/student data
remain stored. Ordinary course corrections also update the draft so publishing
it again preserves them.

The Requests tab offers optional approval, compulsory approval and rejection.
Optional acceptance affects the student's own timetable. Compulsory approval
updates the official timetable. Existing enrollees get one grouped alert; later
enrollees get inbox entries. Notification read/response state is persisted.

### Rollout

1. Back up the target database using your existing backup process and verify the
   intended connection before running migrations. Check the current migration
   ledger; the new files are applied by `npm run migrate` from `server/`.
   **Do not use `seed:reset`**. No seed is required to adopt existing data.
2. Deploy the API with root `src/engine`, `src/lib/academicProfile.ts`,
   `src/lib/contactPhone.ts`, and
   `scripts/pipeline` available alongside `server/`. The repository-root build
   using `server/Dockerfile` includes these assets and Python. A native Node
   deployment must retain the same relative paths and have Python 3 available.
3. Configure mail below, then deploy the frontend with the intended
   `VITE_API_URL`. Check CORS and actual network responses; fallback can mask a
   misconfigured connection. The web app saves the latest published snapshot
   for offline use without requiring a rebuild per semester.
4. Verify `/api/health`, the active `/api/timetable/snapshot`, and the Semesters
   screen. Review a test request using an appropriate test account and confirm
   provider delivery/outbox status. Never approve a fabricated schedule into
   a real course as a deployment check.

Required existing API variables: `DATABASE_URL`, `SESSION_SECRET`; use
`DIRECT_URL` for migrations where required by your pooler. Preserve configured
`CORS_ORIGIN`, `ADMIN_ROLL_NUMBER` and hosting-assigned port.

Additional variables:

| Variable | Purpose |
|---|---|
| `PYTHON_BIN` | Python interpreter; defaults to `python3`, standard library only |
| `EMAIL_PROVIDER` | `none` (default), `log` (local testing), `apps_script`, `resend`, or `brevo` |
| `ADMIN_NOTIFY_EMAIL` | Whether request emails are queued at all; without it, no email is queued. With `apps_script`, set it to the script's `ADMIN_EMAIL` |
| `APP_URL` | The website (frontend) URL, for the authenticated `/admin?request=<id>` button. A trailing slash is removed |
| `APPS_SCRIPT_URL` | `apps_script` only: the web app's deployment URL ending in `/exec` (https required) |
| `APPS_SCRIPT_SECRET` | `apps_script` only: equals the script's `SHARED_SECRET` property. Secret: never logged, shown or committed |
| `EMAIL_API_KEY` | `resend`/`brevo` credential; API-only secret |
| `EMAIL_FROM` | `resend`/`brevo` provider-verified sender |

Email requests and outbox entries are saved transactionally. Delivery retries
run in the API process (every five minutes, growing back-off, eight attempts);
the admin Requests panel shows status, the last failure reason, **Retry
delivery** and **Send test email**, which queues a test message and sends it
through the same outbox and provider. `log` does not deliver externally.
Configuring a recipient later does not retroactively queue requests submitted
without one. Email links never approve anything on GET: they open `/admin`,
which asks for the developer sign-in when needed and keeps the request link.

### Email content

Every provider sends what `src/services/emailTemplate.ts` renders: subject,
plain text, HTML, the student and request details (current and proposed
timings with the changes marked) and the admin button. Student input is
HTML-escaped. Preview it without sending anything:

```bash
npm --prefix server run email:preview          # writes server/email-preview/*.html and *.txt
APP_URL=https://example.org/ npm --prefix server run email:preview
```

### Apps Script provider

`apps_script` posts JSON `{token, subject, text, html}` to `APPS_SCRIPT_URL`
and reads the script's `{success, message}` reply. Points that matter:

- **The script picks the recipient** (its `ADMIN_EMAIL` property); the API's
  `ADMIN_NOTIFY_EMAIL` only switches emails on and is recorded in the outbox.
  Keep the two the same.
- Success is decided from the reply body: Apps Script answers HTTP 200 even when
  it failed. A web page (sign-in or error) instead of the JSON reply is a failure.
- `/exec` answers a 302 to a one-time Google URL holding the reply. The API
  follows it with a GET without a body, so the secret is sent once.
- 30-second timeout. Wrong secret, the Gmail quota (about 100 recipients a day),
  a missing script property, timeouts and network errors are recorded as plain
  reasons and retried with the normal back-off. Eight attempts take about
  12 hours; a quota failure may need **Retry delivery** after Google's reset.
- **No idempotency key.** The script has no way to recognise a repeat, so if a
  reply is lost after the script already sent (a timeout), the retry sends a
  second copy.
- The secret travels in the request body (Apps Script cannot read headers).
  Request bodies are never logged, and error messages are scrubbed of it.

No real provider delivery was verified during local testing; the tests mock
all HTTP.

If hosted Python is unavailable, run
`python3 scripts/pipeline/import_semester.py --dir <files-directory> --semester
"Jan-May 2027" --out <output.json>` locally and upload the parsed JSON in the
admin workspace. Only use institute files actually released for that semester.

### Validation and compatibility

Run `npm test` from `server/` for the isolated PGlite API suite, including the
legacy 001–011 migration upgrade and deployment-before-migration cases
(including the Contacts list before migration 014).
Run root `npm test`, both TypeScript configs, and `npm run build` for the client.
Importer tests: `python3 -m unittest discover -s scripts/pipeline/tests -v`.
The suites do not contact production or send real provider email.

The new client tags personal timing writes with `semesterId`; stale writes get
409. Older clients omitting it retain compatibility. Notification caches are
account-specific, and semester switches refresh account selections before sync.
After deployment, test an existing saved account, offline reopening, first-year
batch filtering and a second account on the same browser. PGlite does not
substitute for real node-pg/provider/host-runtime verification.
