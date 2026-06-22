# DS8 — Analytics + Finance: Design-vs-Code Gap Brief

Milestone **DS8** of the Dental OS pixel-parity redesign. Re-skins **two** feature folders
only: `apps/web/src/features/reports/` (Analytics/Reports, nav key `'reports'` / "Hisobotlar")
and `apps/web/src/features/expenses/` (Finance, nav key `'moliya'` / "Moliya").

Foundation (DS0) is **locked**: `packages/ui/src/theme/tokens.css`, shell, primitives — do not
touch. Functionality / API / i18n / permissions stay unchanged (Qaror #33). This is a visual
re-skin: where the design needs data the current API does not return, **render-conditional /
omit / defer** — no new endpoints.

Design source (read, not modified): `claude.ai/design` Dental OS export
(`…/tool-results/toolu_01GKUFvM7wVKLrAXM5m5CcRj.txt`), screens `scrReports` and `scrFinance`.

---

## 1. Design summary

All design tokens referenced below already exist in `tokens.css` (light **and** dark) — the
re-skin inherits dark-mode automatically. Tones used by charts:
`--primary` (teal), `--info` (#2a66cc), `--violet` (#7c4dd6), `--warning`, `--danger`,
`--success`; surfaces `--surface`, `--surface-2`, `--primary-soft`; text `--ink`/`--ink-2`/`--ink-3`;
`--border`/`--border-strong`; `--mono` (JetBrains Mono) for all numbers; `--shadow-sm`.
Card chrome everywhere: `background:--surface; border:1px solid --border; border-radius:16px;
box-shadow:--shadow-sm; padding:18px`.

### 1a. Analytics (`scrReports`)

Layout: 4-col KPI row, then a 2-col grid `minmax(0,1fr) 380px` — left column = revenue line
chart + doctor-workload bars; right column (380px) = top-services bars + payment donut +
occupancy heatmap.

**4 KPI cards** (`reportKpis` ← `REPORT_KPIS`): label (uppercase 11.5px `--ink-3`) + icon chip;
value 26px `--mono` 600 `letter-spacing:-.03em` + unit; **delta** (% + up/down + success/danger
tone); **spark** (7-point mini sparkline). Cards: `Oylik tushum 92.4 mln`, `O'rtacha chek 420 ming`,
`No-show 5.2%`, `Reja konversiyasi 68%`.

**Revenue line chart** (`reportChart()`): SVG `viewBox 0 0 720 220`, padding `pl=pr=6, pt=14, pb=26`.
`series` = 12 monthly points, `labels` = `['Yan'…'Dek']`. `max = max(series)*1.16`.
Structure: `<linearGradient>` (`--primary` stopOpacity .24→0) for the area fill; 4 horizontal
grid lines at `[0,.33,.66,1]` (`stroke:--border; strokeDasharray:'2 5'`); area `<path>` filled
with the gradient; line `<path>` (`stroke:--primary; strokeWidth:2.4; round caps/joins`); dots
(only the last point `r=4`, `fill:--primary stroke:--surface`); x-labels (`<text>` 10.5px `--mono`
`--ink-3`). Header above chart: "Tushum dinamikasi" / "Oylik · mln so'm" + "▲ 14.2% YoY" badge
(`--success`).

**Doctor workload** (`workload` ← `WORKLOAD`, 3 rows): per row — name + specialty sub
(`--ink-3`), `<appts> qabul · <rev>` (`--mono` bolds), then a `bar(pct,'primary')` (8px-tall
rounded-99 track `--surface-2` / fill `var(--primary)`).

**Top services** (`serviceMix` ← `SERVICEMIX`, 5 rows): name + count (`--mono`) + `bar(pct, tone)`
with per-row tone (`info / primary / warning / violet / danger`).

**Payment-methods donut** (`donut()`, `PAYSPLIT`): SVG 140×140 `viewBox 0 0 140 140`. Background
ring `circle r=52 strokeWidth=18 stroke:--surface-2`. Segment rings = `circle r=52` with
`strokeDasharray = len ' ' (C-len)` and cumulative `strokeDashoffset`, `transform:rotate(-90 70 70)`,
`stroke:var(--<tone>)`. Center `<text>` "100%" 21px `--mono` + "to'lovlar" 10px. Legend rows
(swatch 11×11 radius 3 + label). Segments: Naqd 62% (primary), Karta 33% (info), Bank 5% (violet).

**Occupancy heatmap** (`heatmap()`): **6 rows (days `Du Se Ch Pa Ju Sh`) × 10 cols (hours)** — i.e.
day × hour, NOT the "6 cols × 10 rows, hour × doctor" the task prompt described (correct the
prompt). Each cell = `<span>` 17px-tall radius-3, color from a 4-step scale
`['--surface-2','--primary-soft','color-mix(in srgb, var(--primary) 50%, var(--surface))','--primary']`
indexed by intensity 0–3; `title` = `<day> <8+ci>:00`. Hour axis labels `08:00/11:00/14:00/17:00`.

### 1b. Finance (`scrFinance`)

Layout: 3-col KPI row, then 2-col grid `minmax(0,1fr) minmax(0,1.2fr)` — left = expense-categories
bar card; right = recent-expenses list card (with the 1C button in its header).

**3 KPI cards** (`finKpis` ← `FIN_KPIS`), same card anatomy as analytics (value/unit/delta/spark):
`Oylik tushum 92.4 mln` (delta success), `Oylik xarajat 38.1 mln` (delta danger), `Sof foyda
54.3 mln` (delta success).

**Expense categories** (`expenseCats` ← `EXPENSE_CATS`, 5 rows): "Xarajat kategoriyalari · iyun"
header; per row name + amount (`--mono --ink-2`) + `bar(pct, tone)`. Rows: Ish haqi (violet 90%),
Materiallar (info 55%), Ijara (warning 32%), Kommunal (primary 14%), Marketing (danger 9%).

**Recent expenses list** (`EXPENSES`): card header "So'nggi xarajatlar" + **"1C eksport" button**
(right). Each row: date (`--mono --ink-3`, 50px) · category (bold 13px) + description (`--ink-3`
ellipsis) · amount `−{amount}` in `--mono`, **`--danger`**, right-aligned. Rows separated by
`border-top:1px solid --border`.

---

## 2. Current state

### Reports — `apps/web/src/features/reports/`
- `components/ReportsScreen.tsx` — `<Container size="xl">` + `<Title order={2}>Hisobotlar</Title>`.
  Filters card (date range + branch Select + **1C export button**). A `<SimpleGrid cols 1/2>` of
  four `ReportSection` cards (Daromad, Qabullar, Shifokorlar yuklamasi, Davolash rejalari), each a
  Mantine `Card withBorder` with per-section CSV/Excel buttons, `StateView` (loading/error/empty),
  and either a Mantine `Table` or a `BarMini`. Then a Dental-analytics `Card` (procedure-mix
  BarMini, retention text, recall text, no-show-by-weekday BarMini). **No KPI cards, no line
  chart, no donut, no heatmap.**
- `components/BarMini.tsx` — pure-CSS horizontal bar (no chart lib): 140px label + flex track
  `--mantine-color-gray-1` + fill `--mantine-color-blue-5` (16px tall) + 90px right value.
  **Hard-codes Mantine gray/blue, not DS tokens.**
- `reports.api.ts` — TanStack hooks: `useRevenueReport`, `useAppointmentStats`, `useDoctorWorkload`,
  `usePlanCompletion`, `useDentalAnalytics`, `useOneCExport` (lazy, `enabled:false`). All
  `@dental/api-client` generated functions.
- `reports.export.ts` — pure `*ToRows` mappers + `downloadCsv` / `downloadXlsx` (lazy SheetJS) /
  `download1C` (`;`-separated, BOM, RU column map). `reports.export.test.ts` covers these.
- `reports.types.ts` — `ReportRange { from, to, branchId? }`.

**Chart rendering today = pure CSS divs (BarMini) + Mantine Tables. No SVG, no chart library.**

### Expenses — `apps/web/src/features/expenses/`
- `components/ExpensesScreen.tsx` — `PageHead` + create/category buttons; filter `Group` (date
  TextInputs + category/branch Selects); `ExpenseSummaryCard`; `ExpensesTable` (or StateView).
- `components/ExpenseSummaryCard.tsx` — Mantine `Paper` + `Table` (category / count / total +
  grand-total row). **No KPI cards, no category bars.**
- `components/ExpensesTable.tsx`, `ExpenseFormModal.tsx`, `CategoryManagerModal.tsx`.
- `expenses.api.ts` — `useExpenses`, `useExpenseCategories`, `useExpenseSummary`, `useBranches`,
  CRUD mutations.
- `expenses.mappers.ts` / `.types.ts` / `.schema.ts`.
- **No `download1C` in expenses** — the only 1C export in the app lives in `reports.export.ts`
  (transaction-level) and is wired from `ReportsScreen`. The design's finance "1C eksport"
  button is a *visual* element on the expenses list header that does not exist in current
  expenses code.

---

## 3. Gap list (visual deltas + data-gaps)

Legend: **[V]** pure visual re-skin (data exists). **[D]** data-gap — design needs data the API
does not return; per #33 render-conditional / omit / defer.

### Analytics
1. **[V] No KPI cards exist.** `ReportsScreen` has only a Title + table cards. Design needs a
   4-card KPI row (`--surface`/16px/`--shadow-sm`, value 26px `--mono`, icon chip). *But:*
   - **[D] delta % / "YoY" badge** — needs period-over-period comparison; revenue/appointments
     reports return only the current range. Omit or render only when a comparison source exists.
   - **[D] sparklines** — 7-pt per-metric time series. `revenue.byPeriod` (date→total) *can* feed
     the **revenue** sparkline only; avg-check / no-show / conversion have no series → omit those
     sparks. Do NOT let spark/delta hide inside "KPI restyle"; they are data-gaps.
2. **[V→D] Revenue line chart** (720×220 SVG) replaces nothing today (revenue is shown as a total
   + by-service BarMini). Renderable from `revenue.byPeriod` (array of `{date,total}`), but:
   **[D] shape note** — design is 12 fixed monthly points; `byPeriod` is range-driven (default 30
   daily points). Render real `byPeriod`; x-axis labels/aggregation differ from the 12-month mock.
   The "▲14.2% YoY" badge is a data-gap (same as #1 delta) → omit.
3. **[V] Doctor workload** — design = name + specialty + appts/rev + token bar; current =
   Mantine Table (doctorId-name, total, completed). Restyle to the bar layout. *Note:*
   **[D]** design shows revenue per doctor + specialty sub-label + a utilization `pct`; current
   `DoctorWorkloadRow` has `{doctorId,total,completed}` only — no revenue, no specialty, no pct.
   Drive the bar from `completed/total`; omit revenue/specialty or keep current columns.
4. **[V→D] Top-services bar** — `serviceMix` design maps cleanly to `revenue.byService`
   (`{serviceName,total}`) — straightforward token-bar restyle. (Today rendered as a BarMini.)
5. **[D] Payment-methods donut** — **no aggregated payment-method split in the reports API.**
   `revenue` has byBranch/byService/byDoctor/byPeriod but no `byPaymentMethod`. `paymentMethod`
   appears only as a per-row field in the 1C transaction export (`reports.service.ts:368`), not an
   aggregate. → **defer/omit the donut** (no new endpoint per #33).
6. **[D] Occupancy heatmap** — **no hour×day occupancy matrix in the API.** `appointmentStats`
   returns totals + byStatus + noShowRate + slotUtilization, not a per-hour/day grid. → **omit**.
7. **[V] BarMini token drift** — `BarMini.tsx` uses `--mantine-color-gray-1` / `--mantine-color-blue-5`.
   Re-skin to `--surface-2` track / `--primary` fill (matching design `bar()`); switch to `--mono`
   for numbers. (Affects every analytics bar incl. the retained Dental-analytics card.)

### Finance
8. **[V] No KPI cards exist.** `ExpenseSummaryCard` is a table. Design needs a 3-card KPI row
   (Oylik tushum / Oylik xarajat / Sof foyda). Tushum + Sof foyda need **revenue** data which the
   expenses feature does not currently fetch. **[D]** delta/spark same data-gap as analytics →
   omit; **[D]** "Oylik tushum" / "Sof foyda" require revenue — either omit those two cards or
   show only "Oylik xarajat" (from `expenseSummary.grandTotal`). Keep scope inside expenses files.
9. **[V] Expense categories bar card** — design = per-category token bars (amount + `bar(pct)`);
   current = `ExpenseSummaryCard` table. Restyle the summary into the bar layout (data exists:
   `expenseSummary` rows → name + total → pct vs max). Per-category tone can rotate the palette.
10. **[V] Recent-expenses list restyle** — `ExpensesTable` → design's list rows (date `--mono`,
    category bold + description ellipsis, amount `−{amount}` in `--danger --mono`). Data exists.
11. **[V/scope] Finance "1C eksport" button** — design places it in the recent-expenses card
    header. Current 1C export lives in reports only. **Decide:** (a) purely visual button that
    reuses the existing reports `download1C` flow, or (b) omit to avoid pulling reports export
    code into the expenses stream (preserves file-disjointness). Recommend (b) unless product
    wants it — flag, don't silently wire cross-feature.

---

## 4. Tasks proposed (disjoint leaf tasks)

Reports files and expenses files are **disjoint** → the two streams can run in parallel, EXCEPT
the i18n file and the shared bar primitive (see notes). i18n is a **serial** shared resource.

- **T1 (reports) — Chart primitives, feature-local.** Add `LineChart` (720×220 SVG per
  `reportChart()` structure: gradient area + dashed grid + line + last-dot + `--mono` labels) and
  `BarRow` (token bar replacing/superseding `BarMini`: `--surface-2` track, `--primary`/tone fill)
  to `reports/components/`. Do NOT add to `packages/ui` (locked DS0; keep the re-skin boundary
  clean). Pure presentational; no data wiring.
- **T2 (reports) — KPI card + ReportsScreen re-skin.** New `KpiCard` (`reports/components/`) with
  value/unit/optional delta/optional spark; render the 4 analytics KPIs from existing report data,
  **render-conditional** delta/spark (omit where no series). Wire `LineChart` to `revenue.byPeriod`,
  top-services `BarRow` to `revenue.byService`, workload to `DoctorWorkloadRow`. Drop the donut +
  heatmap (data-gaps, document in code comment). Keep all `ReportSection` export buttons + StateView.
- **T3 (expenses) — KPI + category-bar re-skin.** Restyle `ExpenseSummaryCard` into the category
  bar-card; add the finance KPI row (Oylik xarajat from `grandTotal`; omit Tushum/Sof foyda unless
  revenue is fetched — keep inside expenses files). Reuse the token-bar style.
- **T4 (expenses) — list + screen chrome re-skin.** Restyle `ExpensesTable` rows + `ExpensesScreen`
  cards to DS card chrome (16px/`--shadow-sm`/tokens). Decide the visual "1C eksport" button
  (gap #11) — recommend omit to keep streams disjoint.
- **T5 (i18n, SERIAL) — string parity.** Add any new uz/ru keys (KPI labels, chart titles,
  "Tushum dinamikasi", payment legend if donut survives, etc.) to BOTH
  `packages/i18n/src/locales/uz.json` and `ru.json`. Single shared file → must not run concurrently
  with itself; sequence after T2/T3/T4 land their key needs.
- **T6 (verify) — dark-mode + export regression.** Visual check both screens in light + dark
  (chart `var(--*)` tokens; confirm contrast of the 4-step heatmap scale IF heatmap is kept,
  donut rings, line on `--surface`). Confirm CSV/XLSX/1C exports still work (`reports.export.test.ts`
  green; no change to `reports.export.ts` / mappers).

---

## 5. Risks / notes

- **Chart rendering approach:** no chart library in the codebase today (pure CSS + Mantine Table).
  Design charts are hand-rolled `React.createElement` SVG. Match that — feature-local SVG
  components, **no new dependency**, no `packages/ui` additions (DS0 locked). This keeps DS8 a
  re-skin, not an architecture change.
- **Shared bar primitive breaks file-disjointness.** `BarMini` lives in `reports/components/`;
  expenses category bars need the same shape. If expenses imports from reports, T3/T4 are no longer
  disjoint from T1/T2. **Recommendation:** duplicate a tiny `BarRow` into `expenses/components/`
  (trivial, ~15 lines) rather than cross-import — preserves parallelism. Do NOT promote it to
  `packages/ui`.
- **Data-gaps (per #33, no new endpoints):** the donut (no `byPaymentMethod` aggregate) and the
  occupancy heatmap (no hour×day matrix) have **no API source** → omit. KPI **delta %, YoY badge,
  and most sparklines** need period-over-period / per-metric series the API does not return →
  render-conditional/omit. Only `revenue.byPeriod` can feed the revenue line chart + revenue
  sparkline. Workload revenue/specialty/utilization-pct absent → drive bar from `completed/total`.
- **Line-chart granularity:** design = 12 fixed monthly points; `byPeriod` = range-driven daily.
  Render real data; expect a different x-axis density than the mock (shape note, not a blocker).
- **Heatmap axis (correct the prompt):** design is **6 days × 10 hours** (day × hour), not the
  "6 cols × 10 rows, hour × doctor" stated in the task. Moot if omitted as a data-gap, but noted so
  the reader isn't misled.
- **Dark-mode chart contrast:** all chart colors use `var(--*)` tokens that exist in both light
  and dark blocks of `tokens.css` — dark mode is inherited. Still verify: the area gradient over
  dark `--surface`, donut rings vs `--surface-2`, and (if kept) the heatmap's
  `color-mix(... var(--primary) 50% ...)` step. CLAUDE.md's standing lesson — "re-check dark-mode
  contrast on every token use" (the DS0 `--text-on-danger` regression) — applies here.
- **1C / CSV export preservation:** do NOT edit `reports.export.ts` or its mappers. `download1C`
  (RU `;`-separated, BOM, transaction-level, provisional format) and the lazy SheetJS XLSX path
  must stay byte-identical; `reports.export.test.ts` is the guard. The finance "1C eksport" button
  is design-visual only — wiring it would import reports export into the expenses stream (avoid).
- **Preserve:** per-section CSV/Excel buttons, `StateView` loading/error/empty, permission gates
  (`report.view` branch filter, `expense.manage`), filters, and the retained Dental-analytics card.
