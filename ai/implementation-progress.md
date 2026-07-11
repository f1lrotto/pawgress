# Pawgress implementation progress

## Project goal

Build the mobile-first Pawgress PWA described in `plan.md`: a secure,
multi-user puppy routine tracker using React, TypeScript, and Convex.

## Milestones

- [x] 1. Scaffolding — Vite, React, strict TypeScript, Convex, Tailwind,
      shadcn/ui, ESLint, Vitest, and CI-ready scripts.
- [x] 2. Auth + onboarding — Password auth, protected routing, dog-aware
      onboarding, and the first complete household graph.
- [x] 3. Event core + dashboard — authorized events, quick logging, live
      timers, backdating, editing, deletion, undo, and real-browser coverage.
- [x] 4. Walks + sleep — transactional walk lifecycle, linked potty logs,
      diary, chronological rest state, live controls/timers, and two-tab E2E.
- [x] 5. Enrichment + training — activity management, play intervals,
      training commands and sessions, reactive two-page flows, and browser QA.
- [x] 6. Today's agenda — authorized daily goals and reflections, read-only
      yesterday history, Dashboard summary, realtime two-page flow, and QA.
- [x] 7. Timeline + insights — paginated dog-local history, body tracking,
      accessible chart insights, route integration, E2E, and browser QA.
- [x] 8. Sharing — deterministic multi-dog access, stable dog switching,
      secure household members and invite lifecycle, dogless joining, and
      separate-account realtime logging.
- [x] 9. Localization + settings — complete English and Slovak catalogs,
      persisted per-user locale, locale-aware formatting, and Personal +
      Household settings on the existing route.
- [x] 10. PWA + desktop polish + deploy documentation — installable shell,
      truthful reconnect/install UX, route-level performance splitting,
      responsive desktop verification, and Cloudflare/Convex runbooks.

## Milestone 1 acceptance criteria

- [x] Vite starts and renders a responsive React 19 shell.
- [x] TypeScript strict mode is enabled for frontend, config, and Convex code.
- [x] Convex is locally configured and generated API files are committed-ready.
- [x] Tailwind CSS 4 and a shadcn/ui button primitive are configured.
- [x] ESLint includes the Convex plugin.
- [x] Vitest runs separate jsdom and edge-runtime projects.
- [x] Frontend and Convex scaffold smoke tests pass.
- [x] `format:check`, `lint`, `typecheck`, `test:run`, and `build` pass.
- [x] Desktop and mobile layouts were checked in a browser with no horizontal
      overflow, console errors, or warnings.

Product-level acceptance criteria remain in `plan.md` section 5 and are not
complete yet.

## Milestone 2 acceptance criteria

- [x] Password sign-up and sign-in use canonical validated email addresses.
- [x] Signed-out callers cannot access protected Convex functions or routes.
- [x] Dog-scoped queries and mutations reject authenticated non-members.
- [x] The schema includes dogs, memberships, activities, routines, and body
      metrics with indexed membership authorization.
- [x] Onboarding validates puppy details, weight, timezone, and bounded meal
      routines before writing anything.
- [x] One atomic mutation creates the dog, owner membership, initial weight,
      sorted meals, and six seeded activity types.
- [x] Authenticated users without a dog are routed to onboarding; users with a
      dog are routed to the dashboard.
- [x] The dashboard truthfully renders the current dog's name.
- [x] The complete local sign-up → onboarding → dashboard flow was verified in
      a real browser at mobile and desktop widths.

## Commands

- Development: `npm run dev`
- Local Convex sync: `npm run convex:dev`
- Production build: `npm run build`
- Formatting: `npm run format` / `npm run format:check`
- Lint: `npm run lint`
- Typecheck: `npm run typecheck`
- Unit tests: `npm run test` / `npm run test:run`
- Preview: `npm run preview`
- E2E: `npm run e2e` after starting the local Convex deployment; Playwright
  manages and locally reuses the Vite server.

## Milestone 3 acceptance criteria

- [x] Events use indexed dog/time and dog/kind/time access with user and dog
      attribution.
- [x] Quick logs support the six dashboard actions and optional backdated
      notes/amounts with backend bounds.
- [x] Authenticated non-members cannot list, create, update, or remove a dog's
      events.
- [x] Event timestamps reject invalid/future/pre-birthday values in the dog's
      timezone.
- [x] Recent activity and latest-per-kind queries update reactively across
      connected browser pages.
- [x] Dashboard timers show meals, potty, next meal, and current rest state
      using dog-timezone-aware pure utilities.
