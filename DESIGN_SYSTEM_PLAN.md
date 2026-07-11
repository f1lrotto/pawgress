# Pawgress Design-System and UI Refinement Plan

## Purpose

Turn Pawgress into a polished, intentional product that feels warm, calm, and
good to use while caring for a puppy. Preserve the welcoming character of the
current green, ochre, and warm-neutral palette unless exploration proves a
better direction. Remove repeated visual shortcuts that make the interface feel
AI-generated.

This is a collaborative design process, not a one-shot reskin. The design system
is refined with the product owner, proven on a representative workflow, and then
used as the standard for a route-by-route audit and implementation loop.

## Current-state hypothesis

The existing product has a sound functional base, responsive coverage, typed
localization, and useful tests. Its visual identity is already recognizable and
worth evolving rather than replacing.

The main quality problem is repetition without semantic purpose:

- 93 uses of `rounded-full` make pills the default shape rather than a specific
  affordance.
- 24 uses of 2rem card radii make most containers feel equally soft and equally
  important.
- 67 uppercase, heavy, tracked labels create repeated editorial “kickers.”
- 47 offset-shadow recipes make panels and controls feel templated.
- 70 uses of the display serif push a brand voice into dense product UI where a
  quieter interface type treatment would be clearer.
- 61 raw buttons versus eight shared `Button` uses, plus repeated local field
  class recipes, show that the current component layer does not yet govern the
  interface.
- Page-level display headings, repeated card frames, decorative rotations, and
  the dot texture compete with frequent puppy-care tasks.

These counts are diagnostic, not deletion targets. Every instance will be judged
by its function and context.

## Product experience target

Pawgress should feel like a well-kept household logbook: reassuring when the
owner is tired, quick when something just happened, and quietly rewarding when
patterns and progress emerge.

The visual system should be:

1. **Warm, not themed.** Puppy care should feel kind without turning every
   surface into decoration.
2. **Calm under repetition.** Frequent logging and scanning should become easier
   with use, not visually tiring.
3. **Clear before charming.** Personality supports comprehension and never
   replaces standard controls or hierarchy.
4. **Specific to the task.** Status, time, sequence, and progress receive visual
   emphasis; containers do not receive emphasis merely because they exist.
5. **Shared by the household.** Mobile-first, accessible, bilingual, and robust
   to real names, notes, empty states, and concurrent updates.

## Anti-AI contract

The following rules become explicit review criteria:

- Pills are reserved for true tags, statuses, compact filters, and segmented
  choices. Standard buttons, inputs, navigation links, and cards are not pills
  by default.
- Large radii are reserved for genuinely large or friendly focal surfaces.
  Controls and ordinary panels use a restrained radius scale.
- Uppercase tracked text is rare and purposeful, not a heading scaffold above
  every section.
- Product pages do not use landing-page hero proportions. Page titles establish
  location and task without dominating the viewport.
- A border and a wide decorative shadow are not paired on the same element.
- Cards exist only where grouping, selection, or comparison requires a bounded
  surface. Sections, rows, and whitespace handle the rest.
- Nested cards, decorative rotations, gratuitous badges, repeated icon bubbles,
  and decorative background patterns are removed unless they carry information.
- The display serif may express brand moments or human-readable records, but not
  routine labels, buttons, fields, or dense data.
- One primary action leads each task area. Secondary and destructive actions are
  visually quieter.
- Motion communicates state in 150–250ms and always has a reduced-motion path.

## Durable project artifacts

The loop uses a small set of living documents rather than relying on chat
history:

- `PRODUCT.md` — users, product purpose, product register, emotional goal,
  positioning, anti-references, design principles, and accessibility intent.
- `DESIGN.md` — canonical visual and interaction system: tokens, typography,
  layout, components, states, motion, accessibility, and examples.
- `DESIGN_SYSTEM_PLAN.md` — this operating framework, sequence, gates, and agent
  rules.
- `ai/ui-inventory.md` — current pattern and component inventory with
  consolidation candidates.
- `ai/ui-audit.md` — prioritized findings ledger with IDs, route, severity,
  violated rule, owner, evidence, and status.
