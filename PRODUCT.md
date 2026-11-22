# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- **Atleta (primary user)**: trains for hypertrophy, strength, and body composition; operates the PWA one-handed in the gym on mobile during a Sesión de Entrenamiento and reviews progress, Mesociclos, Nutrición, and Coach conversations on desktop or mobile.
- **Curador (privileged role)**: invited domain expert who evaluates Estudios Candidatos, curates the Base de Conocimiento (Fichas de Evidencia), oversees the Corte Mensual, and issues private access invitations to Atletas.

## Product Purpose

Fitness Coach is an invitation-only Spanish-language PWA combining an AI sports-science Coach with structured personal tracking (Perfil Vivo, Mesociclo, Sesión de Entrenamiento, Fase Nutricional, Check-in semanal) grounded in a human-curated Base de Conocimiento. Success means an Atleta logs workouts and weekly Check-ins with minimal friction, visualizes progression clearly, and receives evidence-cited coaching strictly isolated to their own history.

## Positioning

Unlike generic fitness trackers or ungrounded AI chat wrappers, Fitness Coach enforces a strict epistemological boundary: the Coach answers from a human-curated Base de Conocimiento (Fichas de Evidencia with evidence grades and currency status, kept strictly separate from Temas de Actualidad and live quarantined web search) combined with the Atleta's explicit, editable Perfil Vivo.

## Operating Context

- **Gym floor (mobile, one-handed, often dim ambient light)**: fast logging of sets, reps, load (`kg`/`lb`), RIR, voice dictation, and natural-language drafts; offline-resilient local draft persistence and Render cold-start awareness (`ColdStartBanner`).
- **Weekly review & planning (desktop and mobile)**: adjusting Mesociclos, reviewing multi-week effective volume and estimated 1RM (e1RM) trends, logging weekly Check-ins against target weight rate, and chatting with the Coach with inline citation inspection.
- **Monthly curation (desktop/mobile, Curador only)**: triaging Estudios Candidatos, running or resuming the Corte Mensual, and managing private Atleta invitations outside scientific workflows.

## Capabilities and Constraints

- **Language & domain vocabulary**: Spanish user-facing copy strictly aligned with `GLOSSARY.md` (enforced by automated `glossaryGuard.test.ts`). Prohibited synonyms (`usuario`, `cliente`, `bot`, `rutina`, `dieta`, `paper`, `RAG`, etc.) must not appear in UI copy.
- **Multi-Atleta isolation (ADR-0002)**: strict per-Atleta data ownership across backend APIs and local storage; Curador administration (invitations, curation inbox, monthly cut) hidden and denied to non-Curador Atletas.
- **Human-curated science (ADR-0001)**: no automated ingestion into the Base de Conocimiento without Curador approval.
- **Lightweight zero-cost deployment (ADR-0003)**: native lightweight SVG data visualizations (no heavy charting libraries), lazy-loaded routes and Curador panels, and strict FastAPI → OpenAPI → TypeScript contract synchronization.
- **Frontend HTTP seam**: all API calls flow through `apiClient` / `coldStartAwareFetch` (`frontend/src/api/client.ts`) so cold starts surface cleanly.

## Brand Commitments

- **Name**: Fitness Coach.
- **Visual identity**: «Cuaderno de Hierro» — architectural steel, calibrated brass accent, and glacier science secondary tone across both dark (default gym-ready) and light themes.
- **Voice**: precise, calm, evidence-based technical Spanish; controls name their action, errors explain problem and recovery, and no hype or generic fitness clichés.

## Evidence on Hand

- Domain glossary: `GLOSSARY.md`.
- Visual design system specification: `DESIGN.md` and `.impeccable/design.json`.
- Architectural decisions: `docs/adr/` (ADR-0001, ADR-0002, ADR-0003).
- Working frontend PWA (`frontend/src/`), FastAPI backend (`backend/src/fitness_coach/`), and design tokens (`frontend/src/theme/tokens.css`).
- Absence to preserve: no fabricated athlete testimonials, pricing tiers, marketing claims, or unverified scientific citations.

## Product Principles

1. **Operate-mode precision over decoration**: every screen serves a clear task with one focal surface and familiar, predictable controls.
2. **One-handed gym ergonomics**: minimize scrolling, typing, and repeated fields during active training; prevent silent data corruption (empty loads, Spanish decimals).
3. **Visible, honest progression**: surface real trends (weekly weight vs target rate, multi-week effective volume, e1RM, personal records) with truthful empty/insufficient-data states.
4. **Epistemological and role clarity**: keep curated evidence separate from trending topics and keep Curador account administration separate from scientific views.
5. **Progressive disclosure**: keep primary workflows uncluttered while making advanced filters, inline glossary help, and onboarding guidance available on demand.

## Accessibility & Inclusion

- WCAG AA contrast (≥4.5:1 body/placeholders, ≥3:1 large text and UI components) in both dark and light themes.
- Touch targets ≥44px on mobile for primary controls, steppers, and navigation.
- Full keyboard navigation, focus management in modals/drawers, semantic landmarks, `role="status"` for live feedback, and accessible text summaries on every data visualization.
- Respect `prefers-reduced-motion` and `prefers-color-scheme`.
