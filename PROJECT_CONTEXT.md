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
The project originally started as a **Static Single Page Application (SPA)** where all data was hardcoded into TypeScript/JSON files and bundled at build time, hosted on GitHub Pages. 

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

### Protected Admin Write Endpoints (PUT / PATCH / DELETE)
Protected by a shared secret sent via the `X-Admin-Key` header.
- `/api/admin/mess/:messSlug/:weekCycle/:day/:meal`
- `/api/admin/mess-timings/:dayType/:meal`
- `/api/admin/canteen/items/:id`
- `/api/admin/academic-days/:date`

## 6. Current State & Next Steps
- **Backend:** Fully built, database is migrated and seeded. It is ready to be deployed to Render (or similar hosting).
- **Frontend:** Code is updated to fetch from the API using `VITE_API_URL`. It is still currently hosted on GitHub Pages but is functioning correctly thanks to the static data fallback.
- **Admin UI:** The API has write endpoints, but the visual frontend forms for admins to edit the database (e.g., an Admin Dashboard) have **not** been built yet.
- **Authentication:** OAuth for users has not been fully implemented yet; user profiles currently remain in `localStorage`.