- [x] Recent events support inline edit, two-step delete, and one-step undo.
- [x] The dashboard and flows remain accessible, concurrency-safe, responsive,
      and verified by component and real Playwright coverage.

## Milestone 4 acceptance criteria

- [x] One active walk is enforced transactionally per dog, and completed walk
      intervals cannot overlap, including through generic event edits.
- [x] Ending a walk is idempotent: the first committed `endedAt` is
      authoritative, compatible retries return it, and retries never rewrite
      the diary.
- [x] Potty logs can attach only to an active same-dog walk, remain inside its
      interval, and are capped at 100 linked events per walk.
- [x] Walk deletion transactionally detaches linked potty logs without deleting
      them, using bounded indexed reads.
- [x] Wake/sleep events form a chronological alternating state machine across
      insertion, backdating, timestamp edits, deletion, and concurrent
      household writes.
- [x] The dashboard exposes accessible current/backdated walk start and end,
      ticking current/since-walk timers, linked-potty context, and an editable
      walk diary.
- [x] Rest controls reflect the current awake/asleep state, disable invalid
      repetition, and update the current-rest timer reactively.
- [x] The single Playwright daily-driver verifies the complete walk, diary,
      linked-potty, sleep, and wake flow across two authenticated pages without
      fixed sleeps.

## Milestone 5 acceptance criteria

- [x] Activity types are dog-authorized, normalized, bounded, uniquely named,
      and can be created, listed with optional archived entries, archived, and
      restored without losing historical play labels.
- [x] Active activity types can log current or backdated play events with
      optional notes and intervals; archived and cross-dog types are rejected,
      and generic edits preserve valid play intervals.
- [x] Training commands and sessions have authorized, validated, indexed APIs
      for creation, detail/history, partial updates, status changes,
      archive/restore, and rated current or backdated sessions.
- [x] Enrichment and Training pages expose responsive, accessible, dog-aware
      creation, logging, history, archive/restore, edit, and status flows with
      synchronous cross-operation locks.
- [x] Reactive edge cases are covered: stale activity selections cannot
      retarget drafts, malformed command deep links skip detail queries,
      session drafts reset by command, and touched command fields merge safely
      with collaborator updates.
- [x] The Dashboard resolves archived activity names for historical Play rows
      and supports safe Play interval edits.
- [x] The existing two-page Playwright daily-driver verifies Cafe visit and
      Recall creation, realtime history/status/session updates, and archive
      semantics without a second setup flow.

## Milestone 6 acceptance criteria

- [x] `agendaDays` stores one indexed document per dog/date with stable goal
      IDs, separate enrichment/training goals, optional win/rating/diary, and
      explicit public validators.
- [x] All agenda APIs enforce dog membership, real `YYYY-MM-DD` dates, bounded
      normalized goals/reflections, rating 1–5, 20 goals per category, and
      transaction-safe creation and concurrent updates.
- [x] Only the dog's current local day is writable; yesterday remains
      authorized and readable through a complete interaction-free history.
- [x] `getZonedDayKeys` derives today/yesterday by dog-local calendar date and
      rolls the Agenda page and Dashboard query at midnight without carrying
      drafts into the next day.
- [x] Agenda forms preserve touched drafts through reactive household updates,
      keep untouched reflection fields live, clear optional fields correctly,
      and use one synchronous mutation lock.
- [x] The shared four-tab notebook header and protected `/agenda` route expose
      the full Agenda page; Dashboard shows today's goal completion, win, and
      rating summary with a direct Agenda link.
- [x] The existing two-page Playwright daily-driver verifies realtime goal
      creation/toggling and reflection synchronization, then verifies the
      Dashboard summary.

## Milestone 7 acceptance criteria

- [x] Timeline uses dog-authorized indexed pagination over exact local-day
      windows, including DST, optional unique kind filters, complete metadata,
      archived Play labels, bounded scans, and loading/empty/load-more states.
- [x] Body tracking supports bounded history plus validated create, partial
      update, explicit clearing, idempotent deletion, and dog-local age without
      losing timestamp precision on value-only edits.
- [x] Potty, walk-interval, sleep, and rating insight queries are authorized,
      deterministic, bounded, and covered across malformed ranges, empty data,
      local-day boundaries, meals, rest seeds, and DST.
- [x] Insights renders responsive Recharts weight, hourly potty, walk/meal,
      sleep, and rating views with visible textual data equivalents, explicit
      loading/empty/error states, and the reusable body notebook.
