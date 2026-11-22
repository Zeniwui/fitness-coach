---
name: "Fitness Coach — Cuaderno de Hierro"
description: "Architectural steel, calibrated brass, and glacier science design system for an evidence-based Spanish-language sports-science coaching PWA."
colors:
  calibrated-brass: "#d4a14b"
  calibrated-brass-hover: "#e2b260"
  calibrated-brass-soft: "#382e1b"
  calibrated-brass-ink: "#16120b"
  calibrated-brass-text: "#e9c078"
  glacier-science: "#63a4db"
  glacier-science-soft: "#1b3044"
  glacier-science-text: "#90c4ee"
  emerald-signal: "#53bf87"
  emerald-signal-soft: "#173829"
  emerald-signal-text: "#87e0b0"
  amber-caution: "#e3974a"
  amber-caution-soft: "#3f2813"
  amber-caution-text: "#f5be81"
  crimson-alert: "#e3626c"
  crimson-alert-soft: "#421a21"
  crimson-alert-text: "#f7a1a8"
  steel-canvas: "#14171d"
  steel-surface: "#1c212b"
  steel-surface-muted: "#242a36"
  steel-surface-elevated: "#222834"
  steel-rail: "#101318"
  steel-rail-active: "#302a1d"
  chalk-ink: "#eceff4"
  slate-ink-muted: "#a4adbb"
  slate-ink-subtle: "#8e98a8"
  hairline-border: "#303847"
  control-border: "#626e82"
typography:
  display:
    fontFamily: "Archivo, system-ui, -apple-system, sans-serif"
    fontSize: "1.75rem"
    fontWeight: 700
    lineHeight: 1.12
    letterSpacing: "-0.02em"
  headline:
    fontFamily: "Archivo, system-ui, -apple-system, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "-0.02em"
  title:
    fontFamily: "Archivo, system-ui, -apple-system, sans-serif"
    fontSize: "1rem"
    fontWeight: 700
    lineHeight: 1.25
    letterSpacing: "-0.02em"
  body:
    fontFamily: "DM Sans, system-ui, -apple-system, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.55
    letterSpacing: "0em"
  label:
    fontFamily: "DM Sans, system-ui, -apple-system, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: "0em"
rounded:
  control: "6px"
  panel: "8px"
  pill: "9999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "32px"
components:
  button-primary:
    backgroundColor: "{colors.calibrated-brass}"
    textColor: "{colors.calibrated-brass-ink}"
    typography: "{typography.body}"
    rounded: "{rounded.control}"
    padding: "8px 16px"
    height: "44px"
  button-primary-hover:
    backgroundColor: "{colors.calibrated-brass-hover}"
    textColor: "{colors.calibrated-brass-ink}"
  button-secondary:
    backgroundColor: "{colors.steel-surface}"
    textColor: "{colors.chalk-ink}"
    typography: "{typography.body}"
    rounded: "{rounded.control}"
    padding: "8px 16px"
    height: "44px"
  button-soft:
    backgroundColor: "{colors.calibrated-brass-soft}"
    textColor: "{colors.calibrated-brass-text}"
    typography: "{typography.label}"
    rounded: "{rounded.control}"
    padding: "6px 12px"
    height: "44px"
  button-danger:
    backgroundColor: "{colors.crimson-alert-soft}"
    textColor: "{colors.crimson-alert-text}"
    typography: "{typography.label}"
    rounded: "{rounded.control}"
    padding: "6px 12px"
    height: "44px"
  input-default:
    backgroundColor: "{colors.steel-surface}"
    textColor: "{colors.chalk-ink}"
    typography: "{typography.body}"
    rounded: "{rounded.control}"
    padding: "8px 12px"
    height: "44px"
  surface-panel:
    backgroundColor: "{colors.steel-surface}"
    textColor: "{colors.chalk-ink}"
    rounded: "{rounded.panel}"
    padding: "20px"
  badge-secondary:
    backgroundColor: "{colors.glacier-science-soft}"
    textColor: "{colors.glacier-science-text}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "2px 10px"
---

# Design System: Fitness Coach — Cuaderno de Hierro

## Overview

**Creative North Star: "Cuaderno de Hierro"**

