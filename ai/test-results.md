# Test results

## 2026-07-09 — Environment

- Node.js: `v24.11.1`
- npm: `11.6.2`
- Convex: `1.42.1`
- Local Convex deployment: ready at `http://127.0.0.1:3210`

## 2026-07-09 — Milestone 1 final verification

- `npm run format:check` — pass.
- `npm run lint` — pass with zero warnings.
- `npm run typecheck` — pass.
- `npm run test:run` — pass, 2 files and 2 tests.
- `npm run build` — pass with Vite 8.1.4.
  - JS: 268.40 kB / 85.71 kB gzip.
  - CSS: 23.22 kB / 5.34 kB gzip.
- `npx -y react-doctor@latest . --verbose --scope changed` — 100/100,
  no issues.
- `npm audit` during installs — 0 vulnerabilities.

## Browser verification

- Desktop at 1280×900:
  - Page width and document scroll width both 1280; no horizontal overflow.
  - No console errors or warnings.
  - “View the foundation” resolved uniquely, clicked successfully, and set
    `#foundation`.
  - Screenshot: `ai/screenshots/milestone-1-desktop.png`.
- Mobile at 390×844:
  - Page width and document scroll width both 390; no horizontal overflow.
  - Header stayed on one line after the responsive polish pass.
  - No console errors or warnings.
  - Screenshot: `ai/screenshots/milestone-1-mobile.png`.

## Failures found and resolved

- TypeScript 6 rejected deprecated `baseUrl`; removed it because `paths` no
  longer requires it.
- The Convex smoke test initially lacked generated API modules; configured a
  local deployment and ran codegen through `convex dev`.
- Vite 8 did not expand the older documented extglob pattern used for Convex
  test modules; replaced it with `./**/*.*s`, which includes generated files.
- React Doctor reported the shadcn button's unused `buttonVariants` export;
  removed the export and restored a clean 100/100 scan.

## 2026-07-09 — Milestone 2 auth backend slice

- `npm run convex:codegen` — pass; auth functions and schema uploaded to the
  configured local deployment and bindings regenerated.
- `npm run format:check` — pass.
- `npm run lint` — pass with zero warnings.
- `npm run typecheck` — pass.
- `npm run test:run` — pass, 4 files and 5 tests.
  - Password sign-up creates one user/account/session and returns a JWT.
  - Password sign-in with the same credentials creates a second session and
    returns a JWT.
  - Password sign-in rejects an incorrect password.
  - Protected current-user access rejects a signed-out caller.
  - An auth identity resolves its matching user document.
  - The schema accepts an Auth-owned table write.
- `npm run build` — pass with Vite 8.1.4.
  - JS: 268.40 kB / 85.71 kB gzip.
  - CSS: 23.22 kB / 5.34 kB gzip.
- `npm audit` — 0 vulnerabilities.

### Failures found and resolved

- Convex Auth 0.0.94 exposes `Password` as a named export; changed the import
  after codegen rejected the default-export form shown by an older example.
- TypeScript 6 required explicit Node types and a non-null environment value in
  `auth.config.ts`; added the backend-only type configuration and assertion.

## 2026-07-09 — Milestone 2 final verification

- `npm run convex:codegen` — pass against the configured local deployment.
- `npm run format:check` — pass.
- `npm run lint` — pass with zero warnings.
- `npm run typecheck` — pass.
- `npm run test:run` — pass, 8 files and 65 tests.
  - Password authentication canonicalizes and validates email addresses.
  - Authenticated and dog-membership wrappers reject unauthorized access.
  - Dog and routine APIs cover owner/member access and non-member rejection.
  - Routine replacement and onboarding input bounds are covered.
  - Atomic onboarding creates the complete graph and invalid input leaves all
    five domain tables empty.
  - React tests cover auth resolution, login/sign-up, redirect states, wizard
    validation/navigation, and the dog-aware dashboard.
- `npm run build` — pass with Vite 8.1.4.
  - JS: 375.13 kB / 114.47 kB gzip.
  - CSS: 29.37 kB / 6.36 kB gzip.
- `npx -y react-doctor@latest . --verbose --scope changed` — 100/100,
  no issues.
- `npm audit` — 0 vulnerabilities.

### Browser verification

- Completed the real local flow: Password sign-up → `/onboarding` → atomic
  setup → reactive redirect to `/`.