- [x] The six-tab notebook header and protected `/timeline` and lazy
      `/insights` routes are dog-aware, keyboard accessible, responsive, and
      covered for auth, intended-return, and dogless redirects.
- [x] The existing Playwright daily-driver verifies Timeline filtering and
      Insights body/weight/potty behavior without a second setup flow.
- [x] Timeline and Insights pass browser QA at exact 390- and 1280-pixel widths
      with no horizontal overflow or console errors.

## Milestone 8 acceptance criteria

- [x] `dogs.listMine` uses a bounded indexed membership read, returns every
      authorized dog with its exact role, rejects overflow or conflicting
      duplicate roles, and sorts deterministically by name, creation time, and
      ID.
- [x] The App owns the active dog ID, latches explicit choices across reactive
      list updates, does not let a newly inserted earlier-sorted dog steal the
      selection, and falls back safely when the active membership disappears.
- [x] Household member listing is dog-authorized, bounded, deterministic, and
      exposes only the minimum name/email/role profile needed by Settings.
- [x] Invite generation uses cryptographic uppercase 128-bit codes, permits any
      dog member consistently, and transactionally maintains one active invite
      per dog with collision retry and bounded indexed reads.
- [x] Redemption is normalized, transactional, role-fixed, cap-aware, and
      idempotent for the successful redeemer while rejecting malformed,
      unknown, consumed-by-another, revoked, cross-dog, and concurrent-loser
      paths without partial membership or invite writes.
- [x] The reactive active-invite query returns the current code or `null` after
      consumption/revocation; idempotent revoke immediately invalidates a
      leaked code, and subsequent generation rotates to a different code.
- [x] Users without a dog can redeem an invite directly from onboarding and
      reach the shared dashboard without creating a duplicate dog record.
- [x] The protected Settings page provides the dog switcher, member list,
      active invite creation/revocation, and another-dog redemption with
      accessible loading, error, confirmation, and operation-lock states.
- [x] The existing Playwright daily-driver creates a separate account, joins it
      from dogless onboarding, observes the member list reactively, and proves
      the new member's Pee log reaches the owner in realtime.

## Milestone 9 acceptance criteria

- [x] English and Slovak catalogs have identical non-empty key sets and cover
      all product-owned visible copy, validation/status/error text, accessible
      names, enum labels, and chart text without translating user-authored data;
      built-in defaults are localized once when seeded and then remain shared data.
- [x] An authenticated user's explicit `en` or `sk` preference is stored in a
      bounded one-document `userPreferences` contract and remains isolated from
      every other account and dog household.
- [x] Locale resolves as persisted preference, then the first supported browser
      language, then English; protected content waits for preference resolution
      so it does not flash the wrong language.
- [x] Switching English/Slovenčina updates the full app and `<html lang>`
      immediately and persists across reload and a second authenticated page.
- [x] Dates, times, numbers, compact durations, chart labels, and Slovak plural
      forms use the selected locale while dog timezone bucketing, timestamps,
      and stored date keys remain unchanged.
- [x] The existing `/settings` route becomes an accessible Settings page with
      Personal (account + language) and Household (members, invites, joining,
      dog switching) sections without regressing milestone 8 behavior.
- [x] Login, onboarding, every protected route, and Settings have representative
      Slovak component/E2E coverage and pass browser QA at 390 and 1280 pixels.

## Milestone 10 acceptance criteria

- [x] A root-scoped standalone manifest provides opaque 192/512 icons, a
      maskable 512 icon, an Apple touch icon, theme metadata, and deterministic
      repository-owned Pawgress branding.
- [x] The production service worker precaches the static app shell, cleans stale
      caches, uses a safe native waiting lifecycle, and defines no runtime cache
      for Convex requests or household data.
- [x] Offline state is announced persistently as reconnecting and clears when
      connectivity returns; the UI never offers or implies offline logging.
- [x] Settings provides truthful install guidance for a real browser prompt,
      iOS Add to Home Screen, already-installed mode, dismissal, errors, and
      browsers that are not currently offering installation.
- [x] Secondary routes load lazily while locale bootstrap stays synchronous;
      initial JS is 337.10 kB / 104.02 kB gzip with no chunk-size warning.
- [x] The Dashboard resolves to six timer columns and a two-column work area at
      1024 pixels; Dashboard and Settings have no horizontal overflow at exact
      390, 1024, or 1280 pixel checks.
- [x] Local production-preview coverage proves the manifest, active controlling
      service worker, cached offline shell, reconnecting status, and recovery.