- `ai/decisions.md` — durable design decisions and tradeoffs. Settled decisions
  are reopened only when new evidence appears.
- `ai/screenshots/design-system/<iteration>/` — named before/after screenshots at
  agreed viewports and states.
- `ai/known-issues.md` — explicit deferrals with impact and revisit conditions.

## Phase 0 — Capture the baseline

Goal: understand the whole interface before changing it.

Run up to three read-only sub-agents in parallel:

1. **System inventory agent**
   - Map colors, typography, spacing, radii, shadows, breakpoints, and shared
     component recipes.
   - Quantify one-off Tailwind recipes and duplicated UI patterns.
   - Identify what is coherent and should be preserved.
2. **Experience audit agent**
   - Audit every route for hierarchy, density, navigation, task clarity,
     interaction states, content, and the anti-AI contract.
   - Include empty, loading, error, success, disabled, and realtime states.
3. **Visual QA agent**
   - Capture baseline screenshots at 390px, 768px, and 1280px.
   - Check overflow, keyboard use, visible focus, reduced motion, console errors,
     and English/Slovak expansion.

The orchestrator merges results into `ai/ui-inventory.md` and a single ranked
`ai/ui-audit.md`. No UI edits happen in this phase.

Exit gate:

- Every route and shared shell is represented in the inventory.
- Findings are deduplicated and ranked P0–P3.
- Baseline screenshots and current engineering-check results are recorded.

## Phase 1 — Co-design the system

Goal: agree on the rules and visual direction before broad implementation.

### 1.1 Capture product context

Complete the Impeccable `init` interview and write `PRODUCT.md`. Confirm:

- Primary users and their context when logging or reviewing puppy care.
- The product’s one-sentence positioning.
- Three personality words and the emotional goal.
- Named references and anti-references.
- Accessibility target and known needs.

### 1.2 Explore system directions

Create two or three compact system directions using the same representative
content and components. These are comparison boards, not full app redesigns.

Recommended starting directions:

1. **Refined current palette — recommended baseline.** Keep the existing forest,
   ochre, and warm-neutral identity. Improve contrast, distribution, hierarchy,
   type, radii, and elevation before changing brand color.
2. **Clear daylight.** Retain forest as the identity color while moving the main
   canvas toward a true neutral and using ochre only for meaningful warmth and
   progress.
3. **Garden dusk.** A deeper, more contrast-led alternative for selected focal
   surfaces, tested as an optional theme rather than assumed as the default.

Each direction must show the same small set:

- App header and navigation.
- Page title and section hierarchy.
- Primary, secondary, quiet, and destructive actions.
- Input, select, checkbox, and segmented choice.
- Timer/summary datum, activity row, status, empty state, and feedback message.
- Mobile and desktop composition.

The comparison explicitly tests hierarchy, density, shape, typography, and
component anatomy—not palette swaps alone.

### 1.3 Define the system

After a direction is selected, create `DESIGN.md` with:

- **Semantic color:** canvas, surface, raised surface, text, muted text, border,
  accent, focus, success, warning, error, and data-series roles in OKLCH.
- **Typography:** one product-first UI family, a limited expressive role for the
  serif, fixed product type scale, line-height, weight, and wrapping rules.
- **Spacing and layout:** base spacing scale, content widths, page gutters,
  section rhythm, dense/comfortable patterns, and responsive structure.
- **Shape and elevation:** a restrained radius scale, border rules, and a small
  semantic elevation scale.
- **Interaction states:** default, hover, focus, active, selected, disabled,
  loading, success, warning, and error.
- **Motion:** duration/easing tokens, allowed state transitions, and reduced
  motion behavior.
- **Component anatomy and usage:** button, field, select, checkbox, tabs,
  navigation, status, feedback, empty state, list row, summary datum, form
  section, chart container, and confirmation pattern.
- **Responsive and content rules:** 320px minimum width, 390/768/1280 reference
  viewports, Slovak expansion, long names, long notes, and real data ranges.
- **Do/don’t examples:** especially for pills, cards, headings, badges, shadows,
  icons, and destructive actions.

