# Deployment Guide

How to put the Campus Hub online: the API on **Render**, the database on
**Supabase**, and the frontend on **Vercel** (migrating off GitHub Pages).

```
┌─────────────┐      HTTPS + CORS       ┌──────────────┐      Postgres      ┌──────────────┐
│   Vercel    │ ──────────────────────► │    Render    │ ─────────────────► │   Supabase   │
│  (frontend) │   VITE_API_URL          │    (API)     │   DATABASE_URL     │  (Postgres)  │
└─────────────┘                         └──────────────┘                    └──────────────┘
```

You were right that GitHub Pages only serves static files — it cannot run the
API. But that does **not** force the frontend to move: a static host plus a
separate API host is the normal split. Moving to Vercel is optional, and the
reasons to do it are build-time environment variables, automatic deploys, and
losing the `/mess_bus_details/` path prefix and the `404.html` redirect hack.

> **Order matters.** Deploy the backend first so you have its URL, then the
> frontend, then come back and add the frontend's URL to the backend's
> `CORS_ORIGIN`. Part 3 covers that last step — don't skip it.

---

## Before you start: rotate the leaked credentials

The database password and service role key were shared in plaintext during
development. Rotate both before going public, then use the new values
everywhere below.

1. Supabase → **Settings → Database → Reset database password**.
2. Supabase → **Settings → API keys** → roll the `service_role` key.
3. Update `server/.env` locally with the new values.

Also confirm nothing secret is committed:

```bash
git check-ignore .env server/.env   # both paths must be listed
git log --all --full-history -- .env server/.env   # must print nothing
```

---

# Part 1 — Deploy the API to Render

### Step 1. Commit and push

Render deploys from GitHub, so `server/` has to be in the repository.

```bash
git add .
git commit -m "Add Express + Postgres backend"
git push origin main
```

`.env` and `server/.env` are gitignored — every secret is entered in the Render
dashboard instead.

### Step 2. Create the Web Service

