# Known issues and deferred work

No known correctness defects in completed milestones 1–10.

## Design-system migration follow-ups

- Settings uses accessible text statuses and a disabled action while account,
  member, and invite data loads. Local shape-preserving skeletons remain a
  non-blocking polish opportunity.
- Agenda keeps goal entry, win, rating, and diary forms visible together. The
  long always-expanded layout is functional and tested; progressive disclosure
  remains deferred until usage evidence shows a scanning or completion cost.
- The Insights potty chart has an exact visible table, but the table does not
  repeat each visual series with a non-color marker. Add redundant marker or
  pattern association during a future data-visualization accessibility pass.
- React Doctor's Settings/Training component-size, Training related-state, and
  Recharts eager-import findings remain the reviewed non-blocking advisories
  detailed below.

## External release work remains

- No production deployment has been performed. Production Convex/Auth values,
  Cloudflare Pages configuration, deployment, and rollback targets require an
  explicitly authorized operator following `README.md`.
- Real iOS and Android installation plus background/resume reconnection cannot
  be completed in the local desktop environment. The production-preview
  manifest, controlling service worker, cached offline shell, reconnecting UI,
  and recovery are automated; physical-device checks remain a release gate.
- Convex data is intentionally online-only. The service worker caches the
  static shell, never household reads, writes, or pending mutations; offline
  logging remains out of scope.

## Reviewed non-blocking React Doctor advisories

- The SettingsPage and TrainingPage large-component advisories, plus
  TrainingPage's related-state/`useReducer` advisory, remain maintainability
  hypotheses rather than correctness defects. Refactoring remains deferred
  until a concrete product change benefits from it.
- React Doctor's Recharts warning remains a static-analysis false positive:
  the current production build emits `InsightsPage` as a separate 407.12 kB /
  115.68 kB gzip lazy chunk rather than bundling it into the entry chunk.

## Environment notes

- The Git repository root is the standalone `zoe-tracker` directory. The
  directory name remains unchanged from the earlier product name.
- Local Convex development remains at port 3210 with development-only Auth JWT
  keys. Production requires separately generated `JWT_PRIVATE_KEY` and `JWKS`
  values during the authorized release workflow.
- Milestone 8 visual QA was inspected directly in the browser at exact 390- and
  1280-pixel widths. Attempts to persist the final PNG captures timed out in
  the browser CDP capture path; measured layout, overflow, control-size, visual,
  interaction, and console verification completed successfully. No M8
  screenshot paths are claimed.
- Milestone 9 browser QA was inspected directly in-tool at exact 390- and
  1280-pixel widths in English and Slovak. No durable M9 screenshot paths are
  claimed.
- Milestone 10 browser QA was inspected directly in-tool at exact 390-, 1024-,
  and 1280-pixel widths. No durable M10 screenshot paths are claimed.
- Browser and Playwright runs leave disposable local accounts, dogs, household
  memberships, invites, and event data. No credentials are recorded, and the
  local data may be cleared before a clean deployment rehearsal.