- The dashboard rendered `Good morning, Zoe QA.` from the created dog record.
- Browser console contained no errors or warnings throughout the flow.
- Widths 320, 390, and 1280 had no horizontal overflow.
- Screenshots:
  - `ai/screenshots/milestone-2-login-mobile.png`
  - `ai/screenshots/milestone-2-onboarding.png`
  - `ai/screenshots/milestone-2-dashboard.png`

### Local data note

- Browser QA created one account and one dog in the local Convex development
  data. No credentials are recorded in the repository or durable notes.

## 2026-07-09 — Milestone 3 final verification

- `npm run convex:codegen` — pass against the configured local deployment.
- `npm run format:check` — pass.
- `npm run lint` — pass with zero warnings.
- `npm run typecheck` — pass.
- `npm run test:run` — pass, 13 files and 133 tests.
  - Event authorization, attribution, ordering, latest-per-kind, update,
    idempotent deletion, timestamp hardening, and input bounds are covered.
  - Timer, meal-countdown, and zoned datetime helpers cover normal, invalid,
    timezone-different, leap-day, midnight, and spring/fall DST behavior.
  - Dashboard component tests cover six quick actions, timer derivation,
    backdating, field validation, editing, confirmed deletion, undo,
    accessibility, and concurrency guards.
- `npm run e2e` — pass, 1/1 Chromium test in 3.2 seconds.
  - The real test signs up and onboards a unique household, opens a second
    authenticated page, observes Pee within one second with timer/latest
    context, logs a Meal, backdates and edits a Treat, confirms deletion, and
    undoes a disposable event.
- `npm run build` — pass with Vite 8.1.4.
  - JS: 396.75 kB / 120.23 kB gzip.
  - CSS: 28.70 kB / 6.11 kB gzip.
- `npx -y react-doctor@latest . --verbose --scope changed` — 100/100,
  no issues.
- `npm audit` — 0 vulnerabilities.

### Browser verification

- Dashboard checks at widths 390 and 1280 had no horizontal overflow.
- Browser console contained no errors or warnings.
- Screenshots:
  - `ai/screenshots/milestone-3-dashboard-desktop.png`
  - `ai/screenshots/milestone-3-dashboard-mobile.png`

### Local data note

- Playwright and milestone 3 browser QA created disposable accounts, dogs, and
  events in the local Convex development data. No credentials are recorded.

## 2026-07-10 — Milestone 4 final verification

- `npm run convex:codegen` — pass against the configured local deployment.
- `npm run format:check` — pass.
- `npm run lint` — pass with zero warnings.
- `npm run typecheck` — pass.
- `npm run test:run` — pass, 15 files and 215 tests.
  - Walk coverage includes authorization, one-active-walk concurrency,
    backdated interval overlap, authoritative idempotent completion, diary
    semantics, linked-potty bounds, the 100-event cap, generic timestamp edits,
    adjacent walks, transactional detachment, and concurrent end/log and
    start/edit races.
  - Rest coverage includes initial state, chronological alternation,
    backdating, same-timestamp rejection, movement, deletion, authorization,
    and concurrent household transitions.
  - Dashboard coverage includes current/backdated walk controls, ticking
    current/completed timers, diary editing, during-walk context, rest-state
    control availability, operation locks, reactive states, and accessibility.
- `npm run e2e` — pass, 1/1 Chromium daily-driver test.
  - The existing account, dog, page, and second page verify a live active walk
    and current timer, linked Pee with `During walk`, diary synchronization,
    completion duration/diary and `Since last walk` on both pages, then
    asleep/awake state and inverse rest controls without fixed sleeps.
- `npm run build` — pass with Vite 8.1.4.
  - JS: 410.90 kB / 123.60 kB gzip.
  - CSS: 30.72 kB / 6.30 kB gzip.
- `npx -y react-doctor@latest . --verbose --scope changed` — 100/100,
  no issues.
- `npm audit` — 0 vulnerabilities.

### Browser verification

- Final desktop and mobile dashboard flows were verified at viewport widths
  1280 and 390 respectively.
- At both widths, viewport and DOM document widths matched and there was no
  horizontal overflow.
- Browser console contained no errors or warnings.
- An apparent concern that the mobile screenshot had captured a desktop-sized
  layout was disproven by a direct viewport capture and measured viewport,
  body, and document widths; all were 390 for the mobile pass.
