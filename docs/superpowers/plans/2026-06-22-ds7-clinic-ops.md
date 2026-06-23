# DS7 — Clinic ops re-skin — Implementation Plan

**Spec:** `docs/superpowers/specs/2026-06-22-ds7-clinic-ops-design.md`
**Gap brief:** `docs/superpowers/briefs/ds7-gap.md` · **Deferred:** `docs/superpowers/briefs/ds12-deferred-backend.md`
**Worktree:** `/home/madrimov/Projects/ds-wt-ds7`
**Scope:** FRONT-END-ONLY re-skin (Qaror #33). 2 existing screens (Schedule, Recall). Plans/Lab list, schedule grid, recall KPI/SMS = deferred to DS12 (no API/field/hook). DS0 tokens/shell/primitives LOCKED.

## Net scope decision (advisor-confirmed)

- **BUILD:** Schedule re-skin (editor screen, no grid) + Recall table re-skin (Mantine `<Table>` restyle).
- **DEFER (render absent, DS12):** standalone Plans table (D-plans), standalone Lab table (D-lab), recall 4 KPI cards (D-kpi), recall SMS-holati + So'nggi-tashrif columns (D-sms), schedule read-only week grid (D-grid).
- **clinical/ untouched** in practice (deferred screens need API; patient-card tabs are DS3-owned).

## Tasks (2 leaf, disjoint, parallel-safe)

### T1 — Schedule re-skin + i18n (owns i18n)
**Files:** `apps/web/src/features/schedule/components/ScheduleScreen.tsx`, `WeeklyHoursEditor.tsx`, `TimeOffList.tsx`, `TimeOffForm.tsx`, new `apps/web/src/features/schedule/components/ScheduleScreen.test.tsx`, `packages/i18n/src/locales/uz.json`, `packages/i18n/src/locales/ru.json`.
**TDD:** write `ScheduleScreen.test.tsx` first (title+subtitle, both selectors present, tab switch, `schedule.manage` gating) — none exists today. Keep `schedule.mappers.test.ts` green.
**Do:** inline title + new `schedule.subtitle` subtitle; restyle doctor+branch `Select` to DS0 tokens (KEEP searchable Select, KEEP branch selector — do NOT convert to fixed pill switcher); token-pass editor/time-off (surface, spacing, typography). Keep all handlers, CRUD, `@mantine/form`+zod4Resolver, permission gating, StateView, pill Tabs.
**i18n:** add `schedule.subtitle` to uz + ru (parity).
**Do NOT:** build the read-only week grid (D-grid deferred); add hooks/fields; edit primitives/shell/tokens.

### T2 — Recall table re-skin
**Files:** `apps/web/src/features/recalls/components/RecallDashboard.tsx`.
**TDD:** existing `RecallDashboard.test.tsx` MUST stay green unchanged. It uses `.closest('tr')` and asserts uz strings.
**Do:** **restyle the existing Mantine `<Table>`** (keep `Table.Thead/Tr/Th`, `tr`/`td`) — surface-2 header strip, uppercase muted labels; Status→`StatusPill` (keep workflow tone map); Due cell→dueChip `StatusPill` driven by `isOverdue`/`localToday` (no new field/key); action buttons→DS0 primary/outline (KEEP all THREE). Keep Phone (PII-gated, `Mono`), patient `Link`, reason, StateView states, all handlers + gating.
**Do NOT:** rebuild as div-grid (breaks `.closest('tr')`); add KPI cards (D-kpi); add SMS/last-visit columns or relabel Status (D-sms); drop Phone or any action; add hooks/fields; touch i18n.

## Sequencing

- T1 and T2 are file-disjoint → can run in parallel.
- Only T1 touches i18n (single new key `schedule.subtitle`). T2 needs no new keys → no i18n contention. (No separate i18n task needed.)
- Recall test asserts pre-existing uz strings; since T2 adds no keys, no i18n dependency for T2.

## Verify (each task + final)

`bun typecheck` · `biome` · `turbo test --filter @dental/web` · `build`.
i18n parity: `schedule.subtitle` in BOTH uz.json + ru.json.
Role-by-role (NOT @owner): recall.view-only hides actions; patient.view_pii-absent hides phone; schedule.manage-absent hides add/save/remove.
Dark mode: visual light+dark; no new `#fff`/hardcoded color on brand fills (use `--on-primary`/`--text-on-danger`); chips legible.

## Guardrails

- Mockup `--mono`/`--ui` aliases do not exist → use `--font-mono`/`--font-sans`.
- LOCKED (never edit): `tokens.css`, `packages/ui/src/theme/*`, `packages/ui/src/primitives/*`, `apps/web/src/shell/*`, `stores/ui-store.ts`.
- Touch only `features/schedule`, `features/recalls`, and (T1 only) i18n locales.
- Deferred items absent = correct. Never add backend call/field/migration/endpoint/hook.
