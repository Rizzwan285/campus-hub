# IIT Palakkad Campus Hub - Project Context

This document provides a comprehensive overview of the "Campus Hub" project (repository name: `mess_bus_details`), intended to give context to AI assistants (like ChatGPT or Claude) regarding the architecture, tech stack, and current state of the application.

## 1. Project Overview
**Purpose:** A one-stop web application for IIT Palakkad students to easily check rotating mess menus, bus schedules, campus timings, and academic timetables.
**Core Features:**
- **Mess Menu:** 4-week rotating menu with daily breakfast, lunch, snacks, and dinner.
- **Bus Schedule:** Timetables for campus, town, and Wise Park routes, separated by day-type (weekday, Friday, Saturday, Sunday).
- **Academic Timetable:** Course selection and personalized schedule generation based on branches and batches.
- **Canteen & Important Links:** Operating hours and campus resources.

## 2. Architecture & Evolution
The project originally started as a **Static Single Page Application (SPA)** where all data was hardcoded into TypeScript/JSON files and bundled at build time, hosted on GitHub Pages (now retired). 

It has recently undergone a **Full-Stack Migration**:
- The data has been moved into a PostgreSQL database.
- A Node.js/Express REST API was built to serve this data and allow authenticated updates (e.g., changing the mess menu without a git commit).
- The frontend was updated to try fetching from the API first, while keeping the original static files as a **fallback** (so the app works perfectly offline or when the free-tier backend is cold-starting).

## 3. Tech Stack
### Frontend
- **Framework:** React 18 + TypeScript
- **Build Tool:** Vite
- **Styling:** Tailwind CSS
- **UI Components:** shadcn/ui (Radix UI)
- **Routing:** React Router v6
- **State Management:** Zustand (`useUserStore`, `useTimetableStore` using `localStorage`)
- **Data Fetching:** TanStack Query (`useQuery`), with custom fallback loaders (`useApiData`, `TimetableLoader`).
- **Date Handling:** `date-fns` + `date-fns-tz`

### Backend (`/server` directory)
- **Runtime:** Node.js (v20+) + `tsx`
- **Framework:** Express 5 + TypeScript
- **Database:** PostgreSQL (hosted on Supabase)
- **DB Driver:** `pg` (Plain SQL, **No ORM**)
- **Validation:** Zod
- **Security:** `helmet`, `cors`, Row-Level Security (RLS) enabled in DB.

## 4. Database & Schema Details
The database consists of a 16-table schema. Key design decisions include:
- **Course Primary Keys:** Since course codes repeat across branches (e.g., 56 shared codes), the primary key in `course_offerings` is `${program}_${branch}_${courseCode}`. However, the API exposes the `id` as the bare course code to maintain backward compatibility with `localStorage`.
- **Venue Overrides:** Batch-to-room assignment logic (which used to be hardcoded `if`-statements in the frontend) is now stored in a `venue_overrides` table.
- **Bus Times:** Stored as strings in schedule order, since the frontend infers AM/PM from their position in the list. A `depart_minutes` column is used for server-side queries.

## 5. API Endpoints
The backend runs on port 4000 locally.
### Public Read Endpoints (GET)
- `/api/health`
- `/api/mess`, `/api/bus`, `/api/bus/:dayType`, `/api/bus/:dayType/upcoming`
- `/api/canteen`, `/api/academic-days`, `/api/holidays`
- `/api/timetable/branches`, `/api/timetable/metadata`, `/api/timetable/courses`, `/api/timetable/:program/:branch`, `/api/timetable/venue-overrides`

### Authentication Endpoints
- `POST /api/auth/login` — roll number, plus a password for admin accounts
- `GET /api/auth/check/:rollNumber` — does this account need a password?
- `GET /api/auth/me` — current profile; validates a stored session
- `PATCH /api/auth/profile` — onboarding and later edits (including mess changes)
- `PUT /api/auth/courses` — syncs selected courses across devices

### Protected Admin Write Endpoints (PUT / PATCH / DELETE)
Require an admin session (`Authorization: Bearer …`) or the `X-Admin-Key` header.
- `/api/admin/mess/:messSlug/:weekCycle/:day/:meal`
- `/api/admin/mess-timings/:dayType/:meal`
- `/api/admin/canteen/items/:id`
- `/api/admin/academic-days/:date`
- `/api/admin/courses/:offeringId/schedule` — edit a course's slot
- `/api/admin/slots/preview` — expand a slot expression before saving
- `/api/admin/customizations`, `/api/admin/audit`, `/api/admin/cache/clear`

## 6. Current State & Next Steps
- **Backend:** Fully built; database migrated and seeded. Deploys to Render (root directory `server`).
- **Frontend:** Fetches from the API via `VITE_API_URL`, with the bundled `src/data` as a fallback whenever the API is unreachable. **Hosted on Vercel** — GitHub Pages has been retired (`gh-pages` removed, `public/404.html` deleted, base path set to `/`).
- **Admin UI:** Built, at `/admin`. Tabs for course slots (with a live preview of the resulting classes), mess menu, mess timings, a list of current overrides, and an audit log. Changes go live immediately — no redeploy.
- **Authentication:** Implemented. Students sign in with their **roll number only, no password**; the developer account (`142301026`) requires one. Sessions are stateless HMAC tokens with a sliding 30-day expiry. Profiles and course selections now sync server-side rather than living only in `localStorage`.
- **Seeding:** `npm run seed` refreshes content from `src/data` **without discarding admin edits** (each row records whether its value came from the files or an admin). `npm run seed:reset` is the explicit escape hatch.

### Known open items
- Google OAuth (restricted to `iitpkd.ac.in`) would remove the "anyone who knows a roll number can sign in as you" trade-off.
- Bus timings have no admin editor yet.
- 15 courses have free-text slot remarks (e.g. `alt weeks half batch`) that still need to be encoded by hand.
- The database password and service role key were shared in plaintext during development and should be rotated.