- Screenshots:
  - `ai/screenshots/milestone-4-dashboard-desktop.png`
  - `ai/screenshots/milestone-4-dashboard-mobile.png`

### Local data note

- Milestone 4 Playwright and browser QA created disposable accounts, dogs,
  walk/rest events, diary notes, and linked potty logs in local Convex data.
  This local data is intentionally disposable; no credentials are recorded.

## 2026-07-10 — Milestone 5 final verification

- `npm run convex:codegen` — pass against the configured local deployment.
- `npm run format:check` — pass.
- `npm run lint` — pass with zero warnings.
- `npm run typecheck` — pass.
- `npm run test:run` — pass, 20 files and 267 tests.
  - Activity-type and Play coverage includes authorization, cross-dog IDs,
    normalization, duplicate/cap bounds, archive/restore, historical lookup,
    current/backdated logs, notes, intervals, and safe generic Play edits.
  - Training coverage includes schema/index contracts, authorization,
    command limits and uniqueness, partial updates, every status, archive and
    restore behavior, rated session validation, timestamps, and bounded newest
    history.
  - Enrichment and Training component coverage includes loading/empty/archived
    states, validation and focus, shared locks, reactive archive races, stale
    selections, malformed deep links, keyed session drafts, and collaborator-
    safe per-field touched edits.
  - The test-only Onboarding `beforeunload` helper was stabilized after a full
    suite ordering flake; production code did not change.
- `npm run build` — pass with Vite 8.1.4.
  - JS: 449.80 kB / 131.80 kB gzip.
  - CSS: 37.73 kB / 7.14 kB gzip.
- `npm run e2e` — pass, 1/1 Chromium daily-driver test in 6.9 seconds.
  - The existing two authenticated pages verify Cafe visit creation, immediate
    Play logging, realtime Dashboard history, archive removal from new-log
    choices with retained history, Recall creation and guidance, reactive
    status changes, and rated training session history.
- `npm audit` — 0 vulnerabilities.
- `npx -y react-doctor@latest . --verbose --diff` — 87/100, no errors and
  exactly two reviewed non-blocking TrainingPage advisories: large component
  and prefer `useReducer`.

### Browser verification

- Enrichment and Training were verified at exact 390- and 1280-pixel viewport
  widths; viewport and document widths matched with no horizontal overflow.
- Browser console contained no errors or warnings.
- Screenshots:
  - `ai/screenshots/milestone-5-enrichment-mobile.png`
  - `ai/screenshots/milestone-5-enrichment-desktop.png`
  - `ai/screenshots/milestone-5-training-mobile.png`
  - `ai/screenshots/milestone-5-training-desktop.png`
- Full-page capture produced a tooling artifact, so the recorded screenshots
  use tall fixed viewports. Exact width, overflow, and console checks were
  measured independently of the capture mode.

### Local data note

- Milestone 5 browser and Playwright QA created disposable activity types, Play
  events, training commands, and sessions in local Convex data. No credentials
  are recorded, and the local QA data may be cleared at any time.

## 2026-07-10 — Milestone 6 final verification

- `npm run convex:codegen` — pass against the configured local deployment.
- `npm run format:check` — pass.
- `npm run lint` — pass with zero warnings.
- `npm run typecheck` — pass.
- `npm run test:run` — pass, 22 files and 303 tests.
  - Agenda backend coverage includes membership/cross-dog rejection, date
    validation, one-day uniqueness, today-only writes, yesterday reads,
    normalization and bounds, stable goal IDs, idempotent removal, category
    caps, and simultaneous creation/toggle/cap races.
  - Agenda/Dashboard component coverage includes day rollover and invalid-zone
    query skipping, loading/empty states, complete read-only yesterday history,
    goal/reflection validation, shared locks, reactive collaborator drafts,
    clear/null payloads, remote races, Dashboard summary, and backend-maximum
    unbroken historical content.
  - Zoned-date coverage includes local calendar subtraction across DST,
    host-independent non-ambiguous parsing, gap rejection, earliest overlap
    choice, invalid zones/epochs, leap/year edges, and alternate host zones.
- `npm run build` — pass with Vite 8.1.4.
  - JS: 468.08 kB / 135.74 kB gzip.
  - CSS: 39.30 kB / 7.33 kB gzip.