Fitness Coach is an Operate-mode training, nutrition, and sports-science workspace built like a calibrated steel training notebook. Its default dark appearance is engineered for dim gym floors and one-handed mobile logging, while a matched high-contrast light appearance serves bright desk reviews without altering hierarchy or spatial rhythm.

Every visual decision serves calm precision, rapid numerical scanning, and clear separation between personal tracking and curated scientific evidence. Rather than chasing fitness-app neon gradients or motivational clutter, the interface relies on disciplined slate-steel layers, warm calibrated brass for primary actions, cool glacier blue for scientific credibility, and crisp tabular numerals across loads, reps, RIR, calories, and progression charts.

The design system rejects decorative cards-within-cards, gradient text, eyebrow kickers above headings, hard neobrutalist block shadows, and emoji icon substitutes.

**Key Characteristics:**
- Dark-first architectural steel palette with an exact semantic light theme twin via `html[data-theme="light"]`.
- Warm Calibrated Brass reserved strictly for primary actions, focal borders, and active selection states.
- Glacier Science blue dedicated exclusively to curated evidence, inline contextual help, and Curador role markers.
- Crisp mechanical geometry (`6px` controls, `8px` panels) paired with tabular numerals and `≥44px` mobile touch targets.
- Progressive disclosure for secondary workflows (advanced search filters, inline glossary help, disposable onboarding, two-step destructive confirmations).

## Colors

The palette anchors on cool architectural steel neutrals in dark mode (normative values in the frontmatter; light-mode equivalents live in `frontend/src/theme/tokens.css`), accented by warm calibrated brass for Athlete action and cool glacier blue for scientific authority.

### Primary
- **Calibrated Brass** (`calibrated-brass`, hover `calibrated-brass-hover`, ink `calibrated-brass-ink`): Primary calls to action, active focus rings, text carets, active navigation indicators, and the top 2px rule on focal surfaces.
- **Brass Tint & Label** (`calibrated-brass-soft`, `calibrated-brass-text`): Soft-variant buttons, selected conversation threads, active Mesociclo/phase highlights, and high-contrast brass text on dark surfaces.

### Secondary
- **Glacier Science** (`glacier-science`, soft `glacier-science-soft`, text `glacier-science-text`): Base de Conocimiento evidence badges, Coach attribution labels, Curador role indicators, inline contextual `HelpTip` disclosures, and secondary chart series.

### Tertiary
- **Emerald Signal** (`emerald-signal`, soft `emerald-signal-soft`, text `emerald-signal-text`): Completed training sets, active valid Evidence Cards, onboarding step completion, and positive save confirmations.
- **Amber Caution** (`amber-caution`, soft `amber-caution-soft`, text `amber-caution-text`): Quarantined external web search results, deload watch warnings, superseded-card notices, and Living Profile update proposals.
- **Crimson Alert** (`crimson-alert`, soft `crimson-alert-soft`, text `crimson-alert-text`): Destructive confirmation buttons, validation errors, and error alert banners.

### Neutral
- **Steel Canvas & Surfaces** (`steel-canvas`, `steel-surface`, `steel-surface-muted`, `steel-surface-elevated`): Stepped neutral elevation from page background (`steel-canvas`) to primary cards (`steel-surface`), recessed inset regions and table headers (`steel-surface-muted`), and floating modals (`steel-surface-elevated`).
- **Navigation Rail** (`steel-rail`, `steel-rail-active`): Dedicated deeper-steel desktop sidebar layer visually separating persistent navigation from the working canvas.
- **Typography & Hairlines** (`chalk-ink`, `slate-ink-muted`, `slate-ink-subtle`, `hairline-border`, `control-border`): High-contrast primary copy, secondary labels, subtle metadata, structural dividers (`hairline-border`), and interactive field borders (`control-border`).

### Named Rules
**The Brass Budget Rule.** Calibrated Brass marks primary actions, current selection, focus rings, and at most one focal panel per screen. Never flood inactive controls or multiple competing banners with primary accent fills.

**The Epistemological Color Rule.** Glacier Science denotes curated evidence, scientific help, and Curador tools; Amber Caution denotes quarantined external sources or pending proposals. Never mix those semantic tones across boundaries.

## Typography

