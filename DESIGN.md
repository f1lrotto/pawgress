# Pawgress Design System

## Experience direction

**Scene:** A tired puppy owner checks a phone in soft kitchen light, records what
just happened in a few seconds, and leaves reassured that the household record
is current.

The chosen direction is **Refined Current Palette**: preserve Pawgress's forest,
ochre, and warm-neutral identity while making the product interface quieter,
more structured, and more familiar. This is a warm product UI, not a themed
scrapbook. The interface should disappear into the care task and let useful
patterns feel rewarding when they emerge.

## Color

All authored colors use OKLCH. Primitive values live in `src/index.css`; UI code
consumes semantic roles rather than palette steps.

### Primitive palette

| Family     | Token                      | Value                   | Purpose                    |
| ---------- | -------------------------- | ----------------------- | -------------------------- |
| Forest     | `--palette-forest-950`     | `oklch(0.22 0.032 156)` | Pressed state, deepest ink |
| Forest     | `--palette-forest-900`     | `oklch(0.28 0.037 156)` | Primary text               |
| Forest     | `--palette-forest-800`     | `oklch(0.34 0.05 157)`  | Strong secondary action    |
| Forest     | `--palette-forest-700`     | `oklch(0.42 0.072 157)` | Primary action             |
| Forest     | `--palette-forest-600`     | `oklch(0.5 0.085 157)`  | Focus and hover accents    |
| Warm       | `--palette-warm-50`        | `oklch(0.987 0.012 84)` | Raised surface             |
| Warm       | `--palette-warm-100`       | `oklch(0.962 0.018 86)` | Canvas                     |
| Warm       | `--palette-warm-200`       | `oklch(0.93 0.016 86)`  | Muted surface              |
| Warm       | `--palette-warm-250`       | `oklch(0.92 0.032 84)`  | Secondary surface          |
| Warm       | `--palette-warm-300`       | `oklch(0.8 0.028 93)`   | Subtle divider             |
| Warm       | `--palette-warm-400`       | `oklch(0.6 0.028 93)`   | Control boundary           |
| Ochre      | `--palette-ochre-300`      | `oklch(0.86 0.097 66)`  | Warm highlight             |
| Ochre      | `--palette-ochre-600`      | `oklch(0.54 0.13 65)`   | Warning text and marks     |
| Terracotta | `--palette-terracotta-600` | `oklch(0.54 0.19 27)`   | Error and destructive      |
| Terracotta | `--palette-terracotta-700` | `oklch(0.49 0.18 27)`   | Destructive hover          |
| Terracotta | `--palette-terracotta-800` | `oklch(0.44 0.16 27)`   | Destructive active         |
| Green      | `--palette-green-600`      | `oklch(0.48 0.12 145)`  | Secondary chart series     |
| Blue       | `--palette-blue-600`       | `oklch(0.47 0.09 230)`  | Informational state        |

### Semantic roles

| Role                                  | Value                   | Use                                     |
| ------------------------------------- | ----------------------- | --------------------------------------- |
| Canvas / `--background`               | `oklch(0.962 0.018 86)` | Page background                         |
| Surface / `--card`                    | `oklch(0.987 0.012 84)` | Grouped content and controls            |
| Subtle surface / `--muted`            | `oklch(0.93 0.016 86)`  | Quiet grouping and disabled fill        |
| Secondary surface / `--secondary`     | `oklch(0.92 0.032 84)`  | Selected or supporting regions          |
| Text / `--foreground`                 | `oklch(0.28 0.037 156)` | Headings, body, data                    |
| Muted text / `--muted-foreground`     | `oklch(0.45 0.035 154)` | Supporting text; 6.55:1 on canvas       |
| Primary / `--primary`                 | `oklch(0.42 0.072 157)` | Primary actions and current selection   |
| On primary                            | `oklch(0.98 0.01 85)`   | Text and icons; 7.70:1 on primary       |
| Quiet interaction / `--accent`        | `oklch(0.93 0.016 86)`  | Ghost hover and quiet selection         |
| Warm highlight / `--highlight`        | `oklch(0.86 0.097 66)`  | Meaningful warmth and progress          |
| Divider / `--border`                  | `oklch(0.8 0.028 93)`   | Section separation and quiet outlines   |
| Control border / `--input`            | `oklch(0.6 0.028 93)`   | Essential boundaries; 3.11:1 worst case |
| Focus / `--ring`                      | `oklch(0.5 0.085 157)`  | Focus ring only                         |
| Success                               | `oklch(0.43 0.1 145)`   | Confirmed and completed states          |
| Warning                               | `oklch(0.54 0.13 65)`   | Attention without failure               |
| Error / `--destructive`               | `oklch(0.54 0.19 27)`   | Errors and destructive actions          |
| Error hover / `--destructive-hover`   | `oklch(0.49 0.18 27)`   | Hovered destructive actions; 6.49:1     |
| Error active / `--destructive-active` | `oklch(0.44 0.16 27)`   | Pressed destructive actions; 7.96:1     |
| On error / `--destructive-foreground` | `oklch(0.98 0.01 85)`   | Text and icons; 5.26:1 on error         |
| Info                                  | `oklch(0.47 0.09 230)`  | Neutral system information              |