- `npm run e2e` — pass, 1/1 Chromium daily-driver test in 7.7 seconds.
  - The existing two authenticated pages verify enrichment/training goals,
    cross-page completion, win/rating/diary synchronization, and the completed
    Dashboard agenda summary without fixed sleeps.
- `npm audit` — 0 vulnerabilities.
- `npx -y react-doctor@latest . --verbose --diff` — 87/100, no Agenda/parser
  errors and exactly two reviewed non-blocking TrainingPage advisories: large
  component and prefer `useReducer`.

### Parser adversarial verification

- All 13 zoned datetime tests passed in the normal environment and with
  `TZ=America/Los_Angeles` and `TZ=Pacific/Auckland`.
- A read-only exhaustive scan covered all 418 runtime-supported IANA zones and
  42,344 gap/overlap transitions from 1900–2100 with zero mismatches.
- Four-digit boundary round-trips succeeded across all supported zones. The
  candidate search is fixed-cost and its two temporary React Doctor performance
  advisories were removed without changing semantics.

### Browser verification

- Agenda was verified at exact 390- and 1280-pixel viewport widths; viewport
  and document widths matched with no horizontal overflow.
- Browser console contained no errors or warnings.
- Maximum-valid unbroken goal, win, and diary content retains readable wrapping
  in the read-only yesterday sidebar.
- Screenshots:
  - `ai/screenshots/milestone-6-agenda-mobile.png`
  - `ai/screenshots/milestone-6-agenda-desktop.png`
- Screenshots use the established tall fixed-viewport capture method; width,
  overflow, and console checks were measured independently.

### Local data note

- Milestone 6 browser and Playwright QA created disposable agenda goals,
  completion state, wins, ratings, and diary notes in local Convex data. No
  credentials are recorded, and the local QA data may be cleared at any time.

## 2026-07-10 — Milestone 7 final verification

- `npm run convex:codegen` — pass against the configured local deployment.
- `npm run format:check` — pass.
- `npm run lint` — pass with zero warnings.
- `npm run typecheck` — pass.
- `npm run test:run` — pass, 30 files and 375 tests.
  - Timeline coverage includes authorization, exact local-day/DST windows,
    newest-first pagination, unique kind filters, page and 500-row scan bounds,
    invalid windows, reactive resets, rollover, metadata, archived Play labels,
    loading/empty/load-more states, keyboard focus, and long text.
  - Body coverage includes authorization, bounded newest history, create,
    partial update, explicit clearing, idempotent removal, validation, dog-local
    age rollover, operation locks, reactive keyed drafts, and exact timestamp
    preservation for untouched and value-only edits.
  - Insight coverage includes bounded indexed reads, 24 dog-local potty buckets,
    walk intervals with meal markers, sleep splitting and seed state, inclusive
    day ratings, malformed ranges, empty data, ordering, DST, and event limits.
  - Frontend coverage includes accessible textual equivalents for every chart,
    responsive six-tab navigation, protected Timeline and lazy Insights routes,
    query contracts, loading/empty/error states, and Dashboard handoff copy.
- `npm run build` — pass with Vite 8.1.4.
  - CSS: 45.39 kB / 8.24 kB gzip.
  - Initial JS: 481.12 kB / 139.19 kB gzip.
  - Lazy Insights/Recharts JS: 406.44 kB / 115.88 kB gzip.
- `npm run e2e` — pass, 1/1 Chromium daily-driver test in 9.7 seconds.
  - The existing authenticated flow verifies the current-day Timeline,
    Pee-only filtering, body measurement creation, chronological weight data,
    and potty-hour evidence on Insights without another setup flow.
- `npm audit` — 0 vulnerabilities.
- `npx -y react-doctor@latest . --verbose --scope full` — 85/100 with exactly
  three reviewed warnings and no milestone 7 correctness defect.
  - The Recharts eager-import warning is disproven by the emitted separate
    Insights/Recharts chunk; the initial chunk contains only its dynamic import
    reference, not chart implementation.
  - The existing TrainingPage large-component and related-state/`useReducer`
    advisories remain non-blocking maintainability hypotheses.

### Reviewed failures found and resolved

- Body edits initially reparsed an untouched minute-precision control and
  truncated stored timestamp seconds/milliseconds during value-only updates.
  Timestamp parsing and submission now require an explicit time-field touch.