**Display Font:** Archivo (fallback: `system-ui, -apple-system, sans-serif`)
**Body Font:** DM Sans (fallback: `system-ui, -apple-system, sans-serif`)

**Character:** Archivo brings compact, engineered solidity to page and section headings without theatrical flair, while DM Sans delivers high legibility at small mobile sizes for dense training tables, forms, and long-form Coach explanations.

### Hierarchy
- **Display** (700, `1.75rem`, line-height `1.12`, tracking `-0.02em`): Page-level `<h1>` titles in `PageHeader` and the login hero heading (`text-wrap: balance`).
- **Headline** (700, `1.25rem`, line-height `1.2`, tracking `-0.02em`): Primary panel titles such as active Fase Nutricional, Evidence Card titles, and Perfil Vivo form headers.
- **Title** (700, `1rem`, line-height `1.25`, tracking `-0.02em`): Sub-section headings, Markdown `##`/`###` headings inside Coach responses, and modal dialog titles.
- **Body** (400, `0.875rem`, line-height `1.55`): Standard reading copy, Coach prose (constrained to `65–70ch` max line measure), form inputs, and table body cells.
- **Label** (600, `0.75rem`, line-height `1.4`): Field labels, badges, compact table headers, secondary metadata, and segmented tab triggers.

### Named Rules
**The Tabular Measurement Rule.** Every numeric measurement—loads (`kg`/`lb`), reps, RIR, e1RM, calories, macros, weight trends, and counts—must enable `font-variant-numeric: tabular-nums` so columns and steppers stay rock-steady during input.

**The Fixed-Scale Operate Rule.** Use fixed `rem` steps rather than fluid `clamp()` headings inside authenticated surfaces so hierarchy stays predictable across desktop rails and mobile viewports.

## Layout

The authenticated shell anchors on a two-mode responsive navigation model: a fixed bottom 5-column navigation bar (`52px` tall plus `env(safe-area-inset-bottom)`) on mobile and a fixed `256px` (`16rem`) left navigation rail at the `lg` (`1024px`) breakpoint. A sticky top header carries the Athlete name, theme toggle, logout control, and—exclusively for Curadores—the `Curador` badge and `Invitaciones` navigation link.

Main content sits inside a centered `max-w-6xl` (`1152px`) container with `16px` horizontal padding on mobile (`24px` on `sm`, `32px` on `lg`) and `24px–32px` vertical breathing room. Multi-column workspaces use a 12-column grid at `lg`: `8 / 4` on Coach (conversation + sidebar threads/citations), `7 / 5` on Perfil Vivo and Training Sessions, and `5 / 7` or tabbed full-width layouts on Nutrición. Spacing follows a strict 4px/8px rhythm (`gap-2` for tight control pairs, `gap-4` inside panels, `space-y-6` between major sections).

## Elevation & Depth

Cuaderno de Hierro uses a hybrid tonal-layering and restrained ambient-shadow model. At rest, depth is communicated primarily by stepping from `steel-canvas` to `steel-surface` with crisp `1px` `hairline-border` strokes rather than heavy drop shadows. Subtle panel shadows anchor primary surfaces, while deeper diffused elevation is reserved strictly for modal dialogs and bottom sheets above a blurred scrim (`bg-scrim/65`).

### Shadow Vocabulary
- **Panel Shadow** (`box-shadow: 0 1px 2px rgb(0 0 0 / 0.32)` dark; `0 1px 2px rgb(26 30 38 / 0.06)` light): Subtle grounding beneath resting `Surface variant="default"` panels and Coach assistant messages.
- **Focal Accent Rule** (`box-shadow: inset 0 2px 0 rgb(var(--c-accent) / 0.78), var(--shadow-panel)`): Precision 2px top brass bar marking the single primary focal container on a screen (`Surface variant="focal"`).
- **Elevated Overlay** (`box-shadow: 0 16px 36px -12px rgb(0 0 0 / 0.58)` dark; `0 12px 26px -10px rgb(26 30 38 / 0.16)` light): Modals, bottom sheets, and the login focal card.

### Named Rules
**The Single Focal Surface Rule.** Show at most one `Surface variant="focal"` per screen so the Athlete immediately recognizes the primary work surface.

