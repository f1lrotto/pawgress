# Implementation decisions

## 2026-07-09 — Milestone boundaries

- Implement milestone 1 as the first bounded run.
- Do not add auth, onboarding, or domain tables before milestone 2.
- Prefer the standard Vite and Convex layouts and the smallest shadcn-style
  primitive set needed to prove the UI setup.

## 2026-07-09 — Package management

- Use npm because Node.js and npm are available and the repository has no
  pre-existing package-manager lockfile.

## 2026-07-09 — Toolchain shape

- Use Tailwind CSS 4 through `@tailwindcss/vite`; no PostCSS configuration.
- Use source-owned shadcn/ui primitives. Only the button was added because no
  other reusable primitive is needed by milestone 1.
- Use Vitest 4 projects: jsdom for frontend tests and edge-runtime for Convex.
- Keep one strict TypeScript project per runtime to avoid mixing DOM, Node, and
  Convex assumptions.
- Keep the Convex schema empty until milestone 2 defines auth and dog data.

## 2026-07-09 — Scaffold visual direction

- Use a warm, editorial field-notebook aesthetic with dark green ink and amber
  accents. The shell truthfully communicates that product flows are upcoming.
- Prefer locally available serif/sans fallbacks instead of adding a font
  download dependency during scaffolding.

## 2026-07-09 — Convex development

- Configure a local Convex deployment for repeatable development and codegen.
  The CLI also created the team project record; no cloud data deployment was
  used for milestone 1.

## 2026-07-09 — Milestone 2 auth backend slice

- Use `@convex-dev/auth` 0.0.94 with its built-in Password provider and default
  password policy.
- Canonicalize Password emails by trimming and lowercasing them, and reject
  malformed addresses before account creation. This supersedes the initial
  decision not to customize Password profile validation.
- Keep `requireAuthUserId` as the low-level guard and build
  `authedQuery`/`authedMutation` plus `dogQuery`/`dogMutation` with
  `convex-helpers` once the dog schema provides real consumers.
- Make the current-user query reject missing or stale auth identities instead
  of returning nullable user data, so protected callers have one contract.
- Configure JWT signing keys only on the local Convex deployment. Production
  key configuration remains deployment work and secrets are not stored in the
  repository.

## 2026-07-09 — Milestone 2 domain authorization

- Use `dogMembers` as the sole dog-access boundary, with `by_user`, `by_dog`,
  and `by_dog_user` indexes. Knowing a dog ID never grants access.
- Both owners and members may use ordinary dog-scoped APIs. Role-specific
  administration can be added only when a feature requires it.
- Store the initial onboarding weight in `bodyMetrics`, not on the dog, so it
  is immediately the first point in the planned weight history.
- Keep meal normalization shared between onboarding and routine replacement:
  trim labels, enforce unique case-insensitive names, validate `HH:mm`, sort by
  time, and bound schedules to eight meals with 64-character labels.

## 2026-07-09 — Atomic onboarding

- Submit onboarding once at the final step. The dog, owner membership, first
  weight, meal routines, and six default activity types are written in one
  Convex transaction, so invalid or failed setup leaves no partial graph.
- Validate real `YYYY-MM-DD` birthdays against the dog's IANA timezone and
  reject future dates, non-finite/non-positive weights, and invalid meal input
  at the backend trust boundary as well as in the UI.
- Allow a user to create additional dogs later; do not make onboarding globally
  idempotent per user. Prevent duplicate form submission in the client.

## 2026-07-09 — Auth and onboarding routes

- Resolve authentication and `dogs.listMine` before rendering route content to
  prevent signed-out or onboarding flashes.
- Route signed-out users to `/login`, authenticated users without a dog to
  `/onboarding`, and users with a dog to `/`, using replace redirects to avoid
  back-button loops.
- Keep onboarding as an accessible three-step client-side wizard and persist
  nothing until the atomic final mutation.
- Keep the post-onboarding dashboard intentionally minimal and truthful: show
  the current dog's real name while quick logging remains milestone 3 work.

## 2026-07-09 — Milestone 3 event core

- Keep all time-stamped daily activity in the unified `events` table. Use
  `by_dog_at` for recent chronology and `by_dog_kind_at` for latest-per-kind
  context; every API remains behind dog-membership wrappers.