- [x] README and `.env.example` document local setup, separate production Auth
      keys, managed Convex + Cloudflare Pages Git deployment, SPA fallback,
      smoke/device checks, and frontend/backend/data rollback without exposing
      secrets or mutating an external deployment.

## Completed work

- Created the npm project and lockfile.
- Added Vite 8, React 19, React Router, strict TypeScript 6, and aliases.
- Added Tailwind CSS 4 through its Vite plugin and initialized shadcn/ui.
- Added a responsive, accessible milestone shell with a warm field-notebook
  visual direction.
- Configured Convex 1.42 locally at `http://127.0.0.1:3210`, generated
  `convex/_generated`, and added an empty schema ready for milestone 2.
- Added ESLint 10 with TypeScript, React Hooks, React Refresh, and Convex rules.
- Added Prettier, Vitest 4, Testing Library, `convex-test`, and edge-runtime.
- Added one React smoke test and one Convex scaffold smoke test.
- Verified the anchor interaction and responsive layouts in the app browser.
- Installed `@convex-dev/auth` 0.0.94 and added its auth tables, Password
  provider, Convex auth config, and HTTP routes.
- Configured `JWT_PRIVATE_KEY` and `JWKS` on the local Convex deployment.
- Added a reusable signed-in user ID guard and a protected current-user query
  with explicit argument and return validators.
- Added backend tests covering auth-table setup, Password sign-up/sign-in,
  signed-out rejection, and signed-in current-user resolution.
- Added canonical email trimming, lowercasing, and validation to the Password
  profile while retaining Convex Auth's password policy.
- Added reusable authenticated query/mutation builders and dog-membership
  authorization builders through `convex-helpers`.
- Added dogs, dog members, activity types, meal routines, and body metrics with
  the indexes required for secure household access.
- Added authorized dog listing and meal-routine list/replacement APIs, including
  bounded labels/counts and transactional replacement.
- Added the atomic onboarding mutation and exhaustive tests for names, real
  birthdays, future dates, IANA timezones, finite positive weights, meal
  labels/times, ownership, and rollback behavior.
- Connected React to Convex Auth and implemented stable auth resolution,
  sign-in/sign-up, signed-out protection, dog-aware route redirects, and an
  accessible three-step onboarding wizard.
- Replaced the scaffold dashboard greeting with the authenticated dog's real
  name and verified `Good morning, Zoe QA.` in the local browser flow.
- Added the unified `events` table with `by_dog_at` and `by_dog_kind_at`
  indexes, plus authorized quick logging, update, idempotent removal, recent
  listing, and latest-per-kind APIs.
- Hardened event writes against invalid kinds/amounts/notes, excessive list
  limits, future timestamps, and timestamps before the dog's birthday in its
  own timezone.
- Added pure elapsed/sleep timer, next-meal countdown, and zoned
  `datetime-local` format/parse utilities with deterministic IANA and
  Europe/Bratislava DST tests.
- Built the dog-aware daily dashboard with six one-tap actions, reactive recent
  activity, live timer cards, backdated logging, inline edit, confirmed delete,
  and undo.
- Added accessibility, timezone, duplicate-submission, and concurrent-operation
  hardening throughout the dashboard interactions.
- Added a minimal Playwright setup whose real flow signs up, onboards, opens a
  second authenticated page, verifies sub-second live updates/timers, then
  backdates, edits, deletes, and undoes events.
- Added indexed walk lifecycle APIs with one-active-walk enforcement,
  non-overlapping intervals, authoritative idempotent completion, active-only
  potty attachment, a 100-event attachment cap, and editable diary notes.
- Hardened generic event edits and deletion so walk and linked-potty intervals
  remain valid, adjacent walks cannot overlap, and deleting a walk detaches its
  potty logs with bounded indexed work.
- Added a chronological wake/sleep state machine that preserves alternation
  across concurrent insert, update, and deletion mutations.
- Added dashboard walk controls, current/completed duration displays, diary
  editing, during-walk badges, current-rest controls, and awake/asleep timers.
- Extended the existing two-page Playwright daily-driver through the complete
  milestone 4 walk and rest flow with one-second reactive assertions.
- Added bounded dog-scoped activity-type list/create/archive/restore APIs and
  active-only play logging with normalized names/emoji, optional notes and end
  times, historical archive preservation, and interval validation on edits.
- Added `trainingCommands` and `trainingSessions` with command/status and
  command/time indexes, a 100-command cap, normalized active-name uniqueness,
  partial command updates, archive/restore, and validated rated sessions.
- Added shared `NotebookHeader` navigation and the `/enrichment` and
  `/training` routes, plus full Enrichment and Training page workflows.