**The Flat-Inset Rule.** Recessed containers (`Surface variant="inset"`), table shells, and grouped exercise rows stay flat with hairline borders—never nest elevated shadows inside another card.

## Shapes

Form language is crisp, machined, and consistent across every screen:
- **Interactive controls (`6px` / `0.375rem`)**: Buttons, icon buttons, text inputs, selects, textareas, table wrappers, and inline disclosures share `--radius-control`.
- **Structural panels (`8px` / `0.5rem`)**: Cards, segmented tab tracks, alert banners, and chat message bubbles share `--radius-panel`.
- **Status pills (`9999px`)**: `Badge` chips and counter pills use full pill rounding to distinguish read-only metadata from clickable rectangular buttons.
- **Structural dividers**: `1px solid` rules (`section-rule` under `PageHeader`, `divide-y divide-line` between exercise set rows and table rows) keep dense data scannable without extra card chrome.

## Components

Every component is built for Operate-mode predictability: consistent radii, uniform `150–200ms` color transitions, `2px` brass `:focus-visible` outlines with `2px` offset, and `≥44px` touch targets on mobile.

### Buttons
- **Shape:** Machined control corners (`6px` radius).
- **Primary:** Calibrated Brass fill (`calibrated-brass`) with dark brass ink (`calibrated-brass-ink`), `600` weight, `44px` minimum height on mobile (`40px` on `sm+` for `md`, `36px` for `sm`, `46px` for `lg`).
- **Hover / Focus:** Transitions smoothly to `calibrated-brass-hover` on hover and displays a `2px` solid brass focus outline on keyboard focus; disabled buttons drop to `50%` opacity with `not-allowed` cursor.
- **Secondary / Soft / Ghost / Warning / Danger:** Secondary uses `steel-surface` with `control-border`; Soft uses `calibrated-brass-soft` with `calibrated-brass-text`; Ghost stays transparent until hover; Warning and Danger map directly to their semantic soft/solid tokens.

### Chips
- **Style:** Pill-shaped (`9999px`) read-only `Badge` tags with `1px` tinted borders (`30–35%` semantic alpha), soft tinted backgrounds, and `12px` medium text (`2px 10px` padding).
- **State:** Six semantic tones (`neutral`, `accent`, `secondary`, `success`, `warning`, `danger`) used for validity status, evidence level, completed set counts, and Curador role tags.

### Cards / Containers
- **Corner Style:** Panel radius (`8px`).
- **Background:** `steel-surface` (`default` and `focal`), `steel-surface-muted` at 70% opacity (`inset`), `steel-surface-elevated` (`elevated`), and semantic soft tints (`accent`, `warning`, `danger`).
- **Shadow Strategy:** `Panel Shadow` on `default`, `Focal Accent Rule` on `focal`, `Elevated Overlay` on `elevated`, none on `inset`.
- **Border:** `1px` `hairline-border` on neutral surfaces; `35%` semantic border alpha on tinted callouts.
- **Internal Padding:** `none` (`0`), `sm` (`14px`), `md` (`20px`), `lg` (`24px` mobile / `28px` `sm+`).

### Inputs / Fields
- **Style:** `steel-surface` background, `1px` `control-border`, `6px` radius, `chalk-ink` value text, and `slate-ink-subtle` placeholders (`≥4.5:1` contrast). Default height `44px` mobile / `40px` desktop (`34px` desktop for `compact` inline forms).
- **Focus:** Border shifts to `calibrated-brass` with a `2px` brass outline and subtle `25%` brass ring.
- **Error / Disabled:** `aria-invalid="true"` switches border to `crimson-alert`; disabled inputs render at `60%` opacity.

### Navigation
- **Mobile:** Fixed bottom 5-column bar on `steel-surface` with top `hairline-border`, `52px` minimum item height, `20px` Lucide icons above `12px` labels, and a `2px` top brass indicator bar on the active route.
- **Desktop (`≥1024px`):** Fixed `256px` left rail on `steel-rail` with brand header, vertical icon+label links (`40px` min height), active `steel-rail-active` fill with left `2px` brass indicator, and grounded domain footer.