- Attribute every event to both dog and authenticated user. Treat deletion as
  idempotent for the same dog while rejecting cross-dog IDs.
- Validate timestamps against finite/non-negative values, a five-minute future
  tolerance, and the dog's local birthday. Bound notes to 500 characters,
  meal/treat amounts to 1–10000, and recent-query limits to 1–100.
- Keep server queries deterministic: the client supplies event timestamps and
  computes ticking elapsed/countdown display values locally.

## 2026-07-09 — Milestone 3 time utilities

- Use pure helpers for elapsed/rest-state derivation and update dashboard time
  context on a 30-second client interval.
- Use `date-fns` plus `@date-fns/tz` for dog-local next-meal and native
  `datetime-local` conversion across IANA zones and DST boundaries.
- Reject malformed, impossible, and nonexistent spring-forward wall times.
  Resolve ambiguous fall-back wall times to their first occurrence
  deterministically.

## 2026-07-09 — Milestone 3 dashboard interactions

- Offer six immediate actions: pee, poop, meal, treat, wake, and sleep. A
  separate form handles backdating, notes, and optional meal/treat amounts.
- Keep recent-event management inline: edits preserve values on failure,
  deletion requires a second confirmation, and undo targets only the most
  recently created event in the current client.
- Use refs as duplicate-operation locks in addition to disabled controls, so
  rapid clicks cannot race React state updates.
- Format all dashboard dates/times in the dog's timezone and expose stable
  labels, regions, statuses, field errors, and minimum touch targets for
  accessible testing and operation.

## 2026-07-09 — Playwright smoke coverage

- Keep one high-value Chromium daily-driver test rather than duplicating the
  component suite. It covers sign-up, onboarding, two-page realtime behavior,
  timers, backdating, edit, confirmed delete, and undo without fixed sleeps.
- Playwright manages the Vite lifecycle and reuses an existing local server;
  Convex remains an explicit preflight rather than complex test orchestration.
- Store failure artifacts only under ignored `output/playwright/`.

## 2026-07-10 — Milestone 4 walk contracts

- Keep walks in the unified `events` table. An active walk has no `endedAt`;
  `by_dog_kind_ended_at` resolves the single active walk and `by_walk_at`
  resolves attached events in chronological order.
- Enforce non-overlapping walk intervals at start and during generic timestamp
  edits. Adjacent interval boundaries may be equal, and indexed bounded reads
  participate in Convex transaction conflict detection for concurrent edits.
- Make the first committed walk completion authoritative. Compatible retries
  return the stored `endedAt` without changing completion or diary data;
  conflicting diary semantics fail explicitly.
- Allow `walks.logPotty` only while the same-dog walk is active and at or after
  its start. Cap linked events at 100 so transactional detachment remains
  bounded; the 101st attempt returns `WALK_EVENT_LIMIT`.
- Deleting a walk preserves its potty history by clearing `walkId` rather than
  cascading deletion. Generic child timestamp edits must remain inside the
  parent interval.

## 2026-07-10 — Milestone 4 rest contracts

- Model rest as alternating `wake` and `sleep` events in chronological order,
  rather than storing a separate mutable state document. The latest event
  determines awake/asleep state and its timestamp starts the live timer.
- Validate both chronological neighbors for insertion and backdating. Moving or
  deleting a middle transition is allowed only when the remaining sequence
  still alternates; same-timestamp transitions are rejected.
- Use dog-scoped indexed neighbor reads inside mutations so concurrent
  household insert, update, and deletion attempts serialize through Convex
  optimistic concurrency control.

## 2026-07-10 — Milestone 4 dashboard and E2E

- Keep current-time start/end as the primary walk actions and expose separate
  dog-timezone-aware forms for backdated boundaries.
- Show one reactive active-walk surface with elapsed time, diary editing, and
  active-only potty context. Completed walk rows retain duration, diary, and
  attached-potty history, while the timer changes from `Current walk` to
  `Since last walk`.
- Derive rest-button availability from the latest wake/sleep event: the current
  state action is disabled and only the opposite rest transition is enabled.
- Extend the existing single Playwright daily-driver and its existing account,
  dog, `page`, and `secondPage`; do not add a second setup flow. Use accessible
  scoped locators and reactive assertions with no fixed sleeps.

