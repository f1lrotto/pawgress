# UI inventory

## Canonical system

- Product intent and anti-references: `PRODUCT.md`.
- Tokens, component rules, responsive behavior, and accessibility contract:
  `DESIGN.md`.
- Operating and review loop: `DESIGN_SYSTEM_PLAN.md`.
- Runtime tokens and global field treatment: `src/index.css`.

## Foundations and shared patterns

| Layer           | Current implementation                                                                                                                                                         | Source                                                                          |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------- |
| Color           | Forest, warm-neutral, ochre, terracotta, green, and blue primitives mapped to semantic canvas, surface, text, action, state, border, focus, and chart roles; authored in OKLCH | `src/index.css`                                                                 |
| Type            | System humanist sans for product UI; fixed caption-to-page scale; brand serif is restricted to the lockup and login welcome                                                    | `src/index.css`, `src/components/BrandLockup.tsx`, `src/App.tsx`                |
| Shape           | 4/8/12/16px radius scale; full pills reserved for semantic use                                                                                                                 | `src/index.css`                                                                 |
| Elevation       | Two restrained shadow tokens with an 8px maximum blur; normal grouping uses borders, dividers, and surface shifts                                                              | `src/index.css`                                                                 |
| Motion/layers   | 150/200/250ms durations, shared ease-out, semantic z-index scale, and global reduced-motion fallback                                                                           | `src/index.css`                                                                 |
| Actions         | Shared `Button` with primary, secondary, quiet, destructive, and icon-sized behavior; 44px minimum target                                                                      | `src/components/ui/button.tsx`                                                  |
| Fields          | Shared `.field-control` recipe for labels' associated inputs, selects, and textareas, including placeholder, focus, invalid, and disabled states                               | `src/index.css`                                                                 |
| Shell           | Shared responsive page gutters, 1280px content maximum, skip link, busy state, brand lockup, six-route navigation, dog selection, and Settings link                            | `src/components/AppFrame.tsx`, `src/components/NotebookHeader.tsx`              |
| Product content | Divider-led rows, summary data, semantic status labels, inline feedback, local skeletons, and bounded chart panels with exact text/table equivalents                           | `src/pages/`, `src/components/BodyMetricsPanel.tsx`, `src/components/insights/` |

## Surface migration status

| Surface                  | Status   | System patterns in use                                                                                             | Follow-up                                                  |
| ------------------------ | -------- | ------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------- |
| Authentication           | Migrated | Brand welcome moment, standard auth form, segmented account choice, shared fields/actions                          | None                                                       |
| Onboarding               | Migrated | Standard form hierarchy, shared fields/actions, compact step progress                                              | Accepted circular progress markers                         |
| App shell/navigation     | Migrated | `AppFrame`, `NotebookHeader`, `BrandLockup`, semantic active navigation, 44px controls                             | None                                                       |
| Dashboard                | Migrated | Compact page hierarchy, summary grid, quick-action grid, state surfaces, divider-led history, shared forms/actions | None                                                       |
| Agenda                   | Migrated | Product headings, goal rows, checkboxes, form controls, read-only history, semantic feedback                       | Long forms remain expanded                                 |
| Timeline                 | Migrated | Standard date field, visible checkbox filters, semantic type status, chronological rows, local skeletons           | None                                                       |
| Insights/body            | Migrated | Reusable chart panels, disabled chart animation, exact text/table equivalents, shared body form/list patterns      | Potty exact-table color mitigation                         |
| Enrichment               | Migrated | List/detail sections, shared forms/actions, native disclosure for archives                                         | Accepted disclosure-arrow rotation                         |
| Training                 | Migrated | Master/detail structure, shared forms/actions, semantic command statuses, inline confirmation/history              | React Doctor maintainability advisories                    |
| Settings/sharing/install | Migrated | Section-led layout, list rows, role status, shared fields/actions, inline confirmation and install feedback        | Text-only loading placeholders; React Doctor size advisory |

## Anti-slop source scan

Current runtime-source counts exclude test files. Baseline values come from
`DESIGN_SYSTEM_PLAN.md`.

| Pattern                            | Baseline |                       Current | Result                                                                                                                    |
| ---------------------------------- | -------: | ----------------------------: | ------------------------------------------------------------------------------------------------------------------------- |
| `rounded-full`                     |       93 |                             8 | Remaining uses are segmented choice, progress/state, or a small status indicator                                          |
| 2rem card radii                    |       24 | 0 `rounded-2xl`/`rounded-3xl` | Removed                                                                                                                   |
| Uppercase treatments               |       67 |                             2 | Restricted to machine-like invite codes                                                                                   |
| Offset-shadow recipes              |       47 |                             0 | Removed                                                                                                                   |
| `font-display` occurrences         |       70 |                             4 | Token plus approved brand/login uses                                                                                      |
| Raw `<button>` / shared `<Button>` |   61 / 8 |                        1 / 75 | Shared action vocabulary governs the app; the remaining raw button is the dashboard quick-action grid's composite control |

## Verification index

- Current full component/backend suite: `npm run test:run` — 37 files and 503
  tests passed on 2026-07-10.
- `npm run build` passed on 2026-07-10 with 1,054 transformed modules; Insights
  remains a separate lazy route chunk.
- Style-contract coverage includes `src/components/AppFrame.test.tsx`,
  `src/components/NotebookHeader.test.tsx`, and the page/component tests under
  `src/pages/` and `src/components/`.
- End-to-end behavior journey: `e2e/daily-driver.spec.ts`; production shell/PWA
  journey: `e2e/pwa-shell.spec.ts`.
- Current route screenshots are under `output/playwright/dashboard-pilot-v2/`,
  `output/playwright/agenda-timeline-v1/`,
  `output/playwright/enrichment-training-v2/`, and
  `output/playwright/final-wave/`. The final clean browser session reported no
  console errors or warnings and no document-level horizontal overflow.
- Historical milestone screenshots remain under `ai/screenshots/`; they are
  context rather than current visual approval.