- Hardened milestone 5 P1 paths: editable Play intervals, command caps, stale
  activity selections, malformed command deep links, keyed session drafts,
  synchronous shared operation locks, and per-field touched command drafts
  that preserve collaborator changes to untouched fields.
- Extended Dashboard historical rendering to look up archived activity types
  for old Play events while keeping archived types unavailable for new logs.
- Extended the existing two-tab Playwright flow through Cafe visit creation,
  logging, archive/history behavior, Recall creation, status updates, and
  reactive session history.
- Stabilized the Onboarding component test's synthetic `beforeunload` helper;
  this was a test-only flake fix with no production behavior change.
- Added `agendaDays` with the `by_dog_date` index and authorized get, goal
  add/toggle/remove, win, rating, and diary APIs with current-day write and
  historical read-only contracts.
- Added stable monotonic goal IDs, per-category 20-goal caps, transactional
  create/update behavior, normalization and length/rating validation, and
  concurrent household tests.
- Added dog-local `getZonedDayKeys` and hardened `datetime-local` parsing after
  a P1 review: parsing is independent of device timezone, rejects DST gaps,
  and chooses the earliest instant in fall overlaps.
- Adversarially verified the offset-candidate parser across all 418
  runtime-supported zones, 42,344 transitions from 1900–2100, alternate Los
  Angeles/Auckland host timezones, and four-digit year edges; then removed two
  React Doctor performance advisories without semantic changes.
- Expanded `NotebookHeader` to four tabs, added the protected `/agenda` App
  route, built the responsive Agenda page, and added the reactive Dashboard
  agenda summary.
- Hardened Agenda P1 paths for day rollover, remote goal races, shared mutation
  locking, collaborator-safe reflection drafts/clears, and maximum-length
  unbroken yesterday content on mobile and desktop.
- Extended the existing two-tab Playwright daily-driver through enrichment and
  training goals, cross-page completion, win/rating/diary synchronization, and
  Dashboard summary verification.
- Added contiguous dog-local day-window generation for exact Timeline and
  Insights ranges across ordinary, spring-forward, and fall-back days.
- Added the authorized `timeline.listDay` query with newest-first Convex
  pagination, optional unique kind filters, a 27-hour window cap, page-size
  validation, and a 500-row scan bound.
- Completed authorized body-metric create, partial update, explicit clear,
  idempotent removal, and bounded history contracts plus a responsive body
  notebook with dog-local age.
- Added bounded potty-by-hour, completed-walk interval/meal-marker, daily sleep,
  and agenda-rating algorithms with deterministic indexed reads and focused
  authorization, range, ordering, empty, and DST coverage.
- Installed Recharts and built the responsive Insights field atlas. Every
  visual chart is paired with a visible exact list or table, uses no animation,
  and composes the reusable body notebook.
- Expanded `NotebookHeader` to six tabs, added protected dog-keyed Timeline and
  Insights routes, split Insights/Recharts into a lazy production chunk, and
  updated the Dashboard footer to name sharing and dog switching next.
- Fixed reviewed milestone 7 P1s for value-only Body timestamp truncation,
  immediate pristine Timeline timezone synchronization, and keyboard-visible
  Timeline filter focus; also replaced the per-event potty `Intl` formatter
  flagged by React Doctor with direct zoned-hour lookup.
- Extended the daily-driver through Timeline and Insights and verified both
  pages in a real browser at exact mobile and desktop widths.
- Hardened `dogs.listMine` into a bounded deterministic multi-dog contract with
  role preservation, duplicate handling, and a 100-membership ceiling shared
  by onboarding and invite redemption.
- Added App-owned dog selection and a shared selection context so every
  dog-keyed route remounts safely while explicit selections survive reactive
  insertions and removed memberships fall back deterministically.
- Added secure household member and invite APIs with one cryptographic active
  code, collision retry, transactional/idempotent redemption, user/household
  caps, a reactive active-invite query, and delete-on-revoke rotation.
- Added dogless invite joining to onboarding and a reusable redemption form,
  plus a protected Household Settings page for switching dogs, listing
  members, creating/revoking codes, and joining another notebook.
- Extended the existing Playwright daily-driver through a separate-account
  join and proved new-member logging reaches the owner's live activity stream.
- Added a separate indexed `userPreferences` contract for authenticated `en` or
  `sk` selection, including deterministic duplicate repair, a bounded corruption
  guard, concurrent-write serialization, and account isolation.
