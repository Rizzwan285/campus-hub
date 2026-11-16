# Campus Hub: Android application implementation guide

Prepared for Rizwan on **15 November 2026**. Repository reviewed at commit `1f08a3a4` (`Added the additional Bus`). The current interface calls the product **Campus Companion**; this document uses **Campus Hub**, following the naming decision recorded in the Claude memories.

This is an implementation plan based on the application and its memories. Android support has **not** been added by this review. Commands below are instructions for the implementation phase, except the baseline checks explicitly recorded as completed.

Quick navigation: [Recommendation](#1-recommended-approach) · [Review findings](#2-what-was-reviewed-and-verified) · [Android setup](#5-set-up-the-android-project) · [API connectivity](#6-connect-android-to-the-existing-api) · [Storage](#7-fix-persistence-and-session-startup) · [Offline behavior](#8-make-offline-behavior-dependable) · [Android UI](#9-adapt-the-interface-to-android) · [Links and PDFs](#10-handle-links-forms-phone-calls-and-pdfs) · [Accounts and privacy](#11-authentication-deletion-and-privacy) · [File map](#14-suggested-file-by-file-implementation-map) · [Tests](#15-testing-that-proves-android-readiness) · [Distribution](#16-build-sign-and-distribute) · [Effort](#17-delivery-order-effort-and-ongoing-maintenance) · [Checklist](#19-implementation-and-release-checklist).

## 1. Recommended approach

**Add Capacitor to the existing React/Vite application, bundle the built frontend inside an Android application, and continue using the existing Express API and PostgreSQL database.**

Capacitor provides an Android project that runs your web interface in Android WebView and exposes native capabilities through plugins. You can retain the existing screens, Tailwind/shadcn components, timetable engine, data files, and most state management. You do not need to adopt Ionic's UI components or rewrite the application in Kotlin.

The work is more than generating an APK. The important changes are reliable mobile startup, storage and synchronization, Android navigation, safe-area layout, document opening, and release preparation. Capacitor supports adding native targets to an existing web project. [Official installation guide](https://capacitorjs.com/docs/getting-started).

| Approach | What it means for this repository | Assessment |
|---|---|---|
| **Capacitor — recommended** | Package the existing React application and add a small platform integration layer. | Best fit for preserving your substantial existing functionality and offline data. |
| PWA, optionally packaged as a Trusted Web Activity | Add a web manifest, install assets and offline strategy; a TWA displays the hosted website through a supporting browser. | Reasonable if the main goal is an installable website with web-driven updates. Native integration and offline startup need a different design. |
| React Native / Expo | Reuse some TypeScript business logic and the API, but replace DOM components, Radix UI, CSS layouts and browser integrations. | A larger project; choose it if native UI becomes a strong product requirement. |
| Kotlin / Jetpack Compose | Keep the backend; rewrite the client and port the timetable logic. | Greatest Android-specific control and a substantially larger maintenance commitment. |

A TWA also requires website/application ownership verification using Digital Asset Links; it does not automatically give the existing website a complete offline implementation. This repository currently has no PWA manifest or service-worker registration. [Chrome's TWA overview](https://developer.chrome.com/docs/android/trusted-web-activity).

Recommended first release: the existing five student tabs, accounts and timetable sync, reliable cached content, native navigation and document handling. Add reminders, push notifications and widgets after that version is dependable.

## 2. What was reviewed and verified

The review covered:

- All eleven files in `.memories/`: its README and numbered files 01–10.
- The project-specific Claude memory index and all nine linked memories in `~/.claude/projects/-home-rizwan-Documents-Projects-mess-bus-details/memory/`.
- Repository documentation and the frontend/backend package and build configuration.
- Application routes, layout, login, profile/timetable stores, account bridge, API wrapper, data hooks, timetable loader and refresh behavior.
- Timetable rendering and date utilities, external-resource/PDF links, theme bootstrap and assets.
- API authentication, CORS, migrations, account-related schema and relevant analytics models.
- Current official Capacitor, Android and Google Play documentation linked throughout this guide.

The memories are useful historical context, but implementation details below follow the current code where they disagree. For example, `.memories/06-timetable-system.md` describes a complete seven-day grid and page-scrolling mobile agenda. The current `WeeklyGrid.tsx` omits empty mobile days and uses a nested region capped at 600px. Its current-time marker also uses device-local date/time. Do not assume those recorded fixes exist.

### Baseline checks completed during this review

| Check | Result |
|---|---|
| `VITE_API_URL= npm test` | **131 tests passed across 12 files.** Tests emit Zustand warnings because storage is unavailable in their Node environment. |
| `npx tsc --noEmit -p tsconfig.app.json` | Passed. |
| `npx tsc --noEmit -p tsconfig.node.json` | Passed. |
| `npm run typecheck` in `server/` | Passed. |
| Production Vite build with API disabled, output to `/tmp/campus-hub-android-review-dist` | Passed. Main JavaScript chunk is approximately 613 kB minified / 181 kB gzip; Vite reports its large-chunk warning. |

These are web/code checks, not proof of Android compatibility. No APK was built, no emulator or physical-device test was performed, and production database migrations, hosting health, credential rotation and Play Console status were not verified.

The active shell has Node **20.20.2**. Node **22.23.4** is also installed under `~/.nvm/versions/node/`. Neither `java` nor `adb` was found on the active PATH, and the usual `~/Android/Sdk` and `/opt/android-studio` directories were absent. This indicates setup is needed or an existing installation must be located; it does not prove Android Studio is absent everywhere.

## 3. What you can reuse

| Existing part | Android treatment |
|---|---|
| Home, Timetable, Campus, Leave, Gym | Retain the React pages and mobile layout; adapt navigation, insets and keyboard behavior. |
| Mess menus and meal timings | Retain data and API hooks; add durable caching and freshness information. |
| Bus, buggy and temporary exam-shuttle logic | Retain the current resolvers, positional flags and service windows. |
| Timetable engine, course selection, clash detection | Reuse TypeScript logic and tests; verify dates and mobile rendering. |
| Personal timing corrections and approval workflow | Reuse API contracts; strengthen offline replay and account isolation. |
| Zustand stores and account bridge | Retain the architectural separation; change persistence and startup sequencing. |
| Express API and Supabase PostgreSQL | Continue hosting remotely; both web and Android use the same accounts and content. |
| `/admin` | Continue using the web admin for the first Android release. Packaging it is optional. |
| Python import scripts, Airflow, dbt, Docker | Continue as development/server operations. They do not run inside the Android app. |
| `public/docs/` and branding | Reuse source assets; add Android document access, launcher icons and splash resources. |

The intended architecture is:

```text
Android device
+----------------------------------+
| Capacitor Android application    |       Existing hosted services
| - bundled React/Vite frontend    | HTTPS +----------------------+
| - bundled initial schedules/PDFs |------>| Express API          |
| - local cache and saved profile  |       | authentication       |
| - Android platform adapters      |       | content + admin      |
+----------------------------------+       +----+-----------+-----+
                                               ^           |
Existing Vercel web application ----- HTTPS ----+           v
                                               +------------------+
                                               | PostgreSQL       |
                                               | on Supabase      |
                                               +------------------+
```

The phone must call the API. It must never contain a database password, `SESSION_SECRET`, service-role key or `ADMIN_API_KEY`.

## 4. Work required, by release stage

| Stage | Required work | Completion condition |
|---|---|---|
| Installable prototype | Android toolchain, Capacitor configuration, web build, Android project, HTTPS API URL and CORS. | A debug APK installs and its API requests succeed on a device. |
| Dependable campus beta | Storage, offline startup, pending-edit sync, back handling, app resume, safe areas, keyboard, PDFs and external links. | Normal student flows survive restarts, poor connectivity and account switching. |
| Public Play release | Signing, account/data deletion, privacy policy, Data safety, listing, review access, required testing and compatibility checks. | A signed AAB passes release checks and the applicable Play review process. |
| Later enhancements | Optional reminders, push messages, widgets, calendar export and richer native integrations. | Each has its own permissions, reliability and maintenance plan. |

Identity verification is a separate product/security decision. Android packaging does not inherently require changing your student login, but public distribution and destructive account deletion make the present roll-number-only model much harder to justify. Section 11 explains the choices.

## 5. Set up the Android project

### 5.1 Toolchain

Use the current stable Capacitor **8.x** line, with compatible versions of core, Android, CLI and plugins recorded in `package-lock.json`. Capacitor 8 requires Node **22+** and Android Studio **2025.2.1 or newer**. Use Android Studio's bundled JDK and select it as the Gradle JDK; configure the same JDK for command-line/CI builds. [Capacitor environment setup](https://capacitorjs.com/docs/getting-started/environment-setup).

Install Android SDK Platform 36, SDK Platform Tools, the required build tools, and an emulator image through Android Studio. Capacitor 8's documented baseline is `minSdkVersion = 24`, `compileSdkVersion = 36`, `targetSdkVersion = 36`; plugins can impose higher minimums. API 24 is Android 7.0, while target 36 is Android 16. Minimum and target SDK have different purposes. Use the generated Gradle wrapper and compatible template versions. [Capacitor 8 Android requirements](https://capacitorjs.com/docs/updating/8-0).

The current Google Play requirement for a new phone application is **target API 36 or higher**, effective 31 August 2026. Recheck this before submitting a later release. [Google Play target API requirements](https://support.google.com/googleplay/android-developer/answer/11926878?hl=en-EN).

On this machine, an implementation session can start with:

```bash
source "$HOME/.nvm/nvm.sh"
nvm use 22.23.4
node --version
npm --version
```

After installing/configuring the Android tools, check `java -version`, `adb version` and `adb devices`. Test the existing project under Node 22 before standardizing it for development. Pin the chosen Node release in `.nvmrc` and CI. Do not combine the Android work with an unnecessary React/Vite major upgrade.

### 5.2 Choose a permanent application ID

Decide the publisher and application ID before creating the production app. An illustrative ID is `io.github.rizzwan285.campushub`; verify ownership/availability and use your final choice consistently. Do not use an institute-owned namespace unless authorized.

Keep the launcher name **Campus Companion** initially to match the existing UI, unless you intentionally decide to rebrand. The application ID identifies installed data and updates; changing it after distribution creates a different app.

### 5.3 Install and initialize Capacitor

Run from the repository root after choosing the ID:

```bash
npm install @capacitor/core@8 @capacitor/android@8
npm install --save-dev @capacitor/cli@8
npx cap init "Campus Companion" "io.github.rizzwan285.campushub" --web-dir dist
```

Use a root `capacitor.config.ts` like this, replacing the illustrative ID if necessary:

```ts
import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'io.github.rizzwan285.campushub',
  appName: 'Campus Companion',
  webDir: 'dist',
  server: {
    hostname: 'localhost',
    androidScheme: 'https',
  },
};

export default config;
```

This uses bundled assets served at the app's local origin, `https://localhost`. Keep Vite's existing `base: '/'` initially. There is no need to change to a `file://` URL or automatically replace BrowserRouter with HashRouter.

Leave `server.url` unset for production: it is intended for live reload, and using the hosted website there would undermine the bundled startup design. Do not add unrestricted `allowNavigation` or production cleartext access. [Capacitor configuration reference](https://capacitorjs.com/docs/config).

### 5.4 Build with the right environment

Create a **local** `.env.android.local` containing the real public HTTPS API address:

```dotenv
VITE_API_URL=https://YOUR-API-HOST
```

This placeholder must be replaced. An optional `.env.android.example` can document the required value for other developers. The repository already ignores `*.local`.

Vite reads base `.env` files as well as mode-specific ones, so the Android mode must explicitly override the current development API URL. The example frontend environment uses `http://localhost:4000`; that is unsuitable for a release APK. `VITE_*` values are public and compiled at build time.

Build, create the Android project once, then synchronize:

```bash
npm run build -- --mode android
npx cap add android
npx cap sync android
npx cap open android
```

Add the following scripts when implementing:

```json
{
  "build:android": "vite build --mode android",
  "android:sync": "npm run build:android && cap sync android",
  "android:open": "cap open android",
  "android:run": "npm run android:sync && cap run android"
}
```

Every JavaScript/CSS change needs a rebuild and sync before it appears in a normally bundled Android build. Run `cap add android` only when first creating the platform, not for every update.

Check in `android/`, `capacitor.config.ts`, dependency changes and the lockfile. Keep the generated platform `.gitignore`; exclude build products, local SDK paths and signing secrets. Add explicit ignores for keystores and local signing properties. Treat native Android configuration as maintained source.

### 5.5 Add only the plugins needed

The initial platform work will likely use:

```bash
npm install @capacitor/app@8 @capacitor/network@8 @capacitor/browser@8 @capacitor/preferences@8 @capacitor/splash-screen@8
npx cap sync android
```

Add Filesystem/File Viewer or a small native document bridge if implementing offline PDF access. Choose a maintained secure-storage integration compatible with Capacitor 8 for tokens. Do not assume `@capacitor/preferences` encrypts credentials. Notifications and Firebase are optional later additions.

Capacitor 8 includes a **SystemBars** API in `@capacitor/core`; evaluate that for modern edge-to-edge handling instead of copying an old Status Bar tutorial. [System Bars documentation](https://capacitorjs.com/docs/apis/system-bars).

## 6. Connect Android to the existing API

### 6.1 CORS is an immediate integration task

The app's WebView origin is different from the Vercel website. With the configuration above, add **`https://localhost`** to the API's `CORS_ORIGIN`, preserving the existing permitted web origins.

An illustrative server setting is:

```dotenv
CORS_ORIGIN=https://YOUR-WEB-HOST,https://localhost,http://localhost:8080
```

The exact production web origin must come from your deployment. `server/src/config.ts` already accepts a comma-separated list and `server/src/app.ts` already exposes `X-Session-Token`. Normal WebView `fetch` should remain the initial transport; native HTTP is not required merely because this is Android.

Verify public requests, authenticated requests, preflight requests with `Authorization`/`Content-Type`, and reading renewed tokens. An OPTIONS check can help:

```bash
curl -i -X OPTIONS 'https://YOUR-API-HOST/api/auth/login' \
  -H 'Origin: https://localhost' \
  -H 'Access-Control-Request-Method: POST' \
  -H 'Access-Control-Request-Headers: content-type'
```

Then verify through the device itself. The static fallback can make a CORS failure look like success. Confirm real API responses and a profile update using a staging account.

### 6.2 Development networking

`localhost` on a phone is the phone. An Android emulator normally reaches a development service on the host using `10.0.2.2`; a physical device can use a reachable LAN address or an explicitly configured `adb reverse` mapping. Use a staging HTTPS API where possible. [Android emulator network addresses](https://developer.android.com/studio/run/emulator-networking-address), [WebView access to a local server](https://developer.android.com/develop/ui/views/layout/webapps/access-local-server).

An HTTP development API requires deliberate debug-only cleartext/mixed-content configuration or a trusted HTTPS development endpoint. Do not ship those exceptions. The local WebView origin and the API address are separate concepts: changing the API to a LAN address does not make the app's Origin header equal that address.

### 6.3 Backend reliability remains relevant

Bundling the frontend fixes dependence on downloading the UI; it does not remove API cold starts. Login and server writes still need the API. The existing public-read timeout is 6 seconds, authenticated requests default to 12 seconds, and login can perform a preliminary check followed by login.

Give users clear retry/sync status. Keep a cached dashboard usable while a saved session is checked. Preserve the existing rule that network errors do not sign users out; only a genuine authentication rejection should clear the session. The memories describe a keep-alive workflow, but its historical presence is not evidence of present production availability. Consider always-on hosting if first-login delays remain unacceptable.

## 7. Fix persistence and session startup

### 7.1 Introduce platform storage adapters

The current stores persist through browser localStorage:

| Key | Current contents | Proposed native treatment |
|---|---|---|
| `campus-auth` | Token, expiry and account snapshot | Put token in secure storage; retain an appropriately protected account snapshot separately. |
| `mess-bus-user-storage` | Local student profile | Preferences or another durable app-private store. |
| `timetable-store` | Selection context, course picks, personal corrections, preview state | Versioned local persistence with account ownership and sync metadata. |
| `mess-bus-theme` | Light/dark choice | Retain synchronous pre-paint behavior; synchronize a native preference if needed. |

Capacitor recommends Preferences for lightweight persistent values because mobile operating systems can clear WebView localStorage. Preferences uses Android SharedPreferences and is not a database. Use a suitable cache store such as IndexedDB for public datasets, or SQLite if the data/access pattern warrants it. [Preferences documentation](https://capacitorjs.com/docs/apis/preferences).

For credentials, use a maintained integration that encrypts token data with keys protected by Android Keystore. Keystore protects cryptographic key material; it does not automatically make an arbitrary JavaScript token store secure. Review backup/restore behavior and clear credentials on logout. [Android Keystore](https://developer.android.com/privacy-and-security/keystore).

### 7.2 Change the API wrapper and auth store together

In `src/services/api.ts`, `readStoredToken()` and `storeToken()` directly parse/write `campus-auth` in localStorage. Replacing only Zustand's persistence would leave API calls reading the wrong location.

Create a shared token provider with an in-memory token and coordinated asynchronous persistence. Login, API authorization headers, `X-Session-Token` renewal, restoration and logout must all use it. Renewal currently writes storage without updating the auth store's in-memory token; avoid later store writes restoring an older token. Use an explicit synchronization contract rather than another circular import.

Gate initialization on hydration of the required stores. Async storage means `restore()` must not decide there is no token before the token has been loaded, and the account bridge must not clear a profile while hydration is still in progress.

Provide schema versions and migration functions for persisted data. Keep course IDs as **bare course codes**, preserve academic selection context, and scope pending writes to account ID plus context. On logout/account switching, remove private caches and pending work for the previous user; a subsequent account must never inherit them.

### 7.3 Web users are not automatically signed into Android

Chrome website storage and Android WebView app storage are separate. Existing users must sign in on Android to retrieve the server copy of their profile, courses and personal timings. Theme preferences and unsynced website edits will not automatically transfer. Explain that distinction in any migration instructions and prompt users to sync important edits first.

## 8. Make offline behavior dependable

The repository has an effective bundled fallback, but it does **not** yet implement complete offline startup and durable offline synchronization.

### 8.1 Decide fresh-install behavior

With an API URL configured, `AppLayout` requires a token before showing the dashboard. A new installation without connectivity cannot reach the useful bundled menus and bus data. A returning user can retain an existing session during an outage, but startup still waits for session restoration.

Recommended change: allow a **local guest profile** to access public campus content and a local timetable, with account sign-in offered for synchronization. Keep account-only writes unavailable until signed in. Alternatively, require first-use connectivity and state that limitation clearly; do not describe that version as fully usable offline from first launch.

If adding guest mode, fix `useAccountBridge` first: it currently calls `useUserStore.logout()` whenever there is no account. This can erase an intentionally local profile on initialization. Represent guest mode explicitly and wait for hydration; do not treat every missing account as a user-requested logout. Test app restart with no API configured as well as a configured-but-unreachable API.

### 8.2 Persist the last successful public data

React Query's current cache and `TimetableLoader` promise caches are in memory. Loaded courses are deliberately omitted from the persisted timetable store. After process death, the latest admin edits are not guaranteed to remain available offline.

Use this data preference order:

```text
Successful current API response
    -> validated last successful response saved on this device
        -> bundled initial data
```

Render stored data promptly and refresh when possible. Persist schema version, semester/data version where applicable, fetch time and source. Show a useful state such as “Saved schedule · updated yesterday” or “Bundled schedule · may be outdated.” A failed fetch must not overwrite a good cache with fallback data.

Apply this to mess menus/timings, buses, temporary services, academic days and the loaded course catalog. Keep date-window expiry active offline. Preserve these existing data rules:

- An API response of `[]` for special services is authoritative: a removed shuttle must not reappear from the bundle after restart.
- Stale/bundled course data must not discard personal timing corrections. Keep the current fingerprint guards and extend the authority model to distinguish a freshly fetched response from a persisted old response; `offeringId` alone is not proof of freshness.
- Preserve bus ordering, each departure's original position, midnight rollover and Sunday buggy exclusions.
- Check calendar deletion semantics: the current UI hook falls back when a holiday list is empty, while calendar synchronization can accept an empty list. Decide and test whether empty means “cleared” or “missing” for each dataset.

### 8.3 Retry pending private edits explicitly

Course selection sync is debounced and currently swallows failures, retrying on another change. Restoration can adopt the server selection and overwrite a locally persisted selection that never uploaded. Personal timings have an unsynced flag, but reconnect alone is not a complete durable replay mechanism.

Persist pending operations or a versioned dirty snapshot. Retry on connectivity restoration, app resume and explicit user retry. Track owner account, academic context, update version and acknowledgement. Clear a pending change only when that exact version is acknowledged. Keep the server's protection against stale program/year/batch writes.

For multiple-device conflicts, define a policy before implementation: either accept an explicit last-write-wins rule with user-visible status, or add server revisions and detect conflicting edits. Do not silently imply that every local change has synced. Suggestions and admin writes must show confirmed success or failure; retries of non-idempotent requests need deduplication.

## 9. Adapt the interface to Android

### 9.1 System Back, routing and deep links

Use the App plugin and an application-level navigation policy. Back should dismiss the keyboard/native surface as appropriate, close the topmost dialog or settings sheet, navigate within the app, and follow normal Android root behavior when no app navigation remains. Do not make every Back action exit the application.

Installing a custom `backButton` listener replaces default handling, so implement the full intended behavior and remove listeners on teardown. Test both buttons and gestures, including predictive Back on current Android versions. [Capacitor App API](https://capacitorjs.com/docs/apis/app).

Start with the existing BrowserRouter and verify cold-start/reload paths `/timetable`, `/academics`, `/campus` and `/leave`, and the redirects in `src/routes.ts` (`/gym` → `/campus#gym`). Avoid changing route strategy without a demonstrated need. Audit the obsolete GitHub Pages query rewrite in `src/main.tsx` if it interferes with incoming URLs.

External deep links are optional for the first version. If added, configure Android App Links, domain association and a strict allowed-route parser. Handle both a cold launch and `appUrlOpen` while running. Arbitrary incoming URLs must not navigate the privileged app WebView to external sites. [Capacitor deep-link guide](https://capacitorjs.com/docs/guides/deep-links).

### 9.2 Resume and connectivity

`useTimetableSync` listens to browser focus/online/visibility events and polls while visible. Add native app-state and network listeners that feed a shared refresh coordinator. On resume, update the current campus time, refresh stale public content, restore/refresh account state as needed, and retry pending edits. Debounce this work to avoid duplicate fetches from browser and native events.

Pause periodic foreground work when backgrounded. JavaScript timers are not a dependable background scheduler. Returning after a night or holiday must recompute the date, next bus and timetable rather than waiting for an old timer tick.

### 9.3 Safe areas, keyboard and visual polish

`AppLayout.tsx` uses a fixed bottom bar and a `safe-area-bottom` class, but no matching safe-area utility was found in the current stylesheet/configuration. `index.html` also lacks `viewport-fit=cover`. Add deliberate top/bottom inset handling across the dashboard, login, onboarding, sheets and dialogs.

Use the selected Capacitor version's SystemBars inset handling and CSS safe-area values, testing older and newer WebViews. Avoid double-padding when native handling already adds insets. Edge-to-edge behavior needs actual device verification, not just a padded screenshot. [System Bars configuration](https://capacitorjs.com/docs/apis/system-bars).

Test the five-tab bar at 320/360px, landscape, cutouts and large system font sizes. Keep all form fields and Save buttons reachable with the keyboard open. Use adequate touch targets and TalkBack labels. Preserve dark-by-default and the saved light theme, including matching splash/system-bar styling. Bundle fonts with their licence if offline typography is important; `index.html` currently loads Inter from Google Fonts.

Consider making the timetable agenda use page scrolling and retaining empty days with an explanatory state. Those are usability improvements to implement and test, not features already guaranteed by the memories.

### 9.4 Campus time must remain correct

Preserve `Asia/Kolkata` as the business timezone for menus, buses and timetable dates. Audit `WeeklyGrid.tsx`, which uses `new Date()` and local formatting independently of the shared campus clock. Verify current-time highlights against full dates when previewing another week.

Test with a phone set to a non-India timezone. If adding notifications, convert campus wall times to real instants before scheduling; a Date used to represent shifted wall-clock fields is not automatically the correct native alarm timestamp.

## 10. Handle links, forms, phone calls and PDFs

Create shared platform helpers rather than scattering native calls across feature components.

| Resource | Current implementation | Android implementation |
|---|---|---|
| SAC, Moodle, Fedena, institute dashboard | HTTPS links in `ImportantLinksCard.tsx` | Open through a system browser/Custom Tab; keep institute login outside the application's privileged WebView. |
| Leave and feedback forms | Google Form links with `target="_blank"` | Open externally; test Google login, submission and returning to the app. |
| Amul Cafe phone number | `tel:` link | Launch the dialer, with a fallback if no handler exists. Direct calling permission is unnecessary. |
| Hostel Rules, Academic Calendar, gym timing and regulations PDFs | `docUrl()` creates paths under `public/docs/` | Add a native file-opening route or a confirmed public HTTPS alternative. |

`@capacitor/browser` provides a browser surface suitable for ordinary external web content. Test each important link and do not assume `target="_blank"` behaves identically across WebViews. [Browser plugin documentation](https://capacitorjs.com/docs/apis/browser).

**The PDF trap:** a bundled document can resolve inside the application as `https://localhost/docs/...`, but an external browser/PDF app cannot access the application's internal asset-serving mechanism through that URL.

Choose one explicit strategy:

1. **Recommended for offline PDFs:** read the bundled asset, copy it into app-private cache, and use a maintained file-viewer integration or native FileProvider bridge to open a temporary readable `content://` URI with MIME type `application/pdf`. Handle a missing PDF viewer and provide a useful fallback. Limit access to the intended document paths.
2. **Simpler online first version:** open each PDF at its real, public HTTPS hosting URL. This requires a known web host and working PDF response; it will not support opening the document offline.

You do not need an embedded PDF reader or broad external-storage access. Keep the Academic Calendar as a document resource, as requested in the project history. Updating the bundled PDF requires a new app build; updating a hosted document requires a content refresh strategy if copies are cached.

## 11. Authentication, deletion and privacy

### 11.1 Make an explicit decision about student identity

The current API creates or retrieves a student account from a roll number alone. The memories explicitly record that this was a deliberate low-friction trade-off. It also means anyone who knows a student's roll number can retrieve that account and change its saved preferences and timetable.

For an internal prototype, that may remain the accepted model. For a public release, I recommend institute Google sign-in or verified institute-email authentication, particularly before adding destructive account actions. This is an engineering recommendation, not a claim that Google Play mandates Google OAuth.

If you implement verified identity:

- Verify the identity provider's response on the server; do not rely on a client-supplied email suffix or hosted-domain hint.
- Preserve existing profile IDs and course data through a controlled account-linking flow. Do not let an unverified roll-number claim take over an old profile.
- Use a supported native/system-browser sign-in flow and handle its return link. Do not collect an institute password in your own form or embedded WebView.
- Register the appropriate application ID and signing-certificate fingerprints with the provider. Debug, upload and Play app-signing certificates can differ.
- Keep admin authorization enforced by the API. Hiding `/admin` in Android does not secure an API endpoint.

The Claude memory says you intended to handle OAuth and hosting yourself. This guide describes the work; it does not assume those changes have been made or authorize a live rollout.

### 11.2 Add account and associated-data deletion

The current app auto-creates accounts, and no deletion route or UI was found. Google Play requires applications with in-app account creation to provide an in-app deletion pathway and an external web resource for requesting deletion. Deactivating an account is not equivalent to deleting it. [Account deletion requirements](https://support.google.com/googleplay/android-developer/answer/13327111?hl=en-EN).

Implement an accessible Delete account action in Account Settings and a publicly reachable deletion-request page. A proposed API route is `DELETE /api/auth/account`; it does **not** currently exist. Define how ownership is verified. A confirmation dialog plus roll-number login alone does not prove the requester owns that account; use verified identity or a support-assisted ownership check before destructive deletion.

Plan deletion against the actual schema:

| Data | Required handling |
|---|---|
| `profiles` | Delete the account after the verified request and any declared retention process. |
| `user_courses`, `user_course_overrides` | Existing profile foreign keys cascade deletion; verify the transaction and actual production schema. |
| `course_change_requests` | `requested_by` becomes null on deletion, but `requester_roll` and free-text notes remain. Delete or anonymize identifying data deliberately. |
| `audit_log` | The actor reference can become null while `actor_roll`, `before` and `after` retain identifiers. Define and implement any legitimate, disclosed retention. |
| Analytics, logs, backups | Inventory active systems; apply deletion/anonymization and a documented backup expiry policy. dbt includes a student activity view with roll numbers. |
| Device storage | Clear tokens, profile, private timetable state, pending sync operations and later notification registrations. |

Prevent old tokens from accessing deleted or recreated accounts. Current sessions are stateless, and `/me` looks a profile up by roll number. Audit every authenticated route so a valid old signature cannot authorize a new account with the same roll. Resolve the token's immutable subject against the current account, or introduce an appropriate revocation/session-version mechanism. Simply deleting a row or locally logging out does not revoke a stateless token everywhere.

Add new migrations for schema changes; never edit already-applied migrations. Test deletion and re-registration with an old token on a second device.

### 11.3 Privacy disclosures must describe actual data

Publish an accessible HTML privacy policy and link it from the app and Play listing. Google's review guidance requires a public policy page even for apps claiming no personal/sensitive data. [Prepare your app for review](https://support.google.com/googleplay/android-developer/answer/9859455?hl=En).

Your app does transmit account-linked data. Inventory names, roll numbers, academic details, mess choice, selected courses, personal timings, suggestion notes and account activity. Review hosting logs, database backups, analytics and any added crash/notification SDKs. Decide which parts are collected/shared under Google's definitions; do not mark “no data collected” solely because there are no ads. [Data safety guidance](https://support.google.com/googleplay/android-developer/answer/10787469?hl=en).

Explain purposes, recipients/service providers, retention, deletion, security and a support contact. Keep declarations consistent with both the app and backend. Distinguish your own processing from external institute portals and Google Forms, and review the forms you control.

The existing login text says the app stores “only your timetable and mess preference,” while the profile includes name, roll number and academic fields. Update that copy to be accurate. The privacy policy and deletion page must remain reachable before login.

### 11.4 Release security work tied to this repository

- Confirm the historical database/service-role credential rotation recorded in the memories. Its completion is unknown; do not assume old exposed credentials have been replaced.
- Keep all privileged credentials on the server and signing secrets outside Git/build logs. `VITE_*` is public, including inside an APK.
- Validate request bodies and authorization on the API; CORS is not authentication.
- Review abuse limits on student account creation and suggestions, since existing failed-password throttling mainly protects password-bearing accounts.
- Keep external pages out of the privileged app WebView; test a suitable Content Security Policy against the actual bundle, fonts and inline theme initialization.
- Disable WebView debugging in release builds and avoid logging bearer tokens or personal data.

The core feature set should need ordinary network access, not contacts, location, camera, SMS, microphone, direct-call or broad storage permissions. Inspect the merged Android manifest after adding plugins.

## 12. Notifications and other optional Android features

### Local reminders

Class, meal or bus reminders can be scheduled on the device using a local-notifications plugin. They do not require Firebase simply to notify about a known local event. Ask for notification permission when the user enables reminders, support denial, create useful notification channels and let users disable categories. Android 13+ has a notification runtime permission; exact alarms have additional restrictions. Prefer inexact scheduling unless exact timing is justified and eligible. [Local Notifications documentation](https://capacitorjs.com/docs/apis/local-notifications).

Use stable IDs and rebuild the schedule after course edits, approved changes, holidays, timezone changes and account switching. Cancel removed events and expired special buses. Test reboot, battery restrictions and app updates. Never promise exact delivery based on a JavaScript `setInterval`.

### Remote announcements

Push messages for a new exam shuttle or an approved timetable correction require extra infrastructure: Firebase Cloud Messaging integration, device registration endpoints/table, account association, token refresh/removal and a server sender. Keep Firebase server credentials on the backend. Send an event/reference and refresh authoritative data on receipt; avoid unnecessary personal details in a lock-screen payload. [Push Notifications documentation](https://capacitorjs.com/docs/apis/push-notifications).

Widgets and calendar export are separate features with their own native implementation and data-refresh considerations. They should not delay the first useful Android release.

## 13. Preserve live content editing and support older apps

Your memories emphasize updating content through `/admin` without asking for code changes. Preserve that capability: web admin edits should reach Android through the same API and cache refresh path.

There are three different update mechanisms:

| Change | How it reaches Android |
|---|---|
| Menu, official course timing, holiday or bus data already served by the API | Backend/admin update; Android refreshes and persists the new data. |
| React UI, timetable logic, bundled data/PDFs, native permissions or plugins | Build and distribute a new app version. A Vercel deployment does not update installed assets. |
| Currently bundled-only material such as Amul Cafe/library/gym information or portal links | New app build today; optionally add API/admin support if frequent edits justify it. |

**Seeding is not an export operation.** `server/scripts/seed.ts` reads `src/data` and writes to PostgreSQL while preserving admin customizations. It does not copy live database edits back into `src/data`. A historical memory suggests otherwise; the source code determines the direction. Keeping packaged defaults current requires an explicit reviewed export/refresh process or manual source updates plus a rebuild.

Check deployed schema readiness, particularly migration 011 for special services. The memories record it as a pending manual step at the time; this review did not inspect live migration state. Account deletion and any new sync/identity fields will need additional migrations and a staged rollout.

Keep the API compatible with installed app versions. Add optional fields before requiring them, and introduce migrations/server capabilities before publishing a client that depends on them. Document a supported app-version range. A web rollback cannot instantly roll back Android clients already installed.

Airflow/dbt work is not a prerequisite for building Android, although personal data copied into operational analytics belongs in the deletion inventory. No production reseed or reset is necessary just to package the frontend. `seed:reset` discards admin edits and must not be used as a conversion step.

## 14. Suggested file-by-file implementation map

New paths in this table are proposals. They have not been created by this review.

| File or area | Planned change |
|---|---|
| `package.json`, `package-lock.json`, `.nvmrc` | Capacitor/plugin dependencies, repeatable Android scripts and supported Node version. |
| `capacitor.config.ts` — new | App ID/name, `webDir`, stable local origin and deliberate plugin configuration. |
| `android/` — new | Generated native project, manifest, Gradle wrapper/configuration, launcher/splash resources and any minimal native adapters. |
| `.env.android.example`, local `.env.android.local` | Document and supply the public HTTPS API endpoint for Android builds. |
| `.gitignore` | Ignore signing material/local configuration/build output; keep native source tracked. |
| `src/platform/storage.ts` — new | Versioned platform persistence and secure-token interface. |
| `src/platform/links.ts`, `src/platform/documents.ts` — new | Browser, dialer and PDF dispatch with web fallbacks. |
| `src/platform/lifecycle.ts` or a React hook — new | Back handling, app resume, network changes and listener cleanup. |
| `src/services/api.ts` | Replace direct token localStorage access; coordinate renewed tokens and request status. |
| `src/store/useAuthStore.ts` | Async hydration, cached startup, coordinated logout and later verified identity/deletion. |
| `src/store/useUserStore.ts`, `src/store/useTimetableStore.ts` | Durable state migrations, guest/account ownership and pending-write metadata. |
| `src/hooks/useAccountBridge.ts` | Guest-safe behavior, hydration ordering and durable conflict-aware synchronization. |
| `src/hooks/useApiData.ts`, `src/services/timetableLoader.ts` | Last-successful content persistence, freshness/source metadata and valid empty-response semantics. |
| `src/hooks/useTimetableSync.ts` | Integrate native resume/connectivity refresh with the existing foreground behavior. |
| `src/components/layout/AppLayout.tsx` | Cached/guest startup, safe-area layout, refresh coordinator and navigation integration. |
| `src/components/features/timetable/WeeklyGrid.tsx` | Campus-time correctness, preview-date highlighting and deliberate mobile scrolling/empty-day behavior. |
| `Login.tsx`, `Onboarding.tsx`, `AccountSettings.tsx` | Offline/sync states, identity choice, keyboard usability, privacy and deletion access. |
| Campus/Leave/Gym/Amul feature components, `src/lib/documentUrl.ts` | Use common external-link/document helpers. |
| `index.html`, `src/index.css`, `Header.tsx` | Viewport/insets, native theme integration and optional bundled fonts. |
| `src/App.tsx`, `src/main.tsx` | Platform bootstrap, public privacy/deletion routes and optional Android-specific admin exclusion. |
| `server/src/config.ts`, deployment CORS setting | Allow the real native origin while retaining the web allowlist. |
| Server auth routes/middleware/repositories and new migrations | Deletion, token invalidation/account ownership checks, optional identity and sync revisions. |
| `.github/workflows/android.yml` — new | Reproducible checks, web build, native sync/build and controlled release artifact generation. |

Keep platform helpers small so the website remains functional. If `/admin` is retained inside Android, fix direct-load session restoration: it is currently outside `AppLayout`, which owns `restore()`. If excluded, keep admin operations available through the existing website and retain backend authorization unchanged.

## 15. Testing that proves Android readiness

Keep the existing tests. Add focused regression tests for new storage, lifecycle, cache and synchronization behavior, then exercise native behavior on devices. Browser automation alone cannot verify Android Back, native storage, file intents, keyboard or release signing.

| Scenario | Expected result |
|---|---|
| Fresh online installation | Onboarding/login completes, actual API data loads, no CORS failures. |
| Fresh installation in airplane mode | Guest experience works if chosen; otherwise a clear first-use connectivity requirement. No indefinite spinner. |
| Returning user, API unavailable | Cached profile/content remain usable; network errors do not erase the session. |
| Explicit 401 / revoked or deleted account | Appropriate sign-in state; no private data leaks or endless authenticated retries. |
| API recovers after timeout | Current data replaces cached/bundled data without restarting the app. |
| Offline course edit followed by force-stop/relaunch | Edit remains pending and syncs on reconnection without being replaced by the old server snapshot. |
| Two devices edit the same account | The documented conflict policy holds; status is honest. |
| Switch accounts with unsynced edits | Previous user's data and queued operations never enter the new account. |
| Profile changes year/program/branch/batch | Old academic selections clear as designed; stale queued writes remain rejected. |
| API deletes all special services | Empty list survives caching/restart; bundled shuttle does not return. |
| Approved official timing versus personal correction | Correct fingerprint behavior for fresh, cached and bundled official data. |
| Temporary shuttle dates | Correct display on 16/28 November 2026; absent on Sunday 22, excluded holiday 24, and from 29 onward for the supplied service. |
| Bus edge cases | Friday routes, Sunday buses/no buggies, positional x2 badges, Nila Parking notes and post-midnight departures remain correct. |
| Timezone/date preview | Campus times remain correct outside IST; another week's same weekday is not highlighted as today. |
| Back/keyboard/dialogs | No accidental exit, trapped sheet, hidden Save button or broken tab navigation. |
| Return from a form, PDF or dialer | App returns to a sensible state and refreshes when needed. |
| All four PDFs, online/offline | Chosen strategy works; no blank WebView or HTML masquerading as a PDF. |
| Dark/light, large text, TalkBack, narrow/landscape screens | Content is readable, reachable and appropriately labelled. |
| App update over an existing installation | Profile, selections, pending edits and theme survive schema migrations. |
| Account deletion and re-registration | Associated data is handled; old tokens cannot access a recreated account. |

Use a staging API/database or controlled fixtures. The existing API creates accounts on first login, so random login tests against production create real profiles. The memories document disposable test approaches; do not mistake a stubbed browser pass for native or production validation.

Test at least one lower-resource real Android phone plus a current API 36 device/emulator. Include the declared minimum API, current WebView versions, gesture and three-button navigation, and any native plugin compatibility constraints. Inspect native libraries from plugins for **16 KB page-size compatibility** and test where applicable. [Android page-size guidance](https://developer.android.com/guide/practices/page-sizes).

Useful future verification commands, once Android exists:

```bash
VITE_API_URL= npm test
npx tsc --noEmit -p tsconfig.app.json
npx tsc --noEmit -p tsconfig.node.json
npm --prefix server run typecheck
npm run lint
npm run android:sync
cd android
./gradlew lint assembleDebug
```

Whole-repository lint has historical failures noted in the memories; establish the current baseline and resolve release-relevant failures without assuming the history is current. The TypeScript node configuration currently includes only `vite.config.ts`; include the new Capacitor configuration in an appropriate typecheck.

## 16. Build, sign and distribute

### 16.1 Generate a test APK

After completing toolchain setup and the prototype integration:

```bash
npm run android:sync
cd android
./gradlew assembleDebug
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

Android Studio's Run action can also build/install on a selected device. A debug APK is for development. Keep a distinct debug/staging application ID or installation plan so its signing certificate does not conflict with production updates.

### 16.2 Create release signing material

Use Android Studio's signed bundle/APK workflow or a secure Gradle signing configuration. Keep the keystore outside the repository, keep passwords in a password manager/CI secret store, and retain a recoverable backup. Record the application ID, alias and certificate fingerprints.

For Google Play, enroll in **Play App Signing** and use an upload key for the AAB. The upload key and the key used to sign installed Play APKs serve different purposes. If distributing a public APK before Play, decide how it will share a compatible app-signing identity with the future Play version; an upload-key-signed sideload is not automatically update-compatible with a Play-signed install. [Android app-signing guide](https://developer.android.com/studio/publish/app-signing).

In `android/app/build.gradle`, set a human-readable `versionName` such as `1.0.0` and an integer `versionCode`. Increase `versionCode` for every published update. Configure signing before running release tasks.

```bash
npm run android:sync
cd android
./gradlew bundleRelease
```

The usual AAB path is `android/app/build/outputs/bundle/release/app-release.aab`. For direct APK distribution, use the signed `assembleRelease` output. **An AAB is uploaded to Play; it is not installed with `adb install`.** Test the Play-generated installation through a testing track as well as local builds.

### 16.3 Direct distribution versus Google Play

| Distribution | Advantages | Extra responsibilities |
|---|---|---|
| Direct signed APK for a small campus beta | Fast feedback, no Play listing needed for the initial test. | Installation-source prompts, trusted download location, signing continuity and update delivery. |
| Play internal/closed testing | Play-managed installation/update path and realistic release testing. | Developer account, applicable setup/declarations and tester enrollment. |
| Play production | Discoverability and managed updates for students. | Full store review, policy compliance, production access and ongoing maintenance. |

Do not assume distribution outside Play permanently avoids developer verification. Google's current rollout begins in selected regions in September 2026 and expands globally in 2027; check the rules applying to your countries and channel before broad APK distribution. This review does not claim that India is in the initial regional rollout. [Android developer verification](https://developer.android.com/developer-verification).

### 16.4 Google Play submission tasks

1. Create/use the appropriate personal or organization developer account and complete identity/device verification requirements shown in Console. The published registration fee is **US$25 once**; local payment conversion/taxes may differ. [Play Console setup](https://support.google.com/googleplay/android-developer/answer/6112435?hl=en-GB).
2. Choose the final app name, application ID, contact email and distribution countries. Describe institute affiliation accurately.
3. Prepare a launcher/adaptive icon and splash resources from the existing CC mark, plus store icon, feature graphic, screenshots, short description and full description. Follow the current Console asset specifications.
4. Supply privacy-policy and deletion URLs, Data safety answers, content rating, target audience, ads declaration and any requested permissions declarations.
5. Provide reliable app-review access. If account access is restricted, supply a reviewer/demo pathway that reaches the real student features without exposing an admin account or personal student data.
6. Upload the signed AAB to internal testing, examine automated/pre-launch findings and test its actual installation and updates.
7. Complete closed testing if required for your account, then apply for production access and submit the release.
8. Roll out gradually and monitor crashes, startup failures, API errors and feedback before expanding availability.

For **personal developer accounts created after 13 November 2023**, Google's current requirement is a closed test with at least **12 testers continuously opted in for at least 14 days**, followed by a production-access application. Meeting the elapsed-time threshold does not guarantee approval. Account type/date are not known from this repository. [Personal-account testing requirements](https://support.google.com/googleplay/android-developer/answer/14151465?hl=en-en).

## 17. Delivery order, effort and ongoing maintenance

These are planning estimates for one developer familiar with the codebase, not measured implementation times. Android/plugin debugging and a new identity provider can increase them.

| Phase | Work | Approximate engineering effort |
|---|---|---|
| 1 | Toolchain, Capacitor project, API environment/CORS, first device installation | 1–2 working days |
| 2 | Navigation, layout/keyboard, lifecycle, external links and PDFs | 2–4 working days |
| 3 | Persistence/hydration, cached startup, durable offline sync and account isolation | 3–6 working days |
| 4 | Deletion, privacy surfaces, release checks and verified identity if selected | 3–7+ working days |
| 5 | Physical-device regression, signing, store assets and beta fixes | 2–4 working days |

A basic prototype can be available early. A dependable public release is more realistically **roughly 3–5 working weeks**, with overlap between tasks. Add any mandatory 14-day closed-test period, production-access decision and store review time to the calendar; some preparation can run during testing.

The existing backend/database can serve Android and web together. Core Capacitor and Android development tooling do not require a paid app-building service. Budget separately for the Play account, any hosting upgrade, domain, test devices, and a commercial plugin only if you select one. Current hosting costs depend on your actual plan and usage and were not audited here.

Add an Android CI workflow that installs pinned Node/JDK/SDK tooling, runs `npm ci`, checks/tests, builds the Android-mode web bundle, runs `cap sync android`, and builds the native artifact. Run backend checks with the server's dependency installation as a separate step. Keep release signing in a protected workflow with secrets unavailable to untrusted pull requests. Record the commit and version for each artifact; automated publication can be added after the local release process is proven.

After release, maintain:

- Backward-compatible API behavior for students who have not updated.
- Periodic dependency/Android target updates and device compatibility checks.
- Semester data and packaged fallback refreshes; live admin edits alone cannot refresh installed default assets.
- Monitoring with deliberate privacy handling, deletion-request fulfillment and signing-key backups.
- Web regression checks whenever shared React/store logic changes.
- A clear app-version/update path. Roll forward with a higher version code when correcting an Android release; do not rely on a Vercel rollback to fix installed code.

## 18. Decisions to make before implementation

These choices do not prevent reviewing the repository or preparing this guide. They determine the concrete implementation scope:

| Decision | Recommended starting choice |
|---|---|
| Packaging technology | Capacitor 8 with the existing React UI. |
| Display name | Keep Campus Companion in the app for continuity; retain Campus Hub in documentation. |
| App ID and publisher | A permanent namespace you control; verify before production registration. |
| First delivery | Private device-tested beta, then Play testing/production. |
| Fresh-install offline behavior | Guest/local access to public content and timetable setup. |
| Student identity | Verified institute identity before broad public release; preserve existing account data through a controlled migration. |
| Admin access | Continue web admin initially. |
| PDFs | Bundled document opening via a native file integration for offline use. |
| Notifications/widgets | Defer until the core app and sync are stable. |
| Backend address and readiness | Confirm HTTPS API/web URLs, deployed migrations and current hosting reliability. |
| Play account | Confirm personal/organization type, creation date and verification/testing obligations. |

## 19. Implementation and release checklist

- [ ] Choose the application ID, publisher, distribution path and login/offline policy.
- [ ] Configure Node 22+, Android Studio, bundled JDK, SDK and test device/emulator.
- [ ] Add Capacitor, Android project, locked dependencies and reproducible scripts.
- [ ] Build with the correct HTTPS API URL and verify native-origin CORS/token renewal.
- [ ] Implement platform storage, secure tokens, hydration gating and state migrations.
- [ ] Implement the chosen offline startup, persistent content cache and visible sync status.
- [ ] Preserve/retry offline edits safely across restart, account switches and academic changes.
- [ ] Handle Android Back, lifecycle, safe areas, keyboard, themes and campus time.
- [ ] Test external portals/forms, dialer and every PDF through the chosen native strategy.
- [ ] Preserve existing timetable/bus rules and the web `/admin` content workflow.
- [ ] Implement account/data deletion and reject old tokens after deletion/re-registration.
- [ ] Complete privacy disclosures, public policy/deletion pages and review access.
- [ ] Verify required database migrations and address the recorded credential-rotation item.
- [ ] Pass regression, native lint/build and real-device/upgrade tests.
- [ ] Configure signing, versioning, adaptive icon, splash and store assets.
- [ ] Test the signed AAB through Play and complete applicable closed testing/review.
- [ ] Establish release monitoring, API compatibility and semester-data maintenance.

The first implementation milestone should be a **device-installed Capacitor build whose real API calls work**. The next milestone should prove **restart/offline/account-switch correctness**. Public distribution follows once the privacy, deletion, signing and device checks above are complete.