## 2026-07-10 — Milestone 5 enrichment contracts

- Keep Play in the unified `events` table with `activityTypeId`, optional
  `endedAt`, and optional note. Activity types remain separate dog-scoped
  records indexed by `by_dog`; archiving prevents new logs without breaking
  historical Play lookup.
- Normalize activity names and emoji with NFKC, enforce case-insensitive name
  uniqueness and a 100-type cap, and reject archived or cross-dog IDs at the
  mutation boundary.
- Allow Play intervals to be created and edited only when the end is not before
  the start. Reuse the dog's timestamp and note contracts from event core.
- Include archived activity types only where historical display requires them;
  active pickers and new logs never silently fall back to archived selections.

## 2026-07-10 — Milestone 5 training contracts

- Store commands and sessions separately. Commands use
  `by_dog_archived_name` and `by_dog_status_name`; sessions use
  `by_command_at` and `by_dog_at` for bounded detail/history reads.
- Normalize active command names, enforce case-insensitive active uniqueness
  and a 100-command cap, and keep status to learning, solid, or mastered.
- Make command updates partial so the client can submit only fields the user
  touched. This prevents one household member's edit from overwriting reactive
  collaborator changes to untouched fields.
- Bound command guidance, session notes, rating, timestamps, and list limits at
  the backend. Archived commands retain readable history and reject new
  sessions until restored.

## 2026-07-10 — Milestone 5 frontend and P1 hardening

- Reuse one `NotebookHeader` for dog-aware navigation and add dedicated
  `/enrichment` and `/training` routes without changing the existing dashboard
  daily-driver surface.
- Keep a ref-backed synchronous lock across each page's mutation families.
  Disabled controls communicate pending work, while the ref closes same-tick
  repeat and mixed-operation races.
- Require explicit replacement when a selected activity becomes stale instead
  of retargeting a preserved backdate draft to another activity.
- Resolve training detail only after the selected command appears in the
  authorized list, so malformed and stale deep links use `skip`. Key the
  session panel by command ID so drafts never cross commands.
- Reconcile command edits per touched field: touched values survive same-command
  reactive updates, untouched values remain live, save sends only touched
  fields, and successful saves return the form to reactive server state.
- Preserve archived activity names on Dashboard historical Play rows and allow
  valid Play start/end edits without relaxing interval validation.

## 2026-07-10 — Milestone 5 E2E, QA, and test stability

- Extend the existing two-tab daily-driver with Cafe visit and Recall rather
  than creating a second browser setup. Verify realtime Play history, archive
  preservation, command status, and training session history.
- Use tall fixed viewports for durable screenshots after full-page capture
  produced a tooling artifact. Treat measured viewport/document widths and
  console output as authoritative.
- Keep browser and Playwright records disposable in the local deployment.
- Stabilize the Onboarding test's synthetic `beforeunload` dispatch only in the
  test helper; production unload protection remains unchanged.

## 2026-07-10 — Milestone 6 agenda contracts

- Store one `agendaDays` document per dog/local date behind the
  `by_dog_date` index. Reads may request any validated day; writes require the
  dog's current local date, keeping yesterday safely readable but immutable.
- Keep enrichment and training goal arrays separate while assigning stable,
  monotonically increasing IDs from one document counter. Bound each category
  to 20 goals and serialize simultaneous creation/cap races through Convex
  transaction conflicts.
- Normalize and bound goal text, win, and diary; constrain rating to an integer
  from 1–5. Clearing optional fields uses explicit null mutation inputs without
  creating an otherwise empty day.
- Keep goal mutations category/ID-specific and make removal idempotent while a
  stale toggle reports `AGENDA_GOAL_NOT_FOUND` for reactive recovery.

## 2026-07-10 — Milestone 6 local-day and parser hardening

- Derive today and yesterday from a client epoch in the dog's IANA zone with
  `getZonedDayKeys`; subtract one zoned calendar day rather than 24 hours and
  skip agenda queries when the timezone is invalid.
- Replace host-dependent `TZDateMini` setter parsing after a P1 review with a
  fixed five-probe target-offset candidate search. Exact round-trips reject DST
  gaps; choosing the minimum valid epoch resolves fall overlaps consistently.