- Installed i18next/react-i18next and migrated all product-owned copy into typed,
  namespaced English and Slovak catalogs with structural parity tests.
- Added explicit native `Intl` formatting for locale-aware dates, numbers,
  durations, units, charts, and Slovak plurals while retaining dog-timezone
  bucketing and technical date keys.
- Made locale bootstrap persist a first authenticated browser fallback, wait
  before protected rendering, reset cleanly across account/sign-out changes,
  and synchronize `<html lang>`, title, and description metadata.
- Localized built-in activities once during onboarding seeding and preserved
  every user-authored and already-shared value verbatim.
- Evolved the existing `/settings` route into Personal + Household Settings
  with immediate language switching, optimistic persistence, failure reversion,
  and all milestone 8 sharing and dog-switch behavior intact.
- Extended the single Playwright daily-driver through immediate/reloaded/two-tab
  Slovak persistence and a separate English account, then completed exact-width
  English/Slovak browser QA across Settings, Dashboard, and Insights.
- Added `vite-plugin-pwa`, production manifest/icons, an app-shell-only Workbox
  service worker, mobile metadata, a reconnecting banner, and Settings install
  guidance in English and Slovak.
- Lazy-loaded every secondary route while keeping Dashboard and locale catalogs
  synchronous, removing the previous >500 kB initial-chunk warning.
- Added a production-only Playwright PWA shell test and complete local,
  Cloudflare Pages, Convex production, verification, and rollback runbooks.

## Files changed

- Project/tooling: `package.json`, `package-lock.json`, `.gitignore`,
  `.prettierignore`, `index.html`, `components.json`, `eslint.config.js`,
  `vite.config.ts`, `vitest.config.ts`, and all `tsconfig*.json` files.
- Frontend: `src/App.tsx`, `src/App.test.tsx`, `src/index.css`, `src/main.tsx`,
  `src/vite-env.d.ts`, `src/components/ui/button.tsx`, `src/lib/utils.ts`, and
  `src/test/setup.ts`.
- Backend: `convex/schema.ts`, `convex/schema.test.ts`, `convex/tsconfig.json`,
  and `convex/_generated/*`.
- Durable state: all Markdown files in `ai/` plus milestone 1 and milestone 2
  screenshots under `ai/screenshots/`.

### Milestone 2

- Dependencies/config: `package.json`, `package-lock.json`,
  `tsconfig.convex.json`, and `convex/tsconfig.json`.
- Backend: `convex/auth.config.ts`, `convex/auth.ts`, `convex/http.ts`,
  `convex/lib/auth.ts`, `convex/lib/functions.ts`,
  `convex/lib/mealRoutines.ts`, `convex/users.ts`, `convex/dogs.ts`,
  `convex/routines.ts`, `convex/onboarding.ts`, `convex/schema.ts`, and
  generated bindings under `convex/_generated/`.
- Backend tests: `convex/auth.test.ts`, `convex/users.test.ts`,
  `convex/dogs.test.ts`, `convex/routines.test.ts`,
  `convex/onboarding.test.ts`, and `convex/schema.test.ts`.
- Frontend: `src/main.tsx`, `src/App.tsx`, `src/App.test.tsx`,
  `src/pages/OnboardingPage.tsx`, and `src/pages/OnboardingPage.test.tsx`.
- Durable state: `ai/decisions.md`, `ai/implementation-progress.md`,
  `ai/known-issues.md`, `ai/test-results.md`, and the three milestone 2
  screenshots.

### Milestone 3

- Dependencies/config: `package.json`, `package-lock.json`, `.gitignore`,
  `tsconfig.node.json`, `playwright.config.ts`, `e2e/README.md`, and
  `e2e/daily-driver.spec.ts`.
- Backend: `convex/schema.ts`, `convex/events.ts`, `convex/events.test.ts`, and
  regenerated bindings under `convex/_generated/`.
- Frontend: `src/App.tsx`, `src/App.test.tsx`,
  `src/pages/DashboardPage.tsx`, `src/pages/DashboardPage.test.tsx`,
  `src/lib/timers.ts`, `src/lib/timers.test.ts`,
  `src/lib/mealCountdown.ts`, `src/lib/mealCountdown.test.ts`,
  `src/lib/zonedDateTime.ts`, and `src/lib/zonedDateTime.test.ts`.
- Durable state: all four Markdown files in `ai/` and
  `ai/screenshots/milestone-3-dashboard-desktop.png` plus
  `ai/screenshots/milestone-3-dashboard-mobile.png`.

### Milestone 4

