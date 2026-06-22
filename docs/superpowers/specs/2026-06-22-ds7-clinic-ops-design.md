# DS7 — Clinic ops (Schedule + Recall) re-skin — Design Spec

**Sana:** 2026-06-22
**Milestone:** DS7 — Klinika ops (plan / lab / jadval / recall)
**Roadmap:** Obsidian `07-Dental-OS-Roadmap.md`
**Dizayn manbasi:** Dental OS `.dc.html` dump — `scrPlans` / `scrLab` / `scrSchedule` (+`scheduleGrid()`) / `scrRecall`, `chip()`, `bar()`, `TONES`.
**Gap brief:** `docs/superpowers/briefs/ds7-gap.md`
**Deferred katalog:** `docs/superpowers/briefs/ds12-deferred-backend.md`
**Qarorlar:** #32 (token remap-in-place, DS0 tugadi), #33 (pixel-parity, funksiya saqlanadi), #35 (per-milestone sikl).

---

## 1. Maqsad va doira (SCOPE — binding)

DS7 — **FRONT-END-ONLY re-skin** of the clinic-ops screens that **already exist in code**, using the DS0-locked tokens. Behavior, API, i18n semantics, permission/vertical gating — O'ZGARMAYDI (#33). DS0 tokenlari (`tokens.css`), shell, primitivlar QULFLANGAN — TEGILMAYDI.

**Headline (gap brief §0):** The Dental OS design depicts MORE than the code does on all four ops screens. DS7 **cannot** be a four-screen re-skin. Two of the four design screens (**Plans table**, **Lab table**) are cross-patient tenant-wide list screens that **do not exist in code and have no API**; the **Schedule** design centerpiece is a read-only week grid (no grid component); the **Recall** design adds 4 KPI cards + an **SMS-delivery** column for which **no data field / aggregate endpoint exists**. Under the binding scope policy (never add an API call, field, migration, endpoint, or hook), those surfaces are **deferred to DS12** and rendered absent — that is correct, not incomplete.

**DS7 = a 2-screen token/typographic re-skin:**
- **Schedule** (`features/schedule/components/*`) — re-skin to Dental OS chrome; keep the segment editor + time-off CRUD functionality.
- **Recall** (`features/recalls/components/RecallDashboard.tsx`) — re-skin the existing Mantine table to Dental OS chip/cell styling; keep all columns, buttons, handlers.