Body and interactive text must meet 4.5:1 contrast; large text must meet 3:1.
Controls and focus indicators must meet 3:1 against adjacent colors. Never rely
on color alone: pair status color with text and, where helpful, an icon. The
strong control boundary is 3.53:1 on canvas, 3.21:1 on muted, and 3.11:1 on the
secondary surface, its lowest permitted contrast. `--accent` is the standard
quiet hover/selection surface for ghost and outline controls; use `--highlight`
only when warmth or progress carries meaning, never as a generic hover fill.

## Typography

Use the humanist system UI stack defined by `--font-ui` for all product text.
Use `--font-brand` only for the Pawgress wordmark and, optionally, one welcome
title on authentication or onboarding. Serif never appears in labels, buttons,
inputs, navigation, data, or routine page and section headings.

The fixed product scale is:

| Role          | Size / line height   | Weight  |
| ------------- | -------------------- | ------- |
| Caption       | `0.75rem / 1rem`     | 500–600 |
| Small UI      | `0.875rem / 1.25rem` | 500–600 |
| Body          | `1rem / 1.5rem`      | 400–500 |
| Control       | `1rem / 1.25rem`     | 600     |
| Section title | `1.25rem / 1.625rem` | 650–700 |
| Page title    | `1.75rem / 2.125rem` | 700     |

Product headings do not use fluid `clamp()` sizing. Use `text-wrap: balance` on
headings and `text-wrap: pretty` on prose. Keep prose at 65–75 characters per
line. Sentence case is the default; uppercase tracking is reserved for genuine
abbreviations and compact machine-like data labels.

## Spacing and page shell

Use a 4px base with the practical sequence `4, 8, 12, 16, 24, 32, 40, 48, 64`.
Related label/control gaps are 8px; row and control groups use 12–16px; panel
padding is usually 16–24px; major sections use 32–40px. Vary spacing to show
relationships instead of putting every group in a card.

The shell supports 320px and above. Use 16px page gutters on phones, 24px on
tablets, and 32px on desktop, with a content maximum of 1280px. Navigation may
change structure at breakpoints, but type sizes remain fixed. Ordinary content
flows in one column on small screens; introduce columns only when each region
retains a useful minimum width. Prefer flex for rows and grid for genuinely
two-dimensional layouts.

## Shape and elevation

The radius scale is intentionally limited:

- 4px: compact controls and small internal details.
- 8px: buttons, fields, menu items, and rows.
- 12px: standard panels and grouped content.
- 16px: one large focal or friendly surface.
- Full pill: tags, statuses, compact filters, segmented choices, and circular
  icon-only controls only.

Elevation is restrained: `--elevation-1` is a 1–2px separation shadow and
`--elevation-2` is a maximum 8px-blur overlay shadow. Prefer a divider or
background shift for normal grouping. Do not combine a decorative border with a
wide shadow, use offset cartoon shadows, or stack elevated surfaces.

## Motion and layers

Motion explains state. Use 150ms for direct control feedback, 200ms for common
state changes, and 250ms for overlays. Use the shared ease-out curve. Animate
opacity and transform where possible; do not choreograph page load or animate
layout for decoration. Under `prefers-reduced-motion: reduce`, transitions and
animations become effectively instant and smooth scrolling is disabled.

Use the semantic layer order: base, dropdown, sticky, modal backdrop, modal,
toast, tooltip. Components must not invent arbitrary z-index values.

## Component system

Every interactive component defines default, hover, focus-visible, active,
disabled, and loading behavior. Components that accept data also define empty,
error, and success states where relevant.

### Actions