- Preserve valid years 0001–9999 and reject malformed/impossible inputs.
  Verify behavior under Los Angeles and Auckland device timezones and across
  all 418 runtime-supported IANA zones and 42,344 transitions from 1900–2100.
- Keep parsing submit-time and fixed-cost. Add the explicit comparison-length
  guard and a single-pass earliest-candidate loop so React Doctor reports no
  parser performance advisories.

## 2026-07-10 — Milestone 6 frontend and concurrency

- Expand the shared notebook navigation to four tabs and add a protected,
  dog-keyed `/agenda` route. Keep Dashboard as `Today` and link its reactive
  Agenda summary directly to the full page.
- Remount today's agenda by local date at rollover so goal/reflection drafts
  cannot migrate into tomorrow. Query yesterday separately and render it with
  no controls.
- Use one synchronous ref lock across all goal and reflection mutations. Keep
  add drafts and touched reflection fields through reactive household updates;
  untouched fields continue to follow the server.
- Render maximum-valid unbroken goal, win, and diary content with minimum-width
  and word-breaking constraints so the read-only sidebar cannot clip history
  on mobile or desktop.

## 2026-07-10 — Milestone 6 E2E and QA

- Extend the existing two-tab daily-driver rather than adding setup: verify
  enrichment/training goal creation, cross-page goal completion, win/rating/
  diary reflection sync, and the resulting Dashboard summary.
- Keep QA records disposable in the local deployment. Capture durable mobile
  and desktop screenshots with tall fixed viewports while measuring exact
  width, overflow, and console state separately.

## 2026-07-10 — Milestone 7 local-day and timeline contracts

- Extend the shared zoned-date foundation with contiguous dog-local day
  windows rather than subtracting fixed 24-hour durations. Use these windows
  for Timeline and Insights so 23-hour and 25-hour DST days retain exact local
  boundaries.
- Keep Timeline on the indexed `by_dog_at` range and Convex-managed pagination.
  Accept at most one validated dog-local window of 27 hours, optional unique
  event-kind filters, pages of at most 50, and a 500-row scan bound per page.
- Preserve newest-first event order and include complete event metadata. Resolve
  archived activity types for historical Play labels without making archived
  types available for new logs.
- Compute pristine Timeline dates on mount, every 30 seconds, and immediately
  after timezone changes. Once a user edits the date, preserve that choice.

## 2026-07-10 — Milestone 7 body and insight contracts

- Complete dog-authorized body-metric CRUD with bounded newest-first history.
  Require at least one positive measurement, allow explicit field clearing,
  validate timestamps against the dog's birthday/timezone, and make removal
  idempotent.
- Keep exact stored timestamp precision when an edit changes measurements only.
  Parse and submit minute-precision `datetime-local` values only after the time
  field is explicitly touched, preventing value-only edits from truncating
  seconds and milliseconds.
- Build bounded deterministic insight queries over indexed reads: 24
  dog-local potty buckets, completed-walk intervals with intervening meal
  markers, sleep totals split across supplied local-day windows, and inclusive
  agenda day ratings. Cap event reads and reject malformed or excessive ranges.
- Keep body age derived from the dog-local current day and refresh it on the
  same 30-second client cadence used by other local-day surfaces.

## 2026-07-10 — Milestone 7 frontend, hardening, and QA

- Install Recharts with npm and render weight, potty, walk-interval, sleep, and
  rating charts in a responsive field-atlas layout. Treat SVG charts as
  supplemental: every chart has an exact visible textual list or table, and
  animation is disabled.
- Compose the reusable body notebook into Insights with accessible loading,
  empty, validation, error, and mutation states. Keep its history query bounded
  independently from the 500-point weight chart query.
- Expand the shared notebook header to six semantic tabs and add protected,
  dog-keyed `/timeline` and `/insights` routes. Load Insights with
  `React.lazy`/`Suspense` so Recharts stays out of the initial bundle; keep the
  Dashboard handoff truthful with `Up next: sharing and dog switching.`
- Fix reviewed P1s before closure: preserve exact Body timestamps on value-only
  edits, synchronize pristine Timeline dates immediately after timezone
  changes, and expose visible keyboard focus on all Timeline filter pills.
  Replace the per-event potty-hour `Intl.DateTimeFormat` with direct
  `TZDateMini#getHours` lookup after its performance advisory.
