# UI audit

## Closed major findings

| ID      | Priority | Surface          | Finding and resolution                                                                                                                                                                                                                                     | Status | Evidence                                                                                     |
| ------- | -------- | ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | -------------------------------------------------------------------------------------------- |
| DS-01   | P1       | Global           | One-off colors, radii, shadows, motion, and type treatments lacked a governing semantic layer. Added the canonical OKLCH, type, shape, elevation, motion, and layer tokens.                                                                                | Closed | `DESIGN.md`, `src/index.css`                                                                 |
| DS-02   | P1       | Global controls  | Raw action and field recipes produced inconsistent states. Migrated to shared `Button` and `.field-control` vocabularies with focus, active, disabled, invalid, and reduced-motion behavior.                                                               | Closed | `src/components/ui/button.tsx`, `src/index.css`; 75 shared buttons and 47 field-control uses |
| AI-01   | P1       | App-wide         | Pills were the default shape. Reduced `rounded-full` from 93 to 8 runtime occurrences and restricted them to segmented choice, progress/state, or a small indicator.                                                                                       | Closed | Runtime-source scan; accepted uses below                                                     |
| AI-02   | P1       | App-wide         | Oversized radii and offset shadows made bounded surfaces feel templated. Removed all 2rem card radii and offset-shadow recipes; panels now stop at 16px and use restrained separation.                                                                     | Closed | Runtime-source scan; `src/index.css`                                                         |
| AI-03   | P1       | App-wide         | Repeated tracked uppercase labels and display serif weakened product hierarchy. Uppercase is now limited to two invite-code treatments; the serif is limited to brand/welcome moments.                                                                     | Closed | Runtime-source scan; `src/components/BrandLockup.tsx`, `src/App.tsx`                         |
| UX-01   | P1       | Shell/navigation | Route framing and controls varied by page. All protected surfaces now use one responsive frame, navigation order, active-state treatment, dog selector, Settings link, and skip link.                                                                      | Closed | `src/components/AppFrame.tsx`, `src/components/NotebookHeader.tsx`; their tests              |
| UX-02   | P1       | Routes           | Dashboard, Agenda, Timeline, Insights, Enrichment, Training, and Settings used competing page/card conventions. Each route now uses fixed product headings, restrained panels, dividers/rows, shared controls, and semantic feedback/loading patterns.     | Closed | `src/pages/`; 37 files and 503 tests passed                                                  |
| A11Y-01 | P1       | App-wide         | Focus, target size, motion, long content, loading, and chart equivalents were inconsistent. The system now provides visible focus, 44px primary controls, reduced-motion handling, wrap-safe layouts, live states, and exact chart text/table equivalents. | Closed | `src/index.css`, `src/components/AppFrame.tsx`, page/component tests                         |

## Accepted exceptions

| Exception                   | Decision                                                                                                                                                   | Evidence                                                                                                                |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Brand serif                 | Allowed only for the Pawgress lockup and login welcome headline; routine headings, labels, fields, buttons, and data remain sans                           | `src/components/BrandLockup.tsx`, `src/App.tsx`                                                                         |
| Semantic status pills       | Allowed for compact state or role labels such as event kind, walk linkage, archived state, and household role; not used for ordinary actions or containers | `src/pages/TimelinePage.tsx`, `src/pages/DashboardPage.tsx`, `src/pages/TrainingPage.tsx`, `src/pages/SettingsPage.tsx` |
| Onboarding progress circles | Allowed because shape communicates position/completion in a real ordered three-step flow                                                                   | `src/pages/OnboardingPage.tsx`                                                                                          |
| Disclosure rotation         | The archived-enrichment arrow may rotate 90 degrees because it directly communicates native disclosure state and has a reduced-motion fallback             | `src/pages/EnrichmentPage.tsx`                                                                                          |

## Open non-blocking findings

| ID       | Priority | Surface                    | Finding                                                                                                                                                                                          | Revisit condition                                                                                 |
| -------- | -------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------- |
| POL-01   | P3       | Settings                   | Account, members, and active-invite queries still use text-only loading placeholders; they are accessible but less visually stable than route/chart skeletons.                                   | Add local shape-preserving skeletons when Settings receives its next UX pass                      |
| POL-02   | P3       | Agenda                     | Goal, win, rating, and diary entry remain visible together, making a long always-expanded page.                                                                                                  | Introduce progressive disclosure only if observation shows scanning or completion suffers         |
| VIZ-01   | P3       | Insights                   | The exact potty table distinguishes series by headings and values but does not repeat the chart series with a non-color marker.                                                                  | Add a redundant marker/pattern association during the next data-visualization accessibility pass  |
| MAINT-01 | P3       | Settings/Training/Insights | React Doctor's Settings/Training component-size and Training related-state findings are maintainability advisories; its Recharts eager-import finding is disproven by the lazy production chunk. | Refactor only when a concrete feature benefits; recheck the lazy chunk after chart import changes |

## Verification evidence

- `npm run format:check`, `npm run lint`, `npm run typecheck`, and
  `npm run build` passed on 2026-07-10. `npm run test:run` passed 37 files and
  503 tests.
- The complete live-household Playwright journey passed in Chromium. The
  production-preview PWA journey also passed, including the manifest, active
  service worker, cached offline reload, reconnect status, and online recovery.
- Post-migration browser review found no P0–P2 issues, no document-level
  horizontal overflow at the measured 320px, 390px, 768px, and 1280px
  viewports, and zero errors or warnings in the final clean console session.
  Focus and validation behavior were checked directly on authentication and
  onboarding controls.
- Current route evidence is stored under `output/playwright/dashboard-pilot-v2/`,
  `output/playwright/agenda-timeline-v1/`,
  `output/playwright/enrichment-training-v2/`, and
  `output/playwright/final-wave/`. Historical files under `ai/screenshots/` are
  milestone context, not current visual approval.