- Timeline initially waited for the next 30-second tick after a pristine
  timezone change and hid keyboard focus inside `sr-only` filter checkboxes.
  It now synchronizes immediately and draws focus on each visible filter pill.
- React Doctor flagged a per-event potty-hour `Intl.DateTimeFormat`; direct
  `TZDateMini#getHours` lookup now preserves dog-local bucketing without
  rebuilding a formatter.

### Browser verification

- Timeline and Insights were verified at exact 390- and 1280-pixel viewport
  widths. Viewport and document widths matched with no horizontal overflow.
- Browser consoles contained no errors or warnings at either width.
- Timeline retained readable long notes, complete metadata, filter controls,
  pagination states, and 44-pixel targets. Insights retained responsive chart
  canvases, visible textual data, body forms/history, and unbroken long content.
- Screenshots:
  - `ai/screenshots/milestone-7-timeline-mobile.png`
  - `ai/screenshots/milestone-7-timeline-desktop.png`
  - `ai/screenshots/milestone-7-insights-mobile.png`
  - `ai/screenshots/milestone-7-insights-desktop.png`
- Screenshots use tall fixed viewports; exact widths, overflow, and console
  checks were measured independently of capture height.

### Local data note

- Milestone 7 Playwright and browser QA created disposable accounts, Timeline
  events, agenda reflections, and body measurements in local Convex data. No
  credentials are recorded, and the data may be cleared at any time.

## 2026-07-10 — Milestone 8 final verification

- `npm run convex:codegen` — pass against the configured local deployment;
  sharing functions were uploaded and TypeScript bindings regenerated.
- `npm run format:check` — pass.
- `npm run lint` — pass with zero warnings.
- `npm run typecheck` — pass.
- `npm run test:run` — pass, 33 files and 418 tests.
  - Multi-dog coverage includes bounded indexed membership reads,
    deterministic ordering/tie-breaks, exact roles, duplicate/conflicting
    memberships, dangling dogs, overflow, active-choice latching, inserted-dog
    races, active removal, route remounts, and dog-keyed Settings navigation.
  - Sharing backend coverage includes signed-out/non-member rejection, minimum
    member profiles, cryptographic code shape and collision retry, one-active
    generation, reactive active-invite state, revoke/rotation, malformed,
    unknown, consumed, and revoked codes, idempotent redemption/revocation,
    user and household caps, rollback, and generation/redemption/revocation
    concurrency.
  - Frontend coverage includes dogless onboarding redemption, the reusable join
    form, dog switching, Settings loading/error/confirmation/operation locks,
    reactive member and invite states, long content, and 44-pixel controls.
- `npm run build` — pass with Vite 8.1.4 and 999 transformed modules.
  - CSS: 47.66 kB / 8.45 kB gzip.
  - Initial JS: 494.53 kB / 141.99 kB gzip.
  - Lazy Insights/Recharts JS: 406.44 kB / 115.88 kB gzip.
- `npm audit` — 0 vulnerabilities.
- `npm run e2e` — pass, 1/1 Chromium daily-driver test in 10.5 seconds.
  - The existing journey creates an active invite, signs up a genuinely
    separate account in an isolated browser context, joins from dogless
    onboarding, reaches the shared dog immediately, updates the owner's member
    list reactively, and sends a Pee log to the owner's activity stream within
    one second.
- React Doctor output was reviewed. The existing lazy-Recharts false positive
  and two TrainingPage maintainability advisories remain non-blocking; no M8
  correctness defect was identified.

### Failure found and resolved

- The final E2E extension initially failed because it still searched for the
  stale `Reveal` invite-button label after the finished Settings interaction
  named the action `Create invite code`. Updating the locator to `Create`
  restored the passing end-to-end flow; product behavior did not change.

### Browser verification

- Settings, dog switching, and sharing flows were visually inspected at exact
  390- and 1280-pixel viewport widths. Viewport and document widths matched,
  with no horizontal overflow or visual outliers.
- Interactive controls measured at least 44 pixels, long member/invite content
  remained contained, and browser consoles contained no errors or warnings.
- Active invite creation and confirmed revocation were exercised directly;
  the reactive UI moved from no code, to the created code, and back to no code.
- Visual captures were inspected in-tool. Final PNG persistence timed out in
  the browser capture path, so no durable M8 screenshot filenames are recorded.