- **Primary button:** one per task area; forest fill, on-primary text, 8px
  radius, 44px minimum target, clear pending label or progress indicator.
- **Secondary button:** surface or quiet fill with a strong control boundary;
  it does not compete with primary.
- **Quiet button:** text/icon affordance for reversible or low-priority work;
  hover gains a subtle surface.
- **Destructive button:** error color appears only at the point of consequence;
  confirmation copy names what will be removed.
- **Icon button:** has an accessible name, 44px target, and tooltip when the
  symbol is not universally understood.

### Fields and choices

Fields use a visible label, optional hint, 44–48px control height, 8px radius,
strong control boundary, and a 2px focus ring with offset. Error text sits next
to the field, explains recovery, and is linked with `aria-describedby`.
Placeholder text is not a label. Checkboxes stay recognizable. Segmented
choices may be pill-shaped only when the options are few, mutually exclusive,
and fit without truncation.

### Navigation

Current location is conveyed by text weight plus background or indicator, not
color alone. Mobile and desktop navigation share labels and order. Dog and
locale selectors use standard select/menu affordances and tolerate longer
Slovak labels.

### Content patterns

- **List row:** primary label, useful metadata, optional status, then actions;
  use dividers and whitespace before individual cards.
- **Summary datum:** label and value align consistently; large numerals are
  reserved for information users actively compare.
- **Status:** short text and optional icon; pill shape is permitted because the
  treatment carries state.
- **Feedback:** plain-language message, appropriate live-region behavior, and a
  recovery action when one exists.
- **Empty state:** explains what belongs here and offers the next useful action;
  it is not a decorative card or merely “nothing here.”
- **Loading:** preserve page structure with skeletons for content; use compact
  progress feedback inside actions.
- **Confirmation:** prefer inline or progressive confirmation. Use a modal only
  when focus isolation and interruption are warranted.

## Responsive, content, and localization rules

Validate 320, 390, 768, and 1280px widths. No page may create horizontal
scrolling at 320px. Touch targets remain at least 44px without forcing unrelated
controls into pills. Tables and charts provide a compact or horizontally
scrollable treatment with a clear cue rather than shrinking text.

Test both English and Slovak, long dog and household names, multiline notes,
empty values, extreme numeric values, validation errors, loading, stale or
reconnecting data, and simultaneous updates. Use logical CSS properties where
practical. Never truncate essential actions or status; wrap supporting content
before truncating it.

## Data visualization

Use the five chart roles in order: forest, green, terracotta, ochre, blue.
Series colors identify data, not generic decoration or success/error state.
Charts require a visible title, unit, time range, readable axes, and a text or
table fallback for essential values. Direct labels are preferred over distant
legends. Patterns, markers, or labels must distinguish series when color vision
is limited. Empty and insufficient-data states explain what data is needed.

### Activity chronology

Daily activity uses the gentle surface/ink pairs defined in `src/index.css` for
pee, poop, meal, water, treat, wake, sleep, walk, play, training, and notes.
These colors categorize records; they never replace the visible time, label,
stable symbol, or the dot-versus-duration-bar shape.

On Home, screens at 640px and above show the complete proportional 24-hour
ribbon. Narrower screens preserve the same graph in a horizontally scrollable
five-hour window, initially showing four hours before Now and one hour after,
with the full day available by touch, pointer, or keyboard scrolling. Labels
are available by tapping the 44px event targets as well as hover and keyboard
focus; tapping elsewhere or scrolling dismisses them. Timeline uses the same
palette in a stable time/marker/content stream. Future time stays muted, dense
points cluster, and exact records remain available in the chronological list.

## Anti-AI contract

### Do

- Use standard controls and repeat the same component vocabulary everywhere.
- Emphasize task, time, sequence, progress, and exceptions.
- Group with spacing, dividers, and surface shifts before adding a card.
- Keep one primary action and make secondary actions visibly quieter.
- Reserve the serif and warm ochre for specific, meaningful moments.

### Don't

- Use pills for ordinary buttons, fields, navigation, or containers.
- Use giant editorial page titles, repeated uppercase kickers, or display serif
  in routine product UI.
- Use radii above 16px on cards and sections, nested cards, decorative rotations,
  dot or grid fields, or ornamental icon bubbles.
- Pair a 1px decorative border with a wide shadow, use cartoon offset shadows,
  or apply elevation to every panel.
- Reinvent familiar affordances, decorate inactive states with saturated color,
  or use motion that does not explain a state change.