- Extend the single Playwright daily-driver through Timeline and Insights,
  including body entry and chart/list evidence. Keep local QA data disposable
  and capture Timeline and Insights at exact 390- and 1280-pixel widths with
  tall fixed viewports, independent overflow measurements, and clean consoles.

## 2026-07-10 — Milestone 8 multi-dog selection

- Bound `dogs.listMine` at 100 indexed user memberships and fail on overflow
  instead of silently truncating. Deduplicate identical roles, reject
  conflicting duplicate roles, skip dangling dog records, and sort by name,
  creation time, then ID for a deterministic fallback order.
- Keep the active dog ID in App-owned React state and expose only the current
  list, active ID, and selection callback through context. Do not persist the
  choice in `localStorage`: it avoids cross-account leakage on shared devices
  and keeps the server-authorized membership list authoritative.
- Latch an explicitly authorized ID across reactive list insertions so a newly
  earlier-sorted dog cannot steal the active route. If that membership is
  removed, clear the request and fall back to the first deterministic
  authorized dog; key dog-scoped pages by ID to discard stale local drafts.

## 2026-07-10 — Milestone 8 sharing contracts

- Let any current dog member list the minimum safe member profile and manage
  invites consistently. Use bounded indexed reads and explicit validators on
  every public function.
- Generate uppercase 32-character codes from `crypto.randomUUID`, retry global
  collisions, and keep at most one active invite per dog. Reusing the current
  active record makes repeated and concurrent generation idempotent.
- Redemption always grants the fixed `member` role and transactionally checks
  the invite, existing membership, 100-dog user cap, and 100-member household
  cap before consuming it. The successful redeemer may retry idempotently;
  every other account sees the same invalid-code failure.
- Delete an active invite on revoke because no audit consumer needs a revoked
  tombstone. Keep redeemed invites as tombstones with `redeemedBy` so a
  committed redemption can be retried safely while remaining invalid to other
  accounts. Generating after revoke is the rotation path.
- Reuse one invite-redemption form from dogless onboarding and Settings. Keep
  Settings reactive to the active invite and member list, require confirmation
  before revoke, and use one synchronous operation lock for invite mutations.
- Extend the existing daily-driver with a genuinely separate account and
  browser context, then verify membership and event propagation in realtime
  rather than simulating a second household member in the same account.

## 2026-07-10 — Milestone 9 localization/settings planning

- Insert localization/settings before PWA/deployment so production deployment
  remains the final milestone; the former milestone 9 is now milestone 10.
- Store the explicit locale in a separate unique `userPreferences` record with
  strict `en`/`sk` validation rather than modifying Convex Auth's owned `users`
  schema. Do not make locale dog-scoped or rely on `localStorage` for signed-in
  persistence.
- Resolve locale as persisted user preference, then the first supported browser
  language, then English. Use synchronous typed i18next catalogs for product
  copy and native `Intl` with an explicit locale for presentation formatting.
- Keep locale and dog timezone independent: locale changes copy, dates, numbers,
  durations, and plural presentation but never event bucketing, stored instants,
  or `YYYY-MM-DD` keys. Never machine-translate household-authored values.
- Evolve the existing `/settings` route into Personal + Household sections and
  rename its navigation label to Settings. Do not create a duplicate route or
  regress the existing member, invite, join, and dog-switch functionality.

## 2026-07-10 — Milestone 9 localization/settings implementation

- Keep locale in a separate indexed `userPreferences` table owned by the
  authenticated user, with strict `en`/`sk` public validators. The transactional
  API maintains one effective record per user without modifying Convex Auth's
  schema or coupling preference data to a dog.
- Read duplicate preference records in deterministic oldest-first order. A
  write retains and updates the oldest record and removes later duplicates;
  reads/writes inspect at most six records, repair up to the five-document cap,
  and reject larger corruption with `PREFERENCE_CORRUPTION_LIMIT` before any
  partial write.
- For an authenticated account without a preference, resolve the first
  supported browser language (then English), apply it, and persist that choice
  once. Wait for preference/bootstrap completion before protected content so
  account entry, account changes, and sign-out reset language state without a
  wrong-language flash or cross-account leakage.