1. Go to [dashboard.render.com](https://dashboard.render.com) → **New +** →
   **Web Service**.
2. Connect your GitHub account and pick the `mess_bus_details` repository.

### Step 3. Configure the service

| Setting | Value |
|---|---|
| **Name** | `campus-hub-api` (becomes `campus-hub-api.onrender.com`) |
| **Region** | Singapore — same region as your Supabase project (`ap-southeast-1`) |
| **Branch** | `main` |
| **Root Directory** | `server` ← **easy to miss, and it fails without it** |
| **Runtime** | Node |
| **Build Command** | `npm install` |
| **Start Command** | `npm start` |
| **Instance Type** | Free |

Under **Advanced**, set **Health Check Path** to `/api/health`. Render then
restarts the instance if the database connection dies.

### Step 4. Environment variables

Add these under **Environment**. Copy the values from your local
`server/.env`, using the rotated credentials.

| Variable | Value | Why |
|---|---|---|
| `DATABASE_URL` | `postgresql://postgres.lpfykagfworqjevwnjzj:<PASSWORD>@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres` | Runtime queries. Port **6543** is the transaction pooler. |
| `DIRECT_URL` | same but port **5432** | Migrations and seeds, which need a real session. |
| `SUPABASE_URL` | `https://lpfykagfworqjevwnjzj.supabase.co` | Reserved for server-side Supabase Auth later. |
| `SUPABASE_SERVICE_ROLE_KEY` | your rotated service role key | Server-only. Never expose to the browser. |
| `NODE_ENV` | `production` | Hides internal error messages from API responses. |
| `CORS_ORIGIN` | `https://rizzwan285.github.io` | Start with the current site; you'll add the Vercel URL in Part 3. |
| `ADMIN_API_KEY` | a long random string | Fallback for the write endpoints from scripts/curl. |
| `SESSION_SECRET` | a long random string (32+ chars) | Signs session tokens. **Changing it signs everyone out.** |
| `SESSION_DAYS` | `30` | How long a session survives without being used. |
| `ADMIN_ROLL_NUMBER` | `142301026` | Roll number granted developer rights. |

**Do not set `PORT`.** Render injects it, and the server already reads it.

Generate a fresh admin key with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Two notes on `DATABASE_URL`:

- **URL-encode special characters in the password.** `!` becomes `%21`, `@`
  becomes `%40`, `#` becomes `%23`. An unencoded `@` splits the URL in the wrong
  place and produces a confusing "getaddrinfo ENOTFOUND" error.
- **Use the pooler hostname, not `db.<ref>.supabase.co`.** Supabase's direct
  connection is IPv6-only; the pooler answers on IPv4, which is what Render
  gives you.

### Step 5. Deploy and verify

Click **Create Web Service**. The first build takes 2–4 minutes. When it goes
live:

```bash
curl https://campus-hub-api.onrender.com/api/health
# {"status":"ok","database":true,"uptime":12}
```

`"database": true` is the part that matters — it means the pooler connection
works. Then spot-check real data:

```bash
curl -s https://campus-hub-api.onrender.com/api/canteen | head -c 200
curl -s https://campus-hub-api.onrender.com/api/timetable/UG/CSE | head -c 200
```

### Step 6. Migrations (already done — for reference)

The schema is already migrated and seeded, because that ran against Supabase
from your machine. You do **not** need to repeat it. When you change the schema
later, run from your laptop rather than on Render:

```bash
cd server
npm run migrate     # applies any new db/migrations/*.sql
npm run seed        # reloads content from src/data (leaves profiles alone)
npm run verify      # 1263 checks: API output vs. the bundled static data
```

`npm run migrate` is safe to re-run; it records applied files in a
`schema_migrations` table and skips them next time.

### Step 7. Set the developer password

Accounts are created on first sign-in, but the developer account needs a
password before it can be used:

```bash
cd server
npm run set-admin -- --password 'your-password'
```

Run it against the same database the deployment uses. The password is stored
only as a scrypt hash. Re-run it any time to change the password.

### About the free tier

Free Render instances sleep after ~15 minutes of inactivity, and the next
request takes 30–60 seconds to wake them. The frontend handles this: every card
falls back to the data bundled in `src/data`, so a cold start shows correct
content rather than a spinner or an error. Data refreshes once the API responds.

---

# Part 2 — Migrate the frontend to Vercel

### Step 1. The code changes are already done

Two things had to change, and both are already in the repo in a way that
**doesn't break your current GitHub Pages site**:

- [`vite.config.ts`](vite.config.ts) now reads `base` from `VITE_BASE_PATH`,
  defaulting to `/mess_bus_details/`. Vercel sets it to `/`.
- [`src/App.tsx`](src/App.tsx) derives the router's `basename` from
  `import.meta.env.BASE_URL`, so it follows whatever the build used.
- [`vercel.json`](vercel.json) rewrites all routes to `index.html`, which is
  what makes `/timetable` work on a hard refresh.

Because the default is unchanged, `npm run deploy` still publishes a working
GitHub Pages build until you decide to switch off.

### Step 2. Import the project

1. Go to [vercel.com/new](https://vercel.com/new) and import the
   `mess_bus_details` repository.
2. Vercel detects **Vite** automatically. Leave Root Directory as `./` — the
   frontend lives at the repo root; only the API lives in `server/`.
3. Build Command `npm run build` and Output Directory `dist` are already correct
   (and pinned in `vercel.json`).

### Step 3. Environment variables

Add these in **Settings → Environment Variables**, for all environments
(Production, Preview, Development):

| Variable | Value | Why |
|---|---|---|
| `VITE_API_URL` | `https://campus-hub-api.onrender.com` | Your Render URL. **No trailing slash.** |
| `VITE_BASE_PATH` | `/` | Serve from the domain root instead of `/mess_bus_details/`. |
| `VITE_SUPABASE_URL` | `https://lpfykagfworqjevwnjzj.supabase.co` | Only needed once you add Supabase Auth. |
| `VITE_SUPABASE_ANON_KEY` | your anon key | Same — safe to expose, it's the public key. |

**Never add `SUPABASE_SERVICE_ROLE_KEY` or the database password here.** Anything
prefixed `VITE_` is compiled into the JavaScript bundle every visitor downloads.
The anon key is designed to be public; the other two are not.

> **`VITE_*` variables are baked in at build time, not read at runtime.**
> Changing one has no effect until you redeploy. If you update `VITE_API_URL`,
> trigger a new deployment.

### Step 4. Deploy and verify

Click **Deploy**. Once it finishes, open the URL and check:

- The dashboard renders the mess menu and bus times.
- Navigate to `/timetable`, then **hard-refresh** — it should still load, not
  404. That confirms the SPA rewrite works.
- Open DevTools → Network and confirm calls to `campus-hub-api.onrender.com`
  return 200. If you see CORS errors, that's expected until Part 3.

---

# Part 3 — Connect the two (required)

Your Vercel URL isn't in the API's allowlist yet, so the browser is blocking the
calls and the app is quietly serving bundled fallback data.

1. Render → your service → **Environment** → edit `CORS_ORIGIN`:

   ```
   https://mess-bus-details.vercel.app,https://*.vercel.app,https://rizzwan285.github.io
   ```

   Replace the first entry with your real Vercel domain. Comma-separated, no
   spaces, no trailing slashes.

2. Save. Render redeploys automatically (~1 minute).

3. Reload the frontend and confirm in DevTools that the API calls now return 200
   with an `access-control-allow-origin` header.

**Why the `*.vercel.app` entry:** every preview deployment (one per branch and
pull request) gets its own hostname, which would otherwise be blocked. The
wildcard matches exactly one subdomain label, so `https://*.vercel.app` allows
`campus-git-mybranch.vercel.app` but rejects
`evil.vercel.app.attacker.com`. Drop this entry if you don't want previews
talking to the live API — they'll fall back to bundled data, which still works.

Once you're happy, remove the GitHub Pages origin from the list.

---

# Part 4 — Retire GitHub Pages

Only after Vercel is confirmed working.

1. Remove the deploy tooling:

   ```bash
   npm uninstall gh-pages
   ```

   Then delete the `predeploy` and `deploy` scripts from `package.json`.

2. Delete the old branch and turn the feature off:

   ```bash
   git push origin --delete gh-pages
   ```

   GitHub → **Settings → Pages** → set Source to **None**.

3. `public/404.html` is only used by GitHub Pages. It's harmless on Vercel
   (`vercel.json` handles routing), so you can leave it or delete it.

4. Update the live-site link at the top of [`README.md`](README.md).

Consider leaving a small `index.html` on `gh-pages` that redirects to the Vercel
URL for a few weeks, since people may have bookmarked the old address.

---

# Environment variable reference

### Render (API) — secrets live here

| Variable | Required | Notes |
|---|---|---|
| `DATABASE_URL` | yes | Pooler, port 6543. Password URL-encoded. |
| `DIRECT_URL` | no | Pooler, port 5432. Only used by migrate/seed. |
| `SUPABASE_URL` | no | For future server-side auth calls. |
| `SUPABASE_SERVICE_ROLE_KEY` | no | Server-only. Bypasses row level security. |
| `NODE_ENV` | yes | `production`. |
| `CORS_ORIGIN` | yes | Comma-separated origins; `*` allowed as a subdomain wildcard. |
| `ADMIN_API_KEY` | no | Fallback admin auth for scripts. Admin UI uses the session instead. |
| `SESSION_SECRET` | yes | 32+ chars. Rotating it invalidates every session. |
| `SESSION_DAYS` | no | Defaults to 30. |
| `ADMIN_ROLL_NUMBER` | no | Defaults to 142301026. |
| `PORT` | no | **Render sets this. Don't add it.** |

### Vercel (frontend) — public values only

| Variable | Required | Notes |
|---|---|---|
| `VITE_API_URL` | yes | No trailing slash. Omit it and the app runs entirely on bundled data. |
| `VITE_BASE_PATH` | yes | `/` for Vercel. |
| `VITE_SUPABASE_URL` | no | Needed only for Supabase Auth. |
| `VITE_SUPABASE_ANON_KEY` | no | Public by design. |

---

# Troubleshooting

**`"database": false` on `/api/health`**
The API is up but can't reach Postgres. Check `DATABASE_URL` uses the pooler
host (not `db.<ref>.supabase.co`, which is IPv6-only) and that the password is
URL-encoded. Re-check it after rotating the password.

**CORS errors in the browser console**
The exact origin, including `https://`, must be in `CORS_ORIGIN`. No trailing
slash. Redeploy Render after editing. The app keeps working meanwhile — it falls
back to bundled data, which is why the page still looks right.

**`/timetable` 404s on refresh, but works when clicked**
The SPA rewrite isn't applied. Confirm `vercel.json` is committed at the repo
root.

**Assets 404 with a doubled path like `/mess_bus_details/assets/...` on Vercel**
`VITE_BASE_PATH` isn't set to `/`, or you set it and didn't redeploy.

**Frontend shows stale data**
Responses are cached for 5 minutes by TanStack Query, and `VITE_*` values are
baked in at build time. Hard-refresh, and redeploy after changing any `VITE_*`.

**Admin endpoints return 503**
`ADMIN_API_KEY` isn't set on Render. 401 instead means the key is set but the
`X-Admin-Key` header didn't match.

**First request after idle takes ~40 seconds**
Expected on Render's free tier. The fallback covers it. A paid instance or an
external uptime pinger removes the delay.

---

# Updating content once deployed

The point of the backend is that the mess menu no longer needs a code change and
a redeploy:

```bash
curl -X PUT https://campus-hub-api.onrender.com/api/admin/mess/kedaram/week13/Monday/Dinner \
  -H "X-Admin-Key: $ADMIN_API_KEY" \
  -H 'Content-Type: application/json' \
  -d '{"items":["Cabbage Thoran","Steam Rice","Dal Methi"],"veg":"Paneer Butter Masala"}'
```

Changes appear within 5 minutes (the query cache window), or immediately on
refresh. The full endpoint list is in [`server/README.md`](server/README.md).

Note that `src/data/*.ts` still exists as the offline fallback. It is not
updated by admin edits, so it slowly goes stale — that's fine for a fallback,
but re-running `npm run seed` would overwrite database edits with the file
contents. Only seed when intentionally resetting to the files.