### Local data note

- Milestone 8 Playwright and browser QA created disposable accounts, dogs,
  memberships, invites, and events in local Convex data. No credentials are
  recorded, and the data may be cleared at any time.

## 2026-07-10 — Milestone 9 planning insertion

- This was a planning and handoff update, not localization implementation.
- `npm run format:check` — pass.
- `npm run lint` — pass with zero warnings.
- `npm run typecheck` — pass.
- `npx vitest run src/pages/DashboardPage.test.tsx` — pass, 97/97 tests.
- Updated the Dashboard handoff to name Slovak localization and personal
  settings as milestone 9. No runtime localization or preference behavior is
  claimed yet.

## 2026-07-10 — Milestone 9 final verification

- `npm run convex:codegen` — pass against the configured local deployment;
  preference APIs were uploaded and TypeScript bindings regenerated.
- `npm run format:check` — pass.
- `npm run lint` — pass with zero warnings.
- `npm run typecheck` — pass.
- `npm run test:run` — pass, 35 files and 465 tests.
  - Preference coverage includes authentication, strict locale validation,
    idempotent one-record persistence, account isolation, concurrent first
    writes/updates, deterministic duplicate reads and repair, and bounded
    corruption rejection without partial writes.
  - Localization coverage includes English/Slovak catalog key parity and
    non-empty leaves, browser fallback, authenticated no-flash bootstrap,
    first-choice persistence/retry, sign-out/account reset, document metadata,
    dates, numbers, durations, plurals, all routes, ARIA/status/error copy, and
    verbatim shared values.
  - Settings coverage includes Personal + Household composition, immediate
    language switching, operation locking, persistence success, translated
    failure reversion/focus, and unchanged milestone 8 member/invite/join/dog
    behavior.
- `npm run build` — pass with Vite 8.1.4 and 1,048 transformed modules.
  - CSS: 47.73 kB / 8.46 kB gzip.
  - Initial JS: 612.16 kB / 176.72 kB gzip.
  - Lazy Insights/Recharts JS: 406.26 kB / 115.39 kB gzip.
  - Vite's >500 kB initial-chunk warning is recorded for milestone 10
    performance review; synchronous locale bootstrap and catalogs remain
    correct.
- `npm audit` — 0 vulnerabilities.
- `npm run e2e` — pass, 1/1 Chromium daily-driver test in 13.1 seconds.
  - The owner switches to Slovak immediately, retains it after reload and in a
    second authenticated tab, and continues to see authored/shared English
    notebook values verbatim.
  - The separate invited account remains in English after reload, proving the
    preference is user-scoped rather than household- or dog-scoped.
- `npx -y react-doctor@latest . --verbose --scope full` — 87/100. The
  milestone 9 per-call `Intl` formatter warning was fixed. The lazy-Recharts
  false positive plus Settings/Training component-size and Training related-
  state hypotheses remain reviewed, non-blocking advisories.

### Transient E2E migrations resolved

- Catalog migration temporarily left the daily-driver using stale English and
  pre-final destination labels while the rendered accessible names changed.
  Locators were migrated alongside the finished catalogs; these were test
  selector migrations, not product regressions.
- The final locator collision was fixed by requiring the exact Slovak `Opis`
  label (`getByLabel("Opis", { exact: true })`) after the second tab switched
  language. The completed E2E run uses only the final accessible labels.

### Browser verification

- Settings, Dashboard, and Insights were inspected at exact 390- and
  1280-pixel viewport widths in both English and Slovak.
- Immediate language changes, persisted reload state, `<html lang>`, Slovak
  decimal/date/plural output, translated ARIA labels, and verbatim user/shared
  values were visually verified.
- Viewport and document widths matched with no horizontal overflow. Browser
  consoles contained no errors or warnings.
- Interactive controls measured at least 44 pixels through their associated
  labels. The only clipped elements were intentional decorative transforms;
  no content or control was clipped.
- Screenshots were inspected in-tool. No durable milestone 9 screenshot paths
  are claimed.

### Local data note

- Milestone 9 Playwright and browser QA created disposable accounts,
  preferences, dogs, memberships, invites, and notebook records in local Convex
  data. No credentials are recorded, and the local data may be cleared before
  milestone 10 deployment rehearsal.

## 2026-07-10 — Milestone 10 final verification