**Doiradan tashqari (INVARIANT — o'zgarmaydi):**
- `packages/ui/src/theme/*`, `packages/ui/src/primitives/*`, `apps/web/src/shell/*`, `apps/web/src/stores/ui-store.ts` — DS0 LOCKED.
- `apps/web/src/features/clinical/**` — **in practice untouched by DS7.** Standalone Plans/Lab list screens are deferred (need API). Patient-card tabs (`TreatmentPlansTab`, `LabOrdersTab`, …) are **DS3-owned** — never edit.
- Permission/vertical gating (`hasPermission('schedule.manage'/'recall.manage'/'patient.view_pii')`, feature flags).
- Routing registry, data hooks (`useWorkingHours`, `useTimeOff`, `useRecalls`, `useMarkRecallContacted`, `useUpdateRecall`), mappers, query keys.
- Backend — TEGILMAYDI.

**Token reminder:** mockup aliases `--mono` / `--ui` **DO NOT exist** in `tokens.css`. Use `--font-mono` / `--font-sans`. All other design tokens exist (`--ink`/`-2`/`-3`, `--surface-2`, `--border`, `--primary`/`-soft`, `--danger`/`-soft`, `--warning`/`-soft`, `--info`/`-soft`, `--success`/`-soft`, `--violet`/`-soft`, `--on-primary`, `--text-on-danger`, `--shadow-sm`, `--radius*`, `--radius-pill`).

## 2. Target design (the two screens we DO build)

### Screen C — Doctor schedule (`scrSchedule`) — re-skin only, NO grid
Design header: inline title "Doktor jadvali" + muted subtitle "Haftalik ish vaqti · availability"; right control cluster (doctor switcher + primary edit button). Body in design = read-only week grid.

**DS7 delivers (re-skin of existing editor screen):**
- Header: replace the bare `PageHead title` with the Dental OS inline title + **subtitle** ("availability"). Use a NEW i18n key `schedule.subtitle`.
- Doctor selector: design wants a segmented pill switcher (`--surface-2` track, active pill = `--surface` + `--shadow-sm`). **JUDGMENT (gap §5):** the searchable `Select` scales to many doctors; a fixed pill row does not (CLAUDE.md target = 1–10 doctors, but tenant-wide doctor lists can exceed that, and the `Select` is `searchable`). **Decision: keep the searchable `Select`, restyled to Dental OS surface/border/radius tokens.** Do NOT convert to a fixed pill switcher (functionality regression + overflow risk). Document the pill-switcher as a deferred visual nicety.
- **Branch `Select` STAYS** (design omits it; it is existing functionality — branch scoping of hours/time-off). Restyle only.
- Hours/Time-off tabs already use the locked `Tabs variant="pill"` primitive (DS0) — leave as-is.
- `WeeklyHoursEditor` / `TimeOffList` / `TimeOffForm`: token-pass styling (spacing, surface cards, button variants already use `@dental/ui` `Button` which inherits DS0). Keep `TimeInput` rows, add/remove/save, permission gating (`schedule.manage`), StateView states. No structural change.
- The design's read-only week grid is **NOT built** (deferred — see §4 T-grid).

### Screen D — Recall (`scrRecall`) — table re-skin only
Design: 4 KPI cards + a CSS-grid table with `chip`/`dueChip`/`smsChip`.

**DS7 delivers (re-skin of existing Mantine table):**
- **Restyle the existing Mantine `<Table>`** (gap risk §5 + characterization-test constraint — see §6). Do **NOT** rebuild as a `display:grid` div table. Apply: `--surface-2` header strip, uppercase 11px muted `<Table.Th>` labels (`--ink-3`, `letter-spacing`, `font-weight 600`), row hover `--surface-2` (already `highlightOnHover`).
- **Status column** → `StatusPill` (locked primitive) keeps the existing recall-workflow tone mapping (`statusTone`: contacted→info, scheduled→success, pending→warning, else neutral). This is the design's `chip` shape rendered by the already-tokenized `StatusPill`. **Do NOT relabel "Status" as "SMS holati"** — workflow status ≠ SMS delivery; the design's `smsChip` is a different (deferred) data concept (§4).
- **Muddat (due) cell** → `dueChip`: render the due date in a `StatusPill` whose tone derives from existing `isOverdue(dueDate, today)` / today comparison — overdue/today → `warning`/`accent`, future → `neutral`. Uses ONLY existing fields (`dueDate`, `localToday()`). Keep `Mono` for the date value if shown inline. (No new "Ertaga"/"Bugun" label keys required if we reuse the date string; if a Bugun/Ertaga textual chip is desired it would need keys — keep date-driven, key-free.)
- **Phone column STAYS** (PII-gated via `patient.view_pii`, `Mono`). Design drops it; keeping it preserves functionality.
- **All THREE action buttons STAY** (Bog'lanildi / Yozish / Bekor qilish). Design shows two; dropping the third = functionality loss. Re-skin variants only: primary "Yozish"-style + outline/subtle, using `@dental/ui` `Button` or Mantine variants that already inherit DS0 teal/red ramps. Keep `loading`, handlers, `Link` targets, permission gating (`recall.manage`).
- Patient name `Link`, reason label (`recallReasonLabelKey`), StateView empty/loading/error — unchanged.

## 3. Token map (component → token)

| Element | Token(s) |
|---|---|
| Card / screen surface | `--surface`, `--border`, `--radius-lg` (16px), `--shadow-sm` |
| Table header strip | `background: var(--surface-2)`; label `color: var(--ink-3)`, `font-size: var(--text-xs)`, uppercase, `--fw-semibold` |
| Row hover | `--surface-2` (Mantine `highlightOnHover`) |
| Cell body text | `--ink` / `--ink-2`; muted `--ink-3` |
| Mono cells (phone, date) | `Mono` primitive → `--font-mono` + tabular nums (already) |
| Status chip (recall workflow) | `StatusPill` tones → `--success`/`-bg`, `--warning`/`-bg`, `--info`/`-bg`, `--surface-2` (neutral) — primitive-internal |
| Due chip | `StatusPill` warning/accent/neutral |
| Primary action button | `@dental/ui Button variant="primary"` → `--primary` / `--on-primary` |
| Danger/outline action | `Button variant="default"` or Mantine `color="red"` → `--danger` / `--text-on-danger` (NEVER hardcode `#fff`) |
| Schedule subtitle | `--ink-3`, `--text-sm` |
| Schedule selector surfaces | `--surface`, `--border`, `--radius-md` |
| Editor segment rows | existing `Button`/`TimeInput`; spacing via `--space-*` |

**Dark-mode (DS0/CLI-80 WCAG AA):** never hardcode `color:#fff` on `--primary`/`--danger` fills — use `--on-primary` / `--text-on-danger`. `StatusPill` and `@dental/ui Button` already resolve these per scheme. Verify chip `--X-soft` bg + `--X` fg contrast holds in dark `:root` (tokens defined; the danger dashed/soft and info chip are the ones to eyeball). No new color hardcodes introduced.

## 4. Deferred / omitted (DS12 — net-new data/API; render absent)

These are EXPECTED absent. Do not fake, placeholder with invented numbers, or add a hook/endpoint/field.

| ID | Design surface | Why deferred | DS7 behavior |
|---|---|---|---|
| D-plans | Standalone tenant-wide **Treatment plans** table (`scrPlans`) + `bar()` progress + cross-patient rows | No tenant-wide list API (`GET /treatment-plans` requires `patientId`); needs new screen+route+hook. Exceeds #33. | NOT built. `/plans` nav stays `disabled:true`. clinical/ untouched. |
| D-lab | Standalone tenant-wide **Lab orders** table (`scrLab`) | Same — no cross-patient lab API. Exceeds #33. | NOT built. `/lab` nav stays `disabled:true`. clinical/ untouched. |
| D-kpi | Recall **4 KPI cards** (Bugun chaqirish / Bu hafta / Javob bergan / Konversiya) | No aggregate endpoint; "Konversiya"/"Javob bergan" have no field. | **Omit entirely** — do NOT render placeholder cards with fake/zero numbers (reads as real data). |
| D-sms | Recall **"SMS holati"** column (yuborildi/kutilmoqda/javob keldi) + **"So'nggi tashrif"** column | `RecallDto` has no SMS-delivery field and no last-visit date. Workflow `status` ≠ SMS delivery (semantically distinct — relabeling would mislead). | Column NOT added. Keep existing Status (workflow) column unrelabeled. |
| D-grid | Schedule **read-only week grid** (`scheduleGrid()`, absolute work/vacation blocks + time axis + legend) | No new API needed BUT: makes grid the default body + relocates editor behind an edit button = **behavior/UX change** (violates "behavior unchanged"), plus a non-trivial new component (time-axis math, absolute positioning) = real regression surface. Brief groups it as "surface for sign-off." Subagent cannot get interactive sign-off → safe default = defer. | NOT built. Editor stays as default body. Proposed as a DS-future stretch. |

## 5. Component-by-component plan

### Schedule (T1 — files: `features/schedule/components/*` + i18n owner)
1. `ScheduleScreen.tsx`: inline title + new `schedule.subtitle` subtitle; restyle doctor+branch `Select` to DS0 tokens (keep searchable, keep both selectors); keep pill `Tabs`; keep tab→editor/time-off switch.
2. `WeeklyHoursEditor.tsx`: token-pass — surface, spacing, weekday label typography, `TimeInput` row layout; keep all handlers, `schedule.manage` gating, StateView states.
3. `TimeOffList.tsx` / `TimeOffForm.tsx`: token-pass card/list/modal/form styling; keep `@mantine/form` + `zod4Resolver` form, CRUD, gating.
4. i18n: add `schedule.subtitle` (uz+ru parity). This is the ONLY new key in DS7 → T1 owns `packages/i18n` (touchesI18n=true).

### Recall (T2 — file: `features/recalls/components/RecallDashboard.tsx`)
1. Restyle existing `<Table>` header strip + uppercase muted labels (keep `Table.Thead/Tr/Th`, `tr`/`td` semantics — DO NOT rebuild as div-grid).
2. Status → `StatusPill` (already used; confirm tone mapping retained).
3. Due cell → `StatusPill` dueChip driven by `isOverdue`/`localToday` (no new field, no new key).
4. Action buttons → DS0 primary/outline variants; keep all three + handlers + gating.
5. Keep Phone (PII-gated), patient `Link`, reason, StateView states.
6. No new i18n keys (reuses `recall.*`).

## 6. Test strategy (TDD)

**Recall (T2) — characterization, MUST stay green:**
- `RecallDashboard.test.tsx` exists. It does `screen.getByText('Ali Valiyev').closest('tr')` and asserts translated strings (`'Profilaktika'`, `"Bog'lanildi"`, phone). **Constraint: keep Mantine `<Table>` (`tr`/`td`)** — a div-grid breaks `.closest('tr')`. Re-skin must keep these tests passing unchanged (no test edits needed). Run: `turbo test --filter @dental/web` (or vitest scoped).
- New assertions optional: header strip present, StatusPill rendered for status — but the binding rule is **existing test green**.

**Schedule (T1) — NEW characterization test (none exists today):**
- Add `ScheduleScreen.test.tsx` (or component-level) asserting: title + subtitle render; both doctor & branch selectors present; tab switch hours↔timeoff; `schedule.manage`-gated controls hidden without permission. Write the test FIRST (TDD), then re-skin to green. Mock `appointments.api` (`useDoctors`/`useBranches`) + `auth-store` like the recall test.
- `schedule.mappers.test.ts` must stay green (mappers untouched).

**Verify (both):** `typecheck` · `biome` · `turbo test --filter @dental/web` · `build`. **i18n parity:** `schedule.subtitle` present in BOTH uz.json + ru.json. **Role-by-role (NOT @owner):** recall.view-only hides actions; patient.view_pii-absent hides phone; schedule.manage-absent hides add/save/remove — assert in tests (recall already covers; schedule new test adds it).

**Dark mode:** visual check both screens light + dark; confirm no new `#fff`/hardcoded color on brand fills; chips legible.

## 7. Task breakdown (disjoint, file-disjoint)

| Task | Files | i18n | TDD |
|---|---|---|---|
| **T1 — Schedule re-skin + i18n** | `features/schedule/components/{ScheduleScreen,WeeklyHoursEditor,TimeOffList,TimeOffForm}.tsx` (+ new `ScheduleScreen.test.tsx`); `packages/i18n/src/locales/{uz,ru}.json` | **YES (owns)** | new screen characterization test |
| **T2 — Recall table re-skin** | `features/recalls/components/RecallDashboard.tsx` | no | existing `RecallDashboard.test.tsx` stays green |

Two leaf tasks, file-disjoint. Only T1 touches i18n (single new key `schedule.subtitle`). No task touches `clinical/` (deferred surfaces need API). Both independently TDD-able and parallel-safe (no shared files).

## 8. Risks

- **Recall div-grid trap:** rebuilding as CSS-grid breaks `.closest('tr')` characterization test. → Restyle Mantine `<Table>`; keep `tr`/`td`.
- **Functionality regression by matching design literally:** design drops Phone column, drops 3rd action button, drops branch selector. → KEEP all; re-skin only.
- **Fake-data trap:** rendering KPI placeholder cards with 0/dummy numbers reads as real. → Omit KPI cards entirely (D-kpi).
- **Misleading relabel:** "Status"→"SMS holati" conflates workflow with delivery. → Do not relabel; SMS column deferred (D-sms).
- **Dark contrast (CLI-80):** never hardcode `#fff` on brand fills; use `--on-primary`/`--text-on-danger`; verify chip soft-bg contrast in dark. Primitives already handle this — don't introduce new hardcodes.
- **i18n parity:** missing `ru` key → fallback/empty subtitle. Add both, run parity check.
- **Scope creep toward grid:** "reasonable stretch" pull on D-grid. → Deferred (behavior change + regression surface, no interactive sign-off available).