- Use synchronous, typed, namespaced i18next catalogs for product-owned English
  and Slovak copy. Keep native `Intl` formatters explicit and locale-aware for
  numbers, dates, units, durations, charts, and plural selection; do not add a
  second formatting framework.
- Synchronize `<html lang>`, document title, and description metadata whenever
  locale changes. Static English document values remain the pre-JavaScript
  fallback.
- Keep account locale independent from dog timezone: locale controls copy and
  presentation, while the dog timezone continues to control event bucketing,
  stored instants, local-day windows, and `YYYY-MM-DD` keys.
- Localize built-in activity defaults once when onboarding seeds them, using
  the persisted account locale. Treat seeded defaults, authored notes/names,
  and all existing household values as shared data thereafter and display them
  verbatim rather than retranslating or changing case for grammar.
- Evolve the existing `/settings` route rather than creating another page.
  Personal contains account and language controls; Household retains dog
  switching, members, invites, and joining. A language selection updates copy
  immediately, persists under a synchronous operation lock, and reverts to the
  prior locale with a focused translated alert if persistence fails.

## 2026-07-10 — Milestone 10 hosting direction

- Use Cloudflare Pages for the static Vite SPA and the managed Convex service
  for realtime data and backend functions. Milestone 10 documentation will make
  the Pages build/output settings, SPA fallback, production Convex URL, and
  Convex Auth JWT configuration explicit.
- Treat production deployment as an external action, not an implied local
  implementation step. Milestone 10 may add and verify configuration and deploy
  documentation, but must not create, modify, or deploy production Cloudflare
  or Convex resources without explicit user authorization.

## 2026-07-10 — Milestone 10 PWA and release preparation

- Use `vite-plugin-pwa` `generateSW` with root-scoped standalone metadata,
  repository-owned opaque and maskable icons, stale-cache cleanup, and the safe
  native waiting lifecycle. Precache static build output only; define no
  Workbox runtime caching for Convex or household data.
- Treat connectivity as a browser external store through
  `useSyncExternalStore`. Keep the banner persistent while offline, state that
  live notebook data needs a connection, and clear it automatically online.
- Capture `beforeinstallprompt` only when the browser offers it. Otherwise show
  honest iOS manual, installed, or unavailable guidance instead of simulating
  installability.
- Keep locale catalogs synchronous to preserve no-flash bootstrap, but lazy-load
  Onboarding and every protected route except the daily Dashboard. This removes
  the initial chunk warning while retaining the existing lazy Insights/Recharts
  boundary.
- Use Cloudflare Pages Git integration without Wrangler or `_redirects` because
  Pages provides SPA root fallback when no top-level `404.html` exists. Keep
  `VITE_CONVEX_URL` public in Pages and keep `JWT_PRIVATE_KEY`/`JWKS` only in the
  separately keyed production Convex environment.
- Do not deploy externally as part of implementation. Physical iOS/Android
  install and background-reconnect checks are release-operator work after an
  explicitly authorized production or device-accessible preview deployment.

## 2026-07-10 — Design-system migration closure

- Adopt the refined current palette as Pawgress's canonical direction: retain
  the forest, ochre, and warm-neutral identity while moving all runtime styling
  through the semantic OKLCH roles in `src/index.css` and the rules in
  `DESIGN.md`.
- Treat the system sans, fixed product type scale, 4/8/12/16px radius scale,
  restrained elevation, shared action variants, and `.field-control` as the
  default vocabulary for every route. Product grouping prefers spacing,
  dividers, and surface shifts over additional cards.
- Restrict the brand serif to the Pawgress lockup and login welcome headline.
  Accept full pills only for semantic statuses/roles and the login segmented
  choice; accept circular onboarding markers only because they communicate an
  ordered three-step flow.
- Keep the archived-enrichment disclosure arrow's 90-degree rotation because
  it communicates native disclosure state, uses the shared short transition,
  and has a reduced-motion fallback.
- Consider the shell and all current routes migrated. The Settings loading
  placeholders, Agenda's long expanded forms, potty-table redundant series
  marking, and reviewed React Doctor advisories are P3 follow-ups rather than
  blockers to the design-system migration.