- Backend: `convex/schema.ts`, `convex/lib/events.ts`, `convex/lib/rest.ts`,
  `convex/events.ts`, `convex/walks.ts`, and regenerated bindings under
  `convex/_generated/`.
- Backend tests: `convex/events.test.ts`, `convex/rest.test.ts`, and
  `convex/walks.test.ts`.
- Frontend: `src/pages/DashboardPage.tsx`,
  `src/pages/DashboardPage.test.tsx`, and related app test fixtures.
- E2E: `e2e/daily-driver.spec.ts` and `e2e/README.md`.
- Durable state: all four Markdown files in `ai/` and
  `ai/screenshots/milestone-4-dashboard-desktop.png` plus
  `ai/screenshots/milestone-4-dashboard-mobile.png`.

### Milestone 5

- Backend: `convex/schema.ts`, `convex/activityTypes.ts`, `convex/training.ts`,
  `convex/events.ts`, shared backend helpers, and regenerated bindings under
  `convex/_generated/`.
- Backend tests: `convex/activityTypes.test.ts`, `convex/training.test.ts`,
  `convex/events.test.ts`, and schema coverage.
- Frontend: `src/components/NotebookHeader.tsx`, `src/App.tsx`,
  `src/pages/EnrichmentPage.tsx`, `src/pages/TrainingPage.tsx`,
  `src/pages/DashboardPage.tsx`, and their component tests.
- E2E and test stability: `e2e/daily-driver.spec.ts` and the test-only
  `beforeunload` helper in `src/pages/OnboardingPage.test.tsx`.
- Durable state: all four Markdown files in `ai/` and the four milestone 5
  Enrichment/Training mobile and desktop screenshots under `ai/screenshots/`.

### Milestone 6

- Backend: `convex/schema.ts`, `convex/agenda.ts`, and regenerated bindings
  under `convex/_generated/`.
- Backend tests: `convex/agenda.test.ts` and schema coverage.
- Frontend: `src/App.tsx`, `src/components/NotebookHeader.tsx`,
  `src/pages/AgendaPage.tsx`, `src/pages/DashboardPage.tsx`,
  `src/lib/zonedDateTime.ts`, and their focused tests.
- E2E: the agenda and Dashboard-summary continuation in
  `e2e/daily-driver.spec.ts`.
- Durable state: all four Markdown files in `ai/` plus
  `ai/screenshots/milestone-6-agenda-mobile.png` and
  `ai/screenshots/milestone-6-agenda-desktop.png`.

### Milestone 7

- Dependencies: `package.json` and `package-lock.json` for Recharts.
- Backend: `convex/timeline.ts`, `convex/bodyMetrics.ts`, `convex/insights.ts`,
  `convex/lib/insights.ts`, and regenerated bindings under
  `convex/_generated/`.
- Backend and utility tests: focused Timeline, body-metric, insight, schema,
  and zoned-day-window coverage.
- Frontend: `src/App.tsx`, `src/components/NotebookHeader.tsx`,
  `src/components/BodyMetricsPanel.tsx`, `src/components/insights/*`,
  `src/pages/TimelinePage.tsx`, `src/pages/InsightsPage.tsx`,
  `src/pages/DashboardPage.tsx`, `src/lib/zonedDateTime.ts`, and their tests.
- E2E: the Timeline and Insights continuation in
  `e2e/daily-driver.spec.ts` plus its README.
- Durable state: all four Markdown files in `ai/` plus
  `ai/screenshots/milestone-7-timeline-mobile.png`,
  `ai/screenshots/milestone-7-timeline-desktop.png`,
  `ai/screenshots/milestone-7-insights-mobile.png`, and
  `ai/screenshots/milestone-7-insights-desktop.png`.

### Milestone 8

- Backend: `convex/schema.ts`, `convex/dogs.ts`, `convex/onboarding.ts`,
  `convex/sharing.ts`, and regenerated bindings under `convex/_generated/`.
- Backend tests: `convex/dogs.test.ts`, `convex/onboarding.test.ts`, and
  `convex/sharing.test.ts`.
- Frontend: `src/App.tsx`, `src/contexts/DogSelectionContext.tsx`,
  `src/components/NotebookHeader.tsx`,
  `src/components/RedeemInviteForm.tsx`, `src/pages/OnboardingPage.tsx`, and
  `src/pages/SettingsPage.tsx`, plus the milestone-handoff copy in
  `src/pages/DashboardPage.tsx`.
