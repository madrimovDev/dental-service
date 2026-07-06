# DS1 (Dashboard) — Design-vs-Code Gap Brief

Milestone **DS1** of the Dental OS pixel-parity redesign. Read-only analysis. The DS0
foundation (tokens, fonts, sidebar/topbar shell) is **locked** — DS1 only re-skins /
re-layouts the dashboard **feature folder** using existing tokens. Functionality, data
hooks, API, permissions, and i18n key *meanings* stay unchanged (Qaror #33).

Sources:
- Design: `…/tool-results/toolu_01GKUFvM7wVKLrAXM5m5CcRj.txt` (Dental OS prototype, Dashboard section ≈ char offsets 18,600–29,000 for rendered layout; helpers `spark`/`revenueChart`/`delta`/`chip`/`iconChip` ≈ 177,000–186,000; KPI/appt/queue/recall/activity data ≈ 185,000–192,000).
- Tokens (locked): `packages/ui/src/theme/tokens.css`.
- Current code: `apps/web/src/features/dashboard/`.

---

## 1. Design summary (target)

The dashboard `<main>` has `padding: 24px 26px 60px`. The dashboard view is a single
column (`width:100%`, `animation:fadeUp .2s ease`) containing, top-to-bottom:

### 1a. Header row (action buttons only — NO greeting)
`display:flex; align-items:flex-end; justify-content:space-between; gap:16px; flex-wrap:wrap; margin-bottom:20px`.
The only rendered child is a button group pushed right via `margin-left:auto`:
- **«Yangi yozilish»** and **«Kassa»** buttons.
- Button style: `height:40px; padding:0 14px; flex; gap:8px; border:1px solid var(--border); border-radius:10px; background:var(--surface); color:var(--ink); font-size:13px; font-weight:600`; hover `borderColor:var(--border-strong)`; leading icon in `var(--ink-3)`.

> NOTE: `roleData()` defines `greet`/`sub` strings, but the dashboard layout does **not**
> render them. The page title ("Boshqaruv paneli") is carried by the **locked DS0 topbar**
> (`apps/web/src/shell/use-page-title.ts`). Do **not** add a greeting `<Title>` to the
> dashboard body — that would duplicate the topbar and diverge from the mockup.

### 1b. KPI row — 4 cards
`display:grid; grid-template-columns:repeat(4,1fr); gap:14px; margin-bottom:16px`.

Each card: `background:var(--surface); border:1px solid var(--border); border-radius:16px; padding:16px 16px 13px; box-shadow:var(--shadow-sm)`.
- **Top row** (`flex; justify-between; margin-bottom:12px`): label `span` (`font-size:11.5px; font-weight:600; letter-spacing:.02em; color:var(--ink-3); text-transform:uppercase`) + an **iconChip** (32×32, `border-radius:9px`, tinted bg+fg per tone: primary/info/violet/warning, icon 17px).
- **Body** (`flex; align-items:flex-end; justify-between; gap:8px`):
  - left: value `span` (`font-family:var(--font-mono); font-size:26px; font-weight:600; letter-spacing:-.03em; color:var(--ink); line-height:1`) + unit `span` (`font-size:11.5px; color:var(--ink-3)`), then a **delta** on `margin-top:7px`.
  - **delta**: `flex; gap:4px; font-size:12px; font-weight:700; color:var(--<tone>)`; tone ∈ {success,danger,warning,muted}; a 13px ▲/▼ arrow icon precedes the text (muted tone = no arrow, color `--ink-3`).
  - right: **sparkline** `flex:none`, SVG **78×30**, padding 3, gradient area fill (tone color 0.2→0 opacity) + 1.8px line + 2.3r end dot, tone-colored.

### 1c. Two-column body
`display:grid; grid-template-columns:minmax(0,1fr) 360px; gap:16px; align-items:start`.

**Left column** (`flex column; gap:16px`):

1. **Weekly revenue card** (rendered only when role has `rev:true` → manager & accountant):
   `background:var(--surface); border:1px solid var(--border); border-radius:16px; padding:18px 18px 8px; box-shadow:var(--shadow-sm)`.
   - Header (`flex; justify-between; margin-bottom:6px`): left title "Haftalik tushum" (`14.5px/700/--ink`) + subtitle "So'nggi 7 kun · so'mda" (`12px/--ink-3`); right a baseline-aligned figure `26.2` (`font-mono 20px/600/--ink`) + "mln" (`12px/--ink-3`) + "▲ 12.4%" (`12px/700/--success`).
   - **revenueChart** SVG: viewBox `0 0 560 190`, 100% width, height auto. 4 dashed grid lines (`stroke:var(--border); dasharray:2 5`), gradient area (`--primary` 0.24→0), 2.4px primary line, per-point dots (last = 4r filled primary; others 2.6r surface fill + primary stroke), x-axis day labels (`font-size:11; fill:var(--ink-3); font-mono`) like `15.06…21.06`.

2. **"Bugungi jadval" (today's schedule) card**:
   `background:var(--surface); border:1px solid var(--border); border-radius:16px; box-shadow:var(--shadow-sm); overflow:hidden`.
   - Header (`flex; justify-between; padding:16px 18px; border-bottom:1px solid var(--border)`): title "Bugungi jadval" (`14.5px/700`) + a text button "Kalendar ›" (`12.5px/600; color:var(--primary)`).
   - Rows (`<button>`, full-width, `flex; gap:14px; padding:12px 18px; border-top:1px solid var(--border)`; hover `background:var(--surface-2)`):
     - time `font-mono 13px/600; color:var(--ink-2); width:46px` · a 1px×34px `--border` divider · a flex-1 column (patient `13.5px/600/--ink`, truncated; line 2 = `service · doctor` `12px/--ink-3`, truncated) · duration `11.5px/--ink-3/font-mono` · **status chip**.
   - **status chip** = `chip()` primitive: `inline-flex; gap:6; padding:3px 9px; border-radius:999px; font-size:11.5px; font-weight:600`; tone-colored fg + soft bg (e.g. warning/info); optional pulsing 6px dot.

**Right rail** (`flex column; gap:16px`, fixed **360px**) — three cards, each
`background:var(--surface); border:1px solid var(--border); border-radius:16px; box-shadow:var(--shadow-sm); padding:16px 16px 6px` (activity card `…8px`):

1. **"Navbat holati"** (queue): header title (`14px/700`) + a mono pill `3 kutmoqda` (`font-mono 12px/700; color:var(--warning); background:var(--warning-soft); border-radius:99px; padding:2px 9px`). Rows (`flex; gap:11px; padding:9px 0; border-top:1px solid var(--border)`): queue number badge (`font-mono 13px/700; width:42px; text-align:center; background:var(--surface-2); border-radius:7px; padding:5px 0`) · flex-1 (patient `13px/600` + meta `11.5px/--ink-3`) · status chip.
2. **"Recall — bugun"**: header title + a refresh icon in `var(--primary)`. Rows (`flex; gap:11px; padding:10px 0; border-top:1px solid var(--border)`): flex-1 (patient `13px/600` + reason `11.5px/--ink-3`) · due chip.
3. **"So'nggi faollik"** (recent activity): title `14px/700; margin-bottom:6px`. Rows (`flex; gap:11px; padding:9px 0`): 30×30 icon tile (`border-radius:8px; background:var(--surface-2); color:var(--ink-2)`) · flex-1 (line `12.5px/--ink; line-height:1.35` with bold who + bold primary target; time `11px/--ink-3`).

### Tokens used in the design (all exist in locked tokens.css unless flagged)
`--surface`, `--surface-2`, `--border`, `--border-strong`, `--ink`(=`--text`), `--ink-2`, `--ink-3`, `--primary`, `--primary-strong`, `--on-primary`, `--success`, `--warning`, `--warning-soft`(=`--warning-bg`), `--danger`, `--info`, `--violet`, `--shadow-sm`, `--shadow`, `--font-mono`.

**Token gaps / off-scale literals to reconcile (Qaror #33 vs token discipline):**
- `var(--mono)` and `var(--ui)` in the prototype are **prototype-local aliases that do NOT exist** in tokens.css. Use `var(--font-mono)` (mono figures) and `var(--font-sans)` / default body font. Do **not** introduce `--mono`/`--ui`.
- **Card radius `16px`** has no token (scale tops at `--radius-xl: 14px`). Also `22px` radius appears only in the *Navbat board* view (out of DS1 scope).
- **KPI grid `gap:14px`** and card **`padding:…13px`** are off the 4px scale (tokens give 12/16).
- **KPI value `26px` / `letter-spacing:-.03em`** is between `--text-2xl:22px` and `--text-display:27px`; mockup uses `--ls-tight:-.02em` elsewhere but `-.03em` here.
- Numerous literal `font-size` values (`11.5px`, `12.5px`, `13.5px`, `14.5px`) map closely to tokens (`--text-xs:11`, `--text-sm:12.5`, `--text-base:13.5`, `--text-md:14.5`) — prefer tokens where they line up exactly.
- **Recommendation:** bind to tokens where an exact match exists; for the handful of genuinely off-scale values (radius 16, gap 14, value 26/-.03em, padding 13) keep **literals to preserve pixel parity** and add a short comment. Do not edit tokens.css.

---

## 2. Current state

Feature folder `apps/web/src/features/dashboard/`:

| File | Role |
|---|---|
| `DashboardRouter.tsx` | Picks dashboard by role: `@owner`→`ManagerDashboard`; else `DASHBOARD_BY_ROLE[roleKey]`; else `GenericDashboard`. |
| `role-dashboard-map.ts` | roleKey → component map. |
| `dashboard.api.ts` | Hooks: `useTodayRange`, `useDefaultPeriod` (last 30 days), `useManagerKpi` (revenue/appointmentStats/doctorWorkload/planCompletion — **single aggregates only**), `useRevenueReport`, `useDoctorAppointments`, `useActiveLabOrders`, `useBranchNames`, `useDoctorNames`. All reuse existing `@dental/api-client` report/list endpoints — **no new backend**. |
| `dashboard.keys.ts`, `dashboard.mappers.ts` | Query-key factory + id→name maps, lab-order filter. |
| `onboarding.ts` | Dismiss state for the onboarding checklist. |
| `components/ManagerDashboard.tsx` | `<Container size="lg">` + `<Title order={2}>` + `OnboardingChecklist` + 4× `StatCard` (`SimpleGrid` 1/2/4) + `Grid` with 2× `MiniList` (revenue-by-branch, top-doctors) + 1× `BarMini` (revenue-by-service). |
| `components/DoctorDashboard.tsx` | 1 `StatCard` (today total) + 2-col `Grid`: `MiniList` today appointments + a pending placeholder. |
| `components/ReceptionistDashboard.tsx` | 3× `StatCard` (today total / no-show / queue) + `MiniList`s; uses `useAppointments` + `useQueueToday`. |
| `components/AccountantDashboard.tsx` | 2× `StatCard` (revenue / daily cash) + `MiniList`; `useRevenueReport` + `useDailySummary`. |
| `components/AssistantDashboard.tsx` | `Grid` of `MiniList`s (today appointments + tasks placeholder); no StatCard. |
| `components/TechnicianDashboard.tsx` | single `MiniList` (active lab orders). |
| `components/OnboardingChecklist.tsx` | Admin-only checklist (keep as-is). |
| `components/widgets/StatCard.tsx` | Mantine `Card withBorder shadow="sm" padding="lg" radius="md"`; `Text size="sm" dimmed` label, `Text fz={28} fw={700}` value, optional hint. **No icon, no unit, no delta, no sparkline.** Has `StatCard.test.tsx` (asserts label+value+hint render). |
| `components/widgets/BarMini.tsx` | Pure-CSS horizontal bars (label + width% bar). Uses `--mantine-color-teal-6` / `--mantine-color-gray-2`. |
| `components/widgets/MiniList.tsx` | `Card` + title + list of `{label,right,to}` rows, optional empty text. |

**Current vs target structurally:** the current dashboards are vertical `Stack`s of
Mantine `Card`s using Mantine sizing props (`shadow="sm"`, `radius="md"`, `size="lg"`),
**not** the token-driven `16px`/`shadow-sm` cards, 4-col KPI grid, `minmax(0,1fr) 360px`
split, sparklines, deltas, icon-chips, or the bordered schedule list of the mockup. The
shared widgets (`StatCard`/`BarMini`/`MiniList`) feed **all 6** role dashboards, so they
are the central re-skin seam.

---

## 3. Gap list (deltas to reach parity)

Each item marked **[data ✓]** (current hooks supply it) or **[data ✗]** (mockup shows data
the locked hooks do not provide → render conditionally / omit / defer; **do NOT add hooks**).

### KPI card (`widgets/StatCard.tsx`) — biggest gap
- **[data ✓]** Re-skin to token card: `border-radius:16px; border:1px solid var(--border); background:var(--surface); box-shadow:var(--shadow-sm); padding:16px 16px 13px`. Replace Mantine `Card`/`Text` sizing with token styles.
- **[data ✓]** Add **label uppercase** treatment + a **right-aligned 32×32 icon-chip** (new prop `icon`/`tone`). Add an optional **unit** span next to value; value → `font-mono 26px/600/-.03em/--ink`.
- **[data ✗ — partial]** Add optional **delta** (▲/▼ + colored text) and **sparkline (78×30 SVG)** props. Current `useManagerKpi`/`useRevenueReport` return single aggregates with **no 7-day series and no period-over-period delta**. So: make `delta` and `spark` **optional**; render them only where real data exists (none today for the manager KPIs). Do not fabricate a series and do not add a backend trend endpoint. (If a future task wants real sparklines it is out of DS1 scope per the lock.)
- Keep `StatCard.test.tsx` green (extend, don't break, the label/value/hint contract).

### Weekly revenue chart
- **[data ✗]** The mockup's `revenueChart` needs a **7-day revenue series**. `getRevenueReport` returns a total + byBranch/byService breakdown, **not a daily time series**. Options that respect the lock: (a) **omit the line chart** and keep parity only on the surrounding card chrome, or (b) repurpose the existing `byService` data into the existing bar visual restyled to tokens. Recommended: **defer the line chart** (mark as data-gap), restyle the card shell + keep `BarMini` (revenue-by-service) inside it re-skinned. Flag this explicitly so implementers don't invent a series.

### Today's schedule list ("Bugungi jadval")
- **[data ✓ for Doctor/Receptionist/Assistant]** Build a new **schedule-list sub-component** matching the mockup row (time | divider | patient + `service · doctor` | duration | status chip). Current dashboards render appointments as a flat `MiniList` of `time · status` strings — restructure into the bordered card + rich rows. Data: `useDoctorAppointments` / `useAppointments` already return appointment rows; patient/service/doctor names may need the existing name-map mappers (no new endpoint). Manager dashboard currently has no today-schedule hook — either reuse `useAppointments` (existing) for the schedule card or omit it for manager.
- Status chip → reuse a token chip primitive (see below); map `appointments.status.*` i18n (unchanged keys).

### Right rail (360px) — `minmax(0,1fr) 360px` layout
- Restructure each role dashboard body from `<Container size="lg">` + `Stack` to the **two-column grid** (`minmax(0,1fr) 360px`, gap 16, align-items:start), main column left, rail right. Drop `Container size="lg"` (mockup is full-width with `main` padding from the locked shell).
- **Queue card [data ✓]:** `useQueueToday` already exists and is used by Receptionist. Build a token "Navbat holati" card (number badge + patient/meta + status chip + waiting pill). Available to roles that have queue access.
- **Recall card [data ✗]:** no recall hook is imported by the dashboard feature today. Recall is a separate feature (`recall` nav). **Omit or defer** — do not add a hook. (If a recall list hook already exists elsewhere and is permission-safe it *could* be reused in a later task, but treat as data-gap for DS1.)
- **Recent activity card [data ✗]:** no activity-feed hook exists. Audit-log read is permission-gated and not currently wired to the dashboard. **Omit / defer.**

### Shared widgets
- `BarMini.tsx`: swap `--mantine-color-teal-6`/`--mantine-color-gray-2` → `var(--primary)` / `var(--surface-2)`; keep API.
- `MiniList.tsx`: re-skin card chrome to token `16px`/`--border`/`shadow-sm`; row typography to `--ink`/`--ink-3`.
- Add a small **chip / status-pill** rendering for schedule + queue rows (reuse `@dental/ui` `StatusPill`/`Tag` per `packages/ui/STATUS-INDICATORS.md` — do not hand-roll a new chip if a primitive fits).

### i18n
- Existing keys keep their meaning. **New** sections need **new** keys: `dashboard.weekly_revenue` ("Haftalik tushum"), `dashboard.last_7_days`, `dashboard.queue_status` ("Navbat holati"), `dashboard.queue_waiting` ("{{n}} kutmoqda"), `dashboard.recall_today` ("Recall — bugun"), `dashboard.recent_activity` ("So'nggi faollik"), `dashboard.calendar_link` ("Kalendar"), plus the two header buttons ("Yangi yozilish", "Kassa") if not already present. Add to **both** `uz.json` and `ru.json`. (Only add keys for sections actually shipped — skip keys for deferred recall/activity if those cards are omitted.)

---

## 4. Tasks (proposed) — disjoint, parallel-friendly

Suggested 5-task split; **T3 (i18n) is the single serial task** that touches
`packages/i18n/src/locales/{uz,ru}.json` — all string additions land there to avoid merge
conflicts. The rest are isolated.

- **T1 — Shared KPI/widget re-skin (isolated).** Re-skin `widgets/StatCard.tsx` (token card, uppercase label, icon-chip, unit, mono value; **optional** delta+sparkline props), `widgets/BarMini.tsx` (token colors), `widgets/MiniList.tsx` (token chrome). Keep/extend `StatCard.test.tsx`. No new data. This propagates to all 6 dashboards, so it lands first or is coordinated.
- **T2 — New schedule-list + queue-card + chip sub-components (isolated).** Add `components/widgets/ScheduleList.tsx` (mockup row layout) and `components/widgets/QueueCard.tsx` (number badge + status), reusing `@dental/ui` status primitives. Pure presentational; consume props only. No new hooks.
- **T3 — i18n keys (SERIAL, touches both locale files).** Add the new `dashboard.*` keys (and header button labels) to `uz.json` + `ru.json`. Single task; other tasks reference keys but don't edit locale files.
- **T4 — Manager + Accountant dashboard layout (isolated, uses `rev:true` path).** Recompose `ManagerDashboard.tsx` / `AccountantDashboard.tsx` to: header action buttons; 4-col KPI grid (T1 cards); `minmax(0,1fr) 360px` body; left = restyled revenue card (BarMini-by-service, **line chart deferred — data gap**) + schedule card (if appointment data wired); right rail = queue card where permitted (recall/activity **omitted as data-gap**). Keep `OnboardingChecklist` (manager). Keep all existing hooks.
- **T5 — Doctor / Receptionist / Assistant / Technician dashboard layout (isolated).** Recompose the 4 staff dashboards to the same shell: header buttons (per permission), KPI grid where StatCards exist, two-column body with schedule list (Doctor/Receptionist/Assistant) + queue rail (Receptionist) using existing hooks; Technician keeps lab-order list re-skinned. Mark recall/activity as omitted.

> T1 and T2 are pure presentational and can run fully in parallel. T4/T5 depend on T1+T2
> components and on T3 keys, so schedule T3 early (or stub keys). T4 and T5 touch disjoint
> files (different role components) and can run in parallel once T1/T2/T3 land.

---

## 5. Risks / notes

- **Data-availability is the dominant constraint.** The mockup is data-rich (per-KPI
  7-day sparklines, period-over-period deltas, a daily revenue series, a recall list, an
  activity feed). The locked hooks provide **none** of these. Treat sparkline/delta/line-chart/recall/activity as **data-gaps**: render conditionally, omit, or defer — **never** add a hook/endpoint (violates Qaror #33 lock). Pixel parity here is "card chrome + layout + typography parity," not "every widget populated."
- **Dark-mode contrast watchpoint (CLI-80 / CLI-255 regression history).** Every token re-skin must be checked in dark mode. Specifically: `--text-on-danger` (`#2a0f0d`) and `--text-on-primary` (`#04130f`) are dark inks on light brand fills — any element using `color:#fff` on a danger/primary background must use the token, or WCAG AA breaks in dark mode (this exact bug recurred in DS0). The mockup's purple gradient card (`color:#fff`) is in the *Navbat board* view, not DS1 — ignore. KPI icon-chips use soft-bg + same-tone-fg tints (`--warning-soft` etc.) which are defined for both schemes; verify the `muted` tone (`--ink-3` on `--surface-2`) still reads in dark.
- **Six role variants, not one.** The mockup only shows the manager view; parity must be
  applied across all 6 role dashboards via the shared shell + widgets. Each role exposes a
  different KPI/rail subset based on its existing hooks — do not force missing cards.
- **Prototype-local tokens.** `var(--mono)` → `var(--font-mono)`, `var(--ui)` → default
  sans. These aliases don't exist in tokens.css; using them verbatim renders unstyled.
- **Off-scale literals (radius 16, gap 14, KPI value 26/-.03em, padding 13)** have no exact
  token. Keep literals for parity; comment them. Do not modify tokens.css.
- **Topbar already owns the page title** (`shell/use-page-title.ts`, locked DS0). Do not add
  a greeting/title to the dashboard body — the mockup omits it too.
- **Keep `StatCard.test.tsx` green** — extend the contract, don't break label/value/hint.
- `Container size="lg"` should be dropped in favor of the full-width `minmax(0,1fr) 360px`
  grid; the shell's `main` padding (`24px 26px`) supplies the gutter.