User approval gate:

- Approve the principles, color direction, type direction, radius/elevation
  approach, and representative components.
- Do not begin the broad route refactor before this approval.

## Phase 2 — Build foundations and prove them

Goal: implement the approved system once and pressure-test it on real product
work.

One design-system agent is the sole writer of shared foundations during this
phase. Suggested order:

1. Semantic color and verified contrast pairs.
2. Product typography and content hierarchy.
3. Spacing, layout widths, and responsive gutters.
4. Radius, borders, and elevation.
5. Focus, error, disabled, selected, and loading states.
6. Motion and reduced-motion behavior.
7. Shared primitives and repeatable product patterns.
8. App shell and navigation.

The dashboard is the proving ground because it combines navigation, page
hierarchy, live timers, quick actions, status feedback, forms, activity rows,
empty data, realtime updates, and responsive layout.

Pilot loop:

1. Audit the dashboard against the approved `DESIGN.md`.
2. Refactor only the smallest coherent dashboard slice plus required shared
   foundations.
3. Run mechanical and visual checks.
4. Have an independent agent review the result without editing it.
5. Refine `DESIGN.md` when the pilot reveals a systemic issue.
6. Repeat until the dashboard passes all gates.

Scale gate:

- The dashboard works at 320px and passes 390/768/1280 screenshot review.
- Shared components cover their documented states.
- The new visual language is recognizably Pawgress, warmer and calmer, without
  relying on the banned patterns.
- The product owner approves the pilot before route-wide migration.

## Phase 3 — Route-by-route refinement loop

Goal: apply the system consistently without turning the work into one risky,
whole-app rewrite.

### Recommended migration order

1. **App shell and navigation** — establish page framing, responsive navigation,
   dog selection, connectivity, and shared loading states.
2. **Dashboard** — complete the pilot and high-frequency logging workflow.
3. **Agenda** — establish goals, checkable rows, reflection, and long-form input.
4. **Timeline** — establish filters, chronological rows, edit/delete, and dense
   history.
5. **Training and enrichment** — reuse list/detail, creation, progress, archive,
   and logging patterns.
6. **Insights** — establish chart containers, legends, empty data, and data-color
   semantics after the surrounding UI is stable.
7. **Settings and sharing** — finish account, dog, locale, invite, installation,
   and destructive-management patterns.
8. **Authentication and onboarding** — apply the proven form, feedback,
   progress, and brand system to the first-run experience without inventing a
   separate visual language.

### The loop for each surface

1. **Audit**
   - A read-only agent checks the route against `DESIGN.md`, the anti-AI
     contract, accessibility, responsive behavior, both locales, and all states.
   - Findings are added to `ai/ui-audit.md` with evidence.
2. **Plan**
   - The orchestrator selects the smallest coherent slice.
   - Declare the files, reused primitives, acceptance criteria, tests, and
     screenshots required.
3. **Implement**
   - One agent edits only its allowlisted route/component files.
   - If a new shared primitive or token is needed, the agent stops and returns a
     proposal to the orchestrator; it does not modify shared foundations during
     parallel route work.
4. **Verify mechanically**
   - Run targeted tests during the edit.
   - Run React Doctor after React changes.
   - Finish with `npm run format`, `npm run lint`, `npm run typecheck`,
     `npm run test:run`, and `npm run build`.
   - Run the relevant Playwright journey when behavior or flow changes.
5. **Verify visually**
   - Compare before/after screenshots at 390px, 768px, and 1280px; include 320px
     overflow validation.
   - Check keyboard order, focus visibility, contrast, reduced motion, console
     output, loading/empty/error states, and English/Slovak content.
6. **Review independently**
   - A read-only reviewer checks the result against the design rules and audit
     ledger. The implementer cannot accept its own work.
7. **Accept or return**
   - Close findings only with test or screenshot evidence.
   - Rejected work returns as one bounded follow-up task, not a broad rewrite.
8. **Retrospect**
   - Record lasting decisions in `ai/decisions.md`.
   - If the lesson is systemic, update `DESIGN.md` once and scan already-migrated
     routes for the same issue.