- Frontend tests: `src/App.test.tsx`,
  `src/components/NotebookHeader.test.tsx`,
  `src/components/RedeemInviteForm.test.tsx`,
  `src/pages/OnboardingPage.test.tsx`, and
  `src/pages/SettingsPage.test.tsx`, plus the matching assertion in
  `src/pages/DashboardPage.test.tsx`.
- E2E: the separate-account sharing continuation in
  `e2e/daily-driver.spec.ts` plus its README.
- Durable state: `ai/decisions.md`, `ai/implementation-progress.md`,
  `ai/known-issues.md`, and `ai/test-results.md`.

### Milestone 9

- Dependencies/config: `package.json` and `package-lock.json` for `i18next`
  26.3.6 and `react-i18next` 17.0.9.
- Backend: `convex/schema.ts`, `convex/preferences.ts`,
  `convex/onboarding.ts`, and regenerated bindings under
  `convex/_generated/`.
- Backend tests: `convex/preferences.test.ts`, `convex/onboarding.test.ts`, and
  schema coverage.
- Localization foundation: every file under `src/i18n/`, including typed
  English/Slovak catalogs for `app`, `common`, `dashboard`, `onboarding`,
  `agenda`, `timeline`, `insights`, `enrichment`, `training`, and `settings`.
- Frontend: `src/main.tsx`, `src/App.tsx`,
  `src/components/NotebookHeader.tsx`,
  `src/components/RedeemInviteForm.tsx`,
  `src/components/BodyMetricsPanel.tsx`,
  `src/components/insights/ChartCard.tsx`,
  `src/components/insights/InsightCharts.tsx`, every file under `src/pages/`,
  and locale-aware timer formatting in `src/lib/timers.ts`.
- Frontend tests: `src/i18n/i18n.test.ts`, the matching App/component/page
  tests, and timer-formatting coverage.
- E2E: the localization/account-isolation continuation in
  `e2e/daily-driver.spec.ts` plus its README.
- Durable state: `ai/decisions.md`, `ai/implementation-progress.md`,
  `ai/known-issues.md`, and `ai/test-results.md`. Browser captures were
  inspected in-tool and no durable screenshot paths are claimed.

### Milestone 10

- PWA/config: `package.json`, `package-lock.json`, `vite.config.ts`,
  `index.html`, and every asset under `public/`.
- Runtime UX/performance: `src/App.tsx`, `src/App.test.tsx`,
  `src/components/ConnectivityStatus.tsx`,
  `src/components/InstallAppSection.tsx`, `src/hooks/useInstallPrompt.ts`,
  `src/pages/SettingsPage.tsx`, `src/pages/SettingsPage.test.tsx`, and the
  English/Slovak `app` and `settings` catalogs.
- Deployment/testing: `.env.example`, `README.md`, `e2e/pwa-shell.spec.ts`, and
  `e2e/README.md`.
- Durable state: `ai/decisions.md`, `ai/implementation-progress.md`,
  `ai/known-issues.md`, and `ai/test-results.md`. Browser captures were
  inspected in-tool and no durable milestone 10 screenshot paths are claimed.

## Current status

Milestones 1–10 are complete. The local app is a usable
daily-driver: a new user can sign up, onboard a dog, manage daily events, track
walks with linked potty logs and a diary, alternate awake/asleep state, manage
enrichment activities and training commands/sessions, plan and reflect on a
reactive daily agenda, read a filterable local-day Timeline, record body
measurements, inspect accessible routine insights, switch among multiple dogs,
invite and list household members, join a dog without duplicate onboarding, see
household changes across separate accounts, use the entire product in English
or Slovak with a persisted account preference, and exercise the complete flow
through Playwright. It is also an installable, online-data PWA with a cached
shell, truthful reconnect/install UX, verified desktop layouts, and documented
managed Convex + Cloudflare Pages deployment and rollback procedures.
The user-facing product and install metadata are branded Pawgress; the local
`zoe-tracker` directory and existing Convex project/deployment identifiers stay
unchanged because they are infrastructure identity, not product copy.

## Next action

No implementation milestone remains. The next step requires explicit operator
authorization: provision/verify production Convex Auth values, connect the
reviewed repository to Cloudflare Pages, deploy, and complete the documented
real iOS/Android install plus background-reconnection pass.

## Exact next prompt

> Read `README.md` and every file in `ai/`, confirm the reviewed commit/branch
> and obtain explicit authorization before changing any external resource.
> Follow the production Convex/Auth and Cloudflare Pages runbook, keep preview
> environments isolated from production data, run the production smoke checks,
> and complete the real iOS/Android install and background-reconnection pass.