- `npm run convex:codegen` — pass against the configured local deployment.
- `npm run format:check` — pass.
- `npm run lint` — pass with zero warnings.
- `npm run typecheck` — pass.
- `npm run test:run` — pass, 35 files and 470 tests.
  - New coverage includes browser connectivity events, root-shell coverage,
    real install-prompt capture/acceptance, iOS/manual and installed guidance,
    dismissal/error states, and complete English/Slovak catalog parity.
- `npm run build` — pass with Vite 8.1.4 and 1,051 transformed modules.
  - CSS: 48.64 kB / 8.62 kB gzip.
  - Initial JS: 337.10 kB / 104.02 kB gzip; the prior >500 kB warning is gone.
  - Lazy route chunks: 10.43–21.83 kB before gzip, plus shared chunks.
  - Lazy Insights/Recharts JS: 406.34 kB / 115.41 kB gzip.
  - PWA: 22 precache entries / 1,051.95 KiB; generated manifest,
    `registerSW.js`, `sw.js`, and Workbox runtime with no runtime caching rules.
- `npm audit --audit-level=moderate` — 0 vulnerabilities.
- `npm run e2e` — pass, 1/1 Chromium daily-driver in 16.3 seconds after the
  required local Convex process was started.
- Production-only `e2e/pwa-shell.spec.ts` — pass, 1/1 in 0.33 seconds against
  `vite preview`; verifies manifest metadata/maskable icon, activated and
  controlling service worker, cached offline reload, truthful reconnecting UI,
  and automatic online recovery.
- Lighthouse 13.4.0 on the production `/login` shell — performance 97,
  accessibility 95, best practices 100, SEO 91, FCP/LCP 2.1 s, TBT 0 ms, and
  CLS 0. Lighthouse 13 no longer exposes the former PWA category, so the
  production-only Playwright assertions cover its removed installability checks.
- React Doctor 0.7.4 initially found the new connectivity subscription mirroring
  an external store through state/effect. It was replaced with
  `useSyncExternalStore`; the final score is 87/100 and the remaining advisories
  are the reviewed lazy-
  Recharts false positive and pre-existing Settings/Training maintainability
  hypotheses.

### Browser verification

- Exact 390×844 Dashboard: viewport/document width 390, no horizontal overflow,
  correct mobile navigation and two-column timer cards.
- Exact 1024×900 Dashboard: viewport/document width 1024, no horizontal
  overflow, six navigation columns, six timer columns, and the primary
  474.59/429.40-pixel two-column work area.
- Exact 1280×900 Settings: viewport/document width 1280, no horizontal overflow,
  install guidance present, and no visible interactive control below 44 pixels.
- Browser console contained no errors or warnings. Captures were inspected
  in-tool; no durable milestone 10 screenshot filenames are claimed.

### Expected environment failure resolved

- The first daily-driver rerun stayed on the pending sign-up screen because the
  documented local Convex prerequisite was not listening on port 3210. Starting
  `npm run convex:dev` restored the unchanged journey; this was not an app defect.

### External validation boundary

- No Cloudflare or production Convex resource was created or modified.
- Real iOS/Android installation and installed-app background reconnection remain
  the documented release-operator checks because physical devices are not
  available in this local environment.

## 2026-07-10 — Pawgress brand migration

- `npm run format` and `npm run format:check` — pass.
- `npm run lint` — pass with zero warnings.
- `npm run typecheck` — pass.
- Focused Vitest coverage — pass, 3 files and 70 tests covering app metadata,
  install guidance, and English/Slovak catalog parity; the final full suite also
  passes at 35 files and 470 tests.
- `npm run build` — pass with 1,051 transformed modules and 22 PWA precache
  entries. The generated manifest reports `Pawgress` for both `name` and
  `short_name`.
- The opaque and maskable `P` icon variants were regenerated at their declared
  180, 192, and 512 pixel sizes and inspected directly.
- A repository and production-build audit found no stale prior product name or
  visible prior initial. Dog-name and test-account fixtures containing `Zoe`
  remain intentionally unchanged.
- React Doctor remains 87/100 with only the previously reviewed lazy-Recharts
  false positive and Settings/Training maintainability hypotheses.
- A clean-origin production preview rendered the Pawgress wordmark and `P`
  header mark with no browser console errors or warnings.