## Agent operating rules

The orchestrator owns scope, sequencing, shared files, integration, and final
acceptance. With four total agent slots, use the orchestrator plus at most three
sub-agents.

### Default roles

1. **Design-system architect** — inventories and proposes the system; becomes the
   sole writer of shared foundations when approved.
2. **Surface auditor/implementer** — audits or edits one bounded route at a time.
3. **Independent visual reviewer** — captures/checks evidence and reports only.

### Shared-worktree safety

- Parallel agents are read-only by default.
- Only one agent at a time may edit `src/index.css`, `src/App.tsx`,
  `src/components/ui/*`, `PRODUCT.md`, or `DESIGN.md`.
- Route agents may edit concurrently only when their file allowlists are
  disjoint and foundations are stable.
- Every task names allowed files, forbidden shared files, expected output,
  verification command, and stop condition.
- An agent rechecks repository status immediately before editing. If an allowed
  file changed unexpectedly, it stops and alerts the orchestrator.
- Agents do not run repo-wide formatters while another agent is editing. The
  orchestrator runs the final repository-wide format/check sequence.
- One owner controls the dev server, browser fixtures, and screenshots for an
  iteration to avoid port and test-data collisions.
- Audit and review agents do not edit. Implementers do not mark their own work
  accepted.
- One iteration changes either shared foundations or one route—not both.

### Assignment template

Every sub-agent prompt should contain:

```text
Objective:
Source of truth: DESIGN.md and audit finding IDs
Allowed files:
Forbidden shared files:
Required states/viewports/locales:
Required tests and screenshots:
Expected output:
Stop and report when:
```

## Quality gates

### Design-system gate

- `DESIGN.md` defines semantic tokens, component anatomy/states, responsive
  behavior, accessibility, motion, and concrete do/don’t rules.
- Body text contrast is at least 4.5:1; large text is at least 3:1.
- Placeholder and muted instructional text remain readable.
- The palette is tested in realistic components, not approved from swatches.
- The system distinguishes product UI from the small number of brand moments.

### Surface gate

- Location, page purpose, current state, and primary action are obvious at a
  glance.
- Pills, cards, serif type, icons, and badges are semantically justified.
- There is no overflow at 320px and screenshots pass at 390/768/1280.
- Keyboard, focus, loading, empty, error, disabled, success, destructive, and
  realtime states are complete where relevant.
- English and Slovak layouts work with long user-authored content.
- Motion communicates state and respects reduced motion.

### Engineering gate

- Formatting, lint, typecheck, unit/integration tests, and production build pass.
- Relevant E2E journeys still pass.
- No new browser console errors or warnings.
- Behavior and data semantics remain unchanged unless the slice explicitly
  includes a UX behavior decision.

### Integration gate

- No duplicate primitives or unexplained one-off token values were added.
- Shared-file changes were reviewed by the orchestrator.
- Closed audit findings include evidence.
- New system decisions are reflected in `DESIGN.md` and `ai/decisions.md`.

## Completion and maintenance

The first refinement cycle is complete when:

1. Every listed route passes the surface gate.
2. P0 and P1 UI findings are zero.
3. P2 findings are zero or explicitly deferred in `ai/known-issues.md`.
4. The complete engineering gate passes.
5. Two consecutive route reviews require no new foundational token or component
   change.
6. The product owner approves the final cross-app screenshot set.

Afterward, the same audit → plan → implement → verify → review loop becomes the
maintenance framework for each new feature. Run a periodic whole-app audit, but
do not allow the process to become an endless autonomous rewrite. Work stops at
the documented gates and resumes only for a new scoped finding or product need.

## Immediate next steps

1. Review and approve or amend this operating plan.
2. Finish the Impeccable product-context interview and write `PRODUCT.md`.
3. Run Phase 0 and produce the inventory, audit ledger, and baseline screenshot
   set.
4. Co-design the system directions and select one.
5. Write and approve `DESIGN.md`.
6. Implement the shared foundations and dashboard pilot.
7. Begin the gated route loop only after the pilot is approved.