### SegmentedTabs
Horizontal tab strip (`role="tablist"`) inside a recessed `steel-surface-muted` track (`8px` radius, `4px` padding) with full `ArrowLeft` / `ArrowRight` / `Home` / `End` keyboard navigation. Active tabs lift onto `steel-surface` with `chalk-ink` text; optional count pills and brass status dots surface pending items (such as Coach nutritional adjustments) cleanly.

### HelpTip
Touch-friendly inline contextual help disclosure (`≥44×44px` on mobile, `≥30px` on desktop) using a `HelpCircle` icon, `aria-expanded`, and `aria-controls` with zero external popper dependencies. Clicking or pressing `Escape` toggles a concise Glacier Science note (`max-w-[65ch]`) directly in flow so explanations of RIR, TDEE, PEDs, and scientific validity never clip inside scrollable panels.

### ConfirmActionButton
Two-step inline confirmation control that replaces disruptive browser `window.confirm` popups for destructive operations (deleting sessions, conversations, injuries, or completing phases). Clicking once reveals a grouped `Confirmar` + `Cancelar` pair inline, protecting against accidental gym-floor taps without forcing a modal.

### SvgLineChart
Zero-dependency responsive SVG line chart (`viewBox="0 0 560 224"`, `role="img"`, `<title>`, `aria-label`) backed by pure coordinate scaling (`chartMath.ts`) and shared chrome (`SvgChartShared.tsx`). Renders Calibrated Brass primary trajectories (with soft 12% area fill and surface-ringed data points) alongside dashed Glacier Science comparison series (such as Fase Nutricional target weight projections or best-load reference lines), tabular summary strips, truthful empty states below `minPoints`, and a collapsible accessible HTML `<table>` breakdown.

### SvgBarChart
Zero-dependency responsive SVG vertical bar chart (`viewBox="0 0 560 224"`, `role="img"`, `<title>`, `aria-label`) for multi-week effective hypertrophy set volume (`direct = 1.0`, `secondary = 0.5`). Pairs rounded (`3px`) Calibrated Brass or Glacier Science bars with an optional dashed planned-volume target rule, tabular-numeral bar annotations, shared `ChartSummaryStrip` and `ChartYAxisGrid` primitives, truthful insufficient-data states, and an expandable accessible data table.

## Do's and Don'ts

### Do:
- **Do** preserve strict `GLOSSARY.md` Spanish terminology across every label, button, error, and help disclosure (`Atleta`, `Coach`, `Curador`, `Perfil Vivo`, `Mesociclo`, `Sesión de Entrenamiento`, `Fase Nutricional`, `Check-in`, `Base de Conocimiento`, `Ficha de Evidencia`, `Estudio Candidato`, `Corte Mensual`).
- **Do** keep at most one `Surface variant="focal"` visible per view and use `Surface variant="inset"` for secondary or empty-state guidance.
- **Do** enforce `≥44px` minimum touch targets on mobile for every interactive button, stepper, link, and `HelpTip` trigger.
- **Do** apply `tabular-nums` to all loads, reps, RIR, macro/calorie counts, chart axes, and table columns, and wrap Markdown tables in `overflow-x-auto`.
- **Do** respect `prefers-reduced-motion` by keeping state transitions calm (`120–200ms`) and disabling pulse/spin animations when reduced motion is requested.
- **Do** verify every color combination meets WCAG AA (`≥4.5:1` body/placeholder text, `≥3:1` large text and interactive borders) in both dark and light themes.

### Don't:
- **Don't** place eyebrow kickers, decorative section numbers (`01 / 02 / 03`), gradient text, or emoji stand-ins for icons anywhere in the interface.
- **Don't** nest shadowed cards inside cards or add colored thick `border-left` / `border-right` stripes (`>1px`) to cards, list items, or callouts.
- **Don't** use raw `fetch()` in frontend code or add heavy third-party charting/popper libraries; use `apiClient` and native semantic SVG/HTML primitives.
- **Don't** reach for a modal when an inline disclosure (`HelpTip`, collapsible filters, `ConfirmActionButton`, inline thread rename) solves the task without interrupting flow.
- **Don't** expose Curador navigation or endpoints to non-Curador Atletas or mix quarantined live search results with approved Fichas de Evidencia.
