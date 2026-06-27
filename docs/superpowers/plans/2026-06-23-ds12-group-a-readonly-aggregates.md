# DS12 Group A — Read-Only Aggregatlar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dental OS redesign'da defer qilingan 6 read-only aggregate'ni (KPI delta/YoY, sparkline, to'lov-usuli donut, occupancy heatmap, recall summary, activity feed) backend'da qurish va mavjud frontend placeholder'larni jonlantirish.

**Architecture:** Mavjud `reports` endpoint javoblariga **additive** maydonlar qo'shiladi (rol allaqachon ushlagan `report.view` meros qilinadi); recall summary va activity feed esa o'z modullariga yangi GET endpoint sifatida qo'shiladi (`recall.view` / `audit_log.view`). Schema/migration YO'Q — barchasi mavjud jadvallardan o'qiladi. Frontend Mantine + TanStack Query feature-folder pattern'ida ulaydi; vizuallar custom lightweight SVG/CSS (chart-lib dep YO'Q — `StatCard` «og'ir grafiksiz» konvensiyasiga mos).

**Tech Stack:** Bun + Hono + Drizzle + `@hono/zod-openapi` (Zod 4) backend; React 18 + Mantine v7 + TanStack Query + `react-i18next` frontend; Vitest (web) / `bun:test` (api); orval api-client generatsiya.

## Global Constraints

- **Additive, yangi permission yuzasiz:** yangi maydon mavjud endpoint javobiga qo'shiladi; yangi endpoint faqat mavjud mos-permission'li modulga (`recalls`→`recall.view`, `audit`→`audit_log.view`). Yangi birlashtiruvchi `/reports/dashboard-summary` YARATILMAYDI.
- **Schema/migration YO'Q.** Yangi jadval/ustun yo'q; `bun run check:rls` coverage o'zgarmasligi shart.
- **Sana chegaralari:** doim `AT TIME ZONE 'Asia/Tashkent'` (mavjud `tashkentRange` helper) — delta day-edge drift'i bo'lmasligi uchun.
- **Null-handling:** taqqoslash baseline'i 0 yoki yo'q bo'lsa → tegishli `comparison` child `null` (0%/+100% RENDER QILINMAYDI). Frontend null child'da ▲▼ ko'rsatmaydi.
- **Audit maxfiyligi:** activity feed `before`/`after` JSON'ni HECH QACHON qaytarmaydi (metadata-only).
- **RBAC verify:** har endpoint rol-bo'yicha real cheklangan permset bilan tekshiriladi (`@owner` EMAS) — `cli-153`/`cli-157` test pattern.
- **Schema o'zgargach:** `bun run generate:contract` (OpenAPI→orval) ishga tushiriladi; web hooks yangilangan generated tipdan foydalanadi.
- **i18n:** har yangi UI matn `packages/i18n/src/uz.json` + `ru.json` ikkalasiga.
- **Verifikatsiya:** `bunx turbo typecheck` (16/16) + `bunx biome check` (0) + `bun test --env-file=../../.env` (api) + web `vitest run`.
- **⚠️ Test-tavsif string'lari:** o'zbekcha apostrofli matn (`yo'q`, `bo'lsa`) JS'da **double-quote** (`"yo'q"`) yoki backtick ichida yozilsin — single-quote ichida sintaksis xatosi beradi. Quyidagi snippet'larda tavsiflar illustrativ; ko'chirishda quote turini moslang.

---

## Files (umumiy xarita)

**Backend (`apps/api/src/modules/`):**
- `reports/reports.schema.ts` — Modify: `revenueReportDtoSchema`, `appointmentStatsReportDtoSchema`ga additive maydonlar.
- `reports/reports.aggregations.ts` — Modify: sof helper'lar (`comparisonEntry`, `deltaPct`, range-shift).
- `reports/reports.service.ts` — Modify: `revenue()`, `appointmentStats()` kengaytirish; private baseline helper'lar.
- `reports/reports.mapper.ts` — Modify: yangi maydonlarni re-project.
- `reports/reports.aggregations.test.ts` — Modify: helper unit testlar.
- `recalls/recalls.schema.ts` — Modify: `recallSummaryDtoSchema`.
- `recalls/recalls.repository.ts` — Modify: `summary()` so'rov.
- `recalls/recalls.service.ts` — Modify: `summary()` passthrough.
- `recalls/recalls.routes.ts` — Modify: `GET /summary` route.
- `audit/audit.schema.ts` — Modify: `auditRecentItemDtoSchema`, `auditRecentQuerySchema`.
- `audit/audit.service.ts` — Modify: `recent()` (users join, metadata-only).
- `audit/audit.routes.ts` — Modify: `GET /recent` route.
- `tests/integration/ds12-a-*.test.ts` — Create: service + RBAC testlar.

**Frontend (`apps/web/src/features/`):**
- `dashboard/components/widgets/Sparkline.tsx` — Create: 78×30 SVG sparkline.
- `dashboard/components/widgets/Donut.tsx` — Create: SVG donut.
- `dashboard/components/widgets/Heatmap.tsx` — Create: CSS-grid kun×soat heatmap.
- `dashboard/dashboard.mappers.ts` — Modify: `toStatDelta`, `toSparkPoints` helper.
- `dashboard/dashboard.api.ts` — Modify: hech (mavjud hook'lar yangi maydonlarni qaytaradi).
- `dashboard/components/ManagerDashboard.tsx` — Modify: KPI delta/spark + recall/activity rail.
- `dashboard/components/AccountantDashboard.tsx` — Modify: KPI delta/spark.
- `recalls/recalls.api.ts` — Modify: `useRecallSummary`.
- `recalls/recalls.keys.ts` — Modify: summary key.
- `recalls/components/RecallDashboard.tsx` — Modify: 4-KPI grid.
- `reports/components/ReportsScreen.tsx` — Modify: donut + heatmap + KPI delta/spark.
- `audit/` (yoki dashboard) — `useRecentActivity` hook.
- `packages/i18n/src/{uz,ru}.json` — Modify: yangi matnlar.

---

## Task 1: KPI period-over-period + YoY delta (revenue + appointments)

**Files:**
- Modify: `apps/api/src/modules/reports/reports.aggregations.ts`
- Modify: `apps/api/src/modules/reports/reports.aggregations.test.ts`
- Modify: `apps/api/src/modules/reports/reports.schema.ts`
- Modify: `apps/api/src/modules/reports/reports.service.ts`
- Modify: `apps/api/src/modules/reports/reports.mapper.ts`
- Create: `apps/api/tests/integration/ds12-a-comparison.test.ts`

**Interfaces:**
- Produces (aggregations): `deltaPct(current: number, baseline: number): number | null`; `comparisonEntry(current: number, baseline: number): { total: number; deltaPct: number } | null`; `shiftDays(date: string, days: number): string`; `shiftYears(date: string, years: number): string`; `periodLengthDays(from: string, to: string): number`.
- Produces (schema): `RevenueReport.comparison` va `AppointmentStatsReport.comparison`, ikkalasi `{ previous: Entry | null; yoy: Entry | null }` (obyekt doim mavjud, child'lar nullable — bu spec §4.1'ni aniqlashtiradi).
- Consumes (frontend, Task 5/6 emas): `getRevenueReport`/`getAppointmentStatsReport` generated tiplar yangilanadi.

- [ ] **Step 1: Sof helper testlarini yoz (FAIL)**

`apps/api/src/modules/reports/reports.aggregations.test.ts` oxiriga qo'sh:

```ts
import { comparisonEntry, deltaPct, periodLengthDays, shiftDays, shiftYears } from './reports.aggregations.ts';

describe('ds12-a comparison helpers', () => {
  test('deltaPct: baseline>0 → foiz', () => {
    expect(deltaPct(130, 100)).toBeCloseTo(30, 5);
    expect(deltaPct(80, 100)).toBeCloseTo(-20, 5);
  });
  test('deltaPct: baseline<=0 → null', () => {
    expect(deltaPct(50, 0)).toBeNull();
    expect(deltaPct(50, -5)).toBeNull();
  });
  test('comparisonEntry: baseline yo'q → null; bor → {total, deltaPct}', () => {
    expect(comparisonEntry(130, 0)).toBeNull();
    expect(comparisonEntry(130, 100)).toEqual({ total: 100, deltaPct: 30 });
  });
  test('periodLengthDays: inclusive', () => {
    expect(periodLengthDays('2026-06-01', '2026-06-30')).toBe(30);
    expect(periodLengthDays('2026-06-01', '2026-06-01')).toBe(1);
  });
  test('shiftDays / shiftYears', () => {
    expect(shiftDays('2026-06-01', -1)).toBe('2026-05-31');
    expect(shiftYears('2026-06-01', -1)).toBe('2025-06-01');
  });
});
```

- [ ] **Step 2: Testni ishga tushir — FAIL bo'lsin**

Run: `cd apps/api && bun test --env-file=../../.env reports.aggregations.test.ts`
Expected: FAIL — "comparisonEntry is not a function" h.k.

- [ ] **Step 3: Helper'larni qo'sh**

`apps/api/src/modules/reports/reports.aggregations.ts` oxiriga:

```ts
/** Foiz o'zgarishi (current vs baseline). baseline<=0 → null (ma'noli taqqoslash yo'q). */
export function deltaPct(current: number, baseline: number): number | null {
  if (baseline <= 0) return null;
  return ((current - baseline) / baseline) * 100;
}

/** Taqqoslash yozuvi — baseline 0/yo'q bo'lsa null (▲▼ render qilinmaydi). */
export function comparisonEntry(
  current: number,
  baseline: number,
): { total: number; deltaPct: number } | null {
  const d = deltaPct(current, baseline);
  return d === null ? null : { total: baseline, deltaPct: d };
}

/** Inclusive kun soni (YYYY-MM-DD). */
export function periodLengthDays(from: string, to: string): number {
  const ms = new Date(`${to}T00:00:00Z`).getTime() - new Date(`${from}T00:00:00Z`).getTime();
  return Math.round(ms / 86_400_000) + 1;
}

/** YYYY-MM-DD'ni N kun suradi (UTC anchor — TZ drift'siz). */
export function shiftDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** YYYY-MM-DD'ni N yil suradi. */
export function shiftYears(date: string, years: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCFullYear(d.getUTCFullYear() + years);
  return d.toISOString().slice(0, 10);
}
```

- [ ] **Step 4: Testni ishga tushir — PASS bo'lsin**

Run: `cd apps/api && bun test --env-file=../../.env reports.aggregations.test.ts`
Expected: PASS.

- [ ] **Step 5: DTO schema'ga `comparison` qo'sh**

`reports.schema.ts`'da, `revenueReportDtoSchema`'dan OLDIN umumiy schema kiritib, ikkala DTO'ga ulanadi:

```ts
// ─── Period comparison (DS12-A) ──────────────────────────────────────────────
const comparisonEntryDtoSchema = z.object({ total: z.number(), deltaPct: z.number() });
export const periodComparisonDtoSchema = z
  .object({
    previous: comparisonEntryDtoSchema.nullable(),
    yoy: comparisonEntryDtoSchema.nullable(),
  })
  .openapi('PeriodComparison');
```

`revenueReportDtoSchema` obyektiga maydon qo'sh (`byPeriod`dan keyin):
```ts
    comparison: periodComparisonDtoSchema,
```
`appointmentStatsReportDtoSchema` obyektiga ham (`slotUtilization`dan keyin):
```ts
    comparison: periodComparisonDtoSchema,
```

- [ ] **Step 6: Service'da baseline helper + `comparison` hisobla**

`reports.service.ts`'da `createReportsService` ichida, `revenue`/`appointmentStats`'dan oldin private helper qo'sh (`signed` SQL'ni qayta ishlatib):

```ts
  async function revenueTotal(c: Context, { from, to, branchId }: ReportRange): Promise<number> {
    const db = getDb(c);
    const { start, end } = tashkentRange(from, to);
    const signed = sql<string>`COALESCE(SUM(CASE WHEN ${cashierTransactions.type} = 'refund' THEN -${cashierTransactions.paidAmount} ELSE ${cashierTransactions.paidAmount} END), 0)`;
    const base = [
      eq(cashierTransactions.status, 'completed'),
      between(cashierTransactions.createdAt, start, end),
    ];
    if (branchId) base.push(eq(cashierTransactions.branchId, branchId));
    const [row] = await db.select({ total: signed }).from(cashierTransactions).where(and(...base));
    return Number(row?.total ?? 0);
  }

  async function appointmentCount(c: Context, { from, to, branchId }: ReportRange): Promise<number> {
    const db = getDb(c);
    const { start, end } = tashkentRange(from, to);
    const base = [between(appointments.startTime, start, end)];
    if (branchId) base.push(eq(appointments.branchId, branchId));
    const [row] = await db.select({ c: count() }).from(appointments).where(and(...base));
    return Number(row?.c ?? 0);
  }

  /** Joriy oraliq uchun previous + yoy taqqoslash (umumiy). */
  async function buildComparison(
    c: Context,
    range: ReportRange,
    current: number,
    totalFn: (c: Context, r: ReportRange) => Promise<number>,
  ) {
    const len = periodLengthDays(range.from, range.to);
    const prevTo = shiftDays(range.from, -1);
    const prevFrom = shiftDays(prevTo, -(len - 1));
    const prevRange = { from: prevFrom, to: prevTo, branchId: range.branchId };
    const yoyRange = {
      from: shiftYears(range.from, -1),
      to: shiftYears(range.to, -1),
      branchId: range.branchId,
    };
    const [prev, yoy] = await Promise.all([totalFn(c, prevRange), totalFn(c, yoyRange)]);
    return { previous: comparisonEntry(current, prev), yoy: comparisonEntry(current, yoy) };
  }
```

`reports.aggregations.ts` import qatoriga qo'sh: `comparisonEntry, periodLengthDays, shiftDays, shiftYears`.

`revenue()`'da, `return {`'dan oldin:
```ts
    const comparison = await buildComparison(c, { from, to, branchId }, Number(totalRow?.total ?? 0), revenueTotal);
```
va `return` obyektiga `comparison,` qo'sh.

`appointmentStats()`'da, `return {`'dan oldin:
```ts
    const comparison = await buildComparison(c, { from, to, branchId }, total, appointmentCount);
```
va `return` obyektiga `comparison,` qo'sh.

- [ ] **Step 7: Mapper'larni yangila**

`reports.mapper.ts`'da `toRevenueReportDto` obyektiga qo'sh:
```ts
  comparison: {
    previous: r.comparison.previous && { ...r.comparison.previous },
    yoy: r.comparison.yoy && { ...r.comparison.yoy },
  },
```
`toAppointmentStatsReportDto`'ga ham aynan shu `comparison` blokini qo'sh.

- [ ] **Step 8: Integration test yoz (FAIL)**

`apps/api/tests/integration/ds12-a-comparison.test.ts` — `reports.test.ts` setup pattern'ini takrorla (TRUNCATE, owner+tenant+branch, `run`/`ctx` helper). Ikki oraliqqa ma'lumot joyla: joriy oy `2026-06` da 130000 daromad (mavjud reports.test setup'i kabi) + oldingi oy `2026-05` da 100000 to'lov. Keyin:

```ts
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
// ... (reports.test.ts dan setup ko'chir: imports, db, ctx, run, beforeAll/afterAll)
// beforeAll ichida QO'SHIMCHA: 2026-05-15 da 100000 cash payment completed insert qil.
// va YoY uchun 2025-06-15 da HECH NARSA yo'q (yoy=null kutiladi).

const service = createReportsService();
const RANGE = { from: '2026-06-01', to: '2026-06-30' };

describe('ds12-a: revenue comparison', () => {
  test('previous to'la → deltaPct; yoy bo'sh → null', async () => {
    const r = await run((c) => service.revenue(c, RANGE));
    expect(r.comparison.previous).not.toBeNull();
    expect(r.comparison.previous?.total).toBe(100000);     // 2026-05 oldingi 30 kun
    expect(r.comparison.previous?.deltaPct).toBeCloseTo(30, 1); // (130000-100000)/100000
    expect(r.comparison.yoy).toBeNull();                   // 2025-06 da data yo'q
  });
});

describe('ds12-a: appointment comparison', () => {
  test('previous bo'sh → null (oldingi oyda qabul yo'q)', async () => {
    const r = await run((c) => service.appointmentStats(c, RANGE));
    expect(r.comparison.previous).toBeNull();              // 2026-05 da appt yo'q
  });
});
```

> ⚠️ Previous range hisobi: 2026-06-01..06-30 = 30 kun → prevTo=2026-05-31, prevFrom=2026-05-02. 2026-05-15 to'lov shu oraliqda. Agar prevFrom 05-02 bo'lsa 05-15 ichida — to'g'ri.

- [ ] **Step 9: Integration testni ishga tushir — FAIL→implement→PASS**

Run: `cd apps/api && bun test --env-file=../../.env ds12-a-comparison.test.ts`
Expected: PASS (Step 5–7 implementatsiyasi bilan).

- [ ] **Step 10: api-client regeneratsiya**

Run: `bun run generate:contract`
Expected: `getRevenueReport`/`getAppointmentStatsReport` response tiplarida `comparison` paydo bo'ladi; xato yo'q.

- [ ] **Step 11: Frontend delta mapper helper**

`apps/web/src/features/dashboard/dashboard.mappers.ts`'ga qo'sh (generated `PeriodComparison` tipini import qilib):

```ts
import type { StatCardDelta } from './components/widgets/StatCard'; // type-only
// PeriodComparison generated tip — '@dental/api-client' barrel'dan

/** comparison.previous → StatCardDelta (null bo'lsa undefined → ▲▼ ko'rsatilmaydi). */
export function toStatDelta(
  entry: { deltaPct: number } | null | undefined,
  t: (k: string) => string,
): StatCardDelta | undefined {
  if (!entry) return undefined;
  const up = entry.deltaPct >= 0;
  return {
    direction: entry.deltaPct === 0 ? 'flat' : up ? 'up' : 'down',
    tone: up ? 'success' : 'danger',
    text: `${up ? '+' : ''}${entry.deltaPct.toFixed(1)}% ${t('dashboard.vsPrevPeriod')}`,
  };
}
```

> `StatCardDelta`/`StatCardTone` import yo'lini `widgets/StatCard.tsx` eksportiga moslab to'g'rila.

- [ ] **Step 12: ManagerDashboard + AccountantDashboard KPI'lariga delta ulash**

`ManagerDashboard.tsx` (KPI kartalar ~129–145): har `StatCard`'ga mos `delta` prop ber. Daromad kartasi:
```tsx
delta={toStatDelta(revenue.data?.comparison.previous, t)}
```
Qabul kartasi: `appointments.data?.comparison.previous`. `AccountantDashboard.tsx` daromad kartasiga ham `revenue.data?.comparison.previous`.

- [ ] **Step 13: i18n kalit qo'sh**

`packages/i18n/src/uz.json`: `"dashboard.vsPrevPeriod": "o'tgan davrga nisbatan"`.
`ru.json`: `"dashboard.vsPrevPeriod": "к прошлому периоду"`.

- [ ] **Step 14: Verifikatsiya + commit**

Run:
```bash
cd apps/api && bun test --env-file=../../.env ds12-a-comparison.test.ts reports.aggregations.test.ts
cd ../.. && bunx turbo typecheck && bunx biome check
```
Expected: hammasi yashil.
```bash
git add apps/api/src/modules/reports apps/api/tests/integration/ds12-a-comparison.test.ts apps/web/src/features/dashboard packages/i18n packages/api-client
git commit -m "feat(ds12-a): KPI period-over-period + YoY delta (revenue+appointments)"
```

---

## Task 2: KPI sparkline (appointments byPeriod + frontend SVG)

**Files:**
- Modify: `apps/api/src/modules/reports/reports.schema.ts`
- Modify: `apps/api/src/modules/reports/reports.service.ts`
- Modify: `apps/api/src/modules/reports/reports.mapper.ts`
- Modify: `apps/api/tests/integration/ds12-a-comparison.test.ts` (yoki yangi `ds12-a-series.test.ts`)
- Create: `apps/web/src/features/dashboard/components/widgets/Sparkline.tsx`
- Modify: `ManagerDashboard.tsx`, `AccountantDashboard.tsx`

**Interfaces:**
- Produces (schema): `AppointmentStatsReport.byPeriod: { date: string; count: number }[]`. (`RevenueReport.byPeriod` allaqachon mavjud — qayta ishlatiladi.)
- Produces (frontend): `Sparkline({ points: number[] }): JSX.Element` — 78×30 SVG polyline.

- [ ] **Step 1: appointments byPeriod test (FAIL)**

`ds12-a-series.test.ts` (reports.test setup ko'chirilgan) yoki mavjud comparison testiga qo'sh:
```ts
test('appointmentStats.byPeriod: kunlik count', async () => {
  const r = await run((c) => service.appointmentStats(c, RANGE));
  // 2026-06-01 da 3 qabul (reports.test setup) → shu kun count=3
  expect(r.byPeriod.find((p) => p.date === '2026-06-01')?.count).toBe(3);
});
```

- [ ] **Step 2: Run — FAIL** (`byPeriod` yo'q).
Run: `cd apps/api && bun test --env-file=../../.env ds12-a-series.test.ts`

- [ ] **Step 3: Schema + service + mapper**

`reports.schema.ts` `appointmentStatsReportDtoSchema`'ga:
```ts
    byPeriod: z.array(z.object({ date: z.string(), count: z.number() })),
```
`reports.service.ts` `appointmentStats()`'da (capacity hisobidan keyin, return'dan oldin):
```ts
    const dayExpr = sql<string>`(${appointments.startTime} AT TIME ZONE 'Asia/Tashkent')::date`;
    const periodRows = await db
      .select({ date: dayExpr, c: count() })
      .from(appointments)
      .where(and(...base))
      .groupBy(dayExpr)
      .orderBy(dayExpr);
    const byPeriod = periodRows.map((r) => ({ date: String(r.date), count: Number(r.c) }));
```
return obyektiga `byPeriod,` qo'sh.
`reports.mapper.ts` `toAppointmentStatsReportDto`'ga:
```ts
  byPeriod: r.byPeriod.map((p) => ({ date: p.date, count: p.count })),
```

- [ ] **Step 4: Run — PASS.** Run: `cd apps/api && bun test --env-file=../../.env ds12-a-series.test.ts`

- [ ] **Step 5: api-client regeneratsiya.** Run: `bun run generate:contract`

- [ ] **Step 6: Sparkline komponenti**

`apps/web/src/features/dashboard/components/widgets/Sparkline.tsx`:
```tsx
interface SparklineProps {
  points: number[];
  width?: number;
  height?: number;
  color?: string;
}

/** Yengil 78×30 SVG polyline sparkline — chart-lib dep'siz (StatCard «og'ir grafiksiz»). */
export function Sparkline({ points, width = 78, height = 30, color = 'var(--primary)' }: SparklineProps) {
  if (points.length < 2) return null;
  const max = Math.max(...points, 1);
  const min = Math.min(...points, 0);
  const span = max - min || 1;
  const dx = width / (points.length - 1);
  const path = points
    .map((p, i) => `${i * dx},${height - ((p - min) / span) * height}`)
    .join(' ');
  return (
    <svg width={width} height={height} aria-hidden role="img">
      <polyline points={path} fill="none" stroke={color} strokeWidth={1.5} />
    </svg>
  );
}
```

- [ ] **Step 7: Dashboard KPI'lariga spark ulash**

`ManagerDashboard.tsx` daromad kartasi:
```tsx
spark={<Sparkline points={(revenue.data?.byPeriod ?? []).map((p) => p.total)} />}
```
Qabul kartasi: `(appointments.data?.byPeriod ?? []).map((p) => p.count)`. `AccountantDashboard.tsx` daromad kartasiga ham revenue byPeriod sparkline.

- [ ] **Step 8: Verifikatsiya + commit**
Run: `cd apps/api && bun test --env-file=../../.env ds12-a-series.test.ts && cd ../.. && bunx turbo typecheck && bunx biome check`
```bash
git add apps/api/src/modules/reports apps/api/tests/integration apps/web/src/features/dashboard packages/api-client
git commit -m "feat(ds12-a): KPI 7-kunlik sparkline (appointments byPeriod + SVG)"
```

---

## Task 3: To'lov-usuli donut (revenue byPaymentMethod + frontend SVG)

**Files:**
- Modify: `reports.schema.ts`, `reports.service.ts`, `reports.mapper.ts`
- Modify: `apps/api/tests/integration/ds12-a-series.test.ts`
- Create: `apps/web/src/features/dashboard/components/widgets/Donut.tsx`
- Modify: `apps/web/src/features/reports/components/ReportsScreen.tsx`
- Modify: `packages/i18n/src/{uz,ru}.json`

**Interfaces:**
- Produces (schema): `RevenueReport.byPaymentMethod: { paymentMethod: string; total: number }[]` (enum: cash/card/transfer/other).
- Produces (frontend): `Donut({ segments: { label: string; value: number; color: string }[] }): JSX.Element`.

- [ ] **Step 1: byPaymentMethod test (FAIL)**
```ts
test('revenue.byPaymentMethod: cash bo'yicha jamlanma', async () => {
  const r = await run((c) => service.revenue(c, RANGE));
  // reports.test setup: barcha tx cash; signed = 100000+50000-20000 = 130000
  expect(r.byPaymentMethod.find((p) => p.paymentMethod === 'cash')?.total).toBe(130000);
});
```
Run: `cd apps/api && bun test --env-file=../../.env ds12-a-series.test.ts` → FAIL.

- [ ] **Step 2: Schema + service + mapper**

`reports.schema.ts` `revenueReportDtoSchema`'ga:
```ts
    byPaymentMethod: z.array(z.object({ paymentMethod: z.string(), total: z.number() })),
```
`reports.service.ts` `revenue()`'da (return'dan oldin, `signed`/`base` qayta ishlatib):
```ts
    const byPaymentMethod = await db
      .select({ paymentMethod: cashierTransactions.paymentMethod, total: signed })
      .from(cashierTransactions)
      .where(and(...base))
      .groupBy(cashierTransactions.paymentMethod);
```
return obyektiga:
```ts
      byPaymentMethod: byPaymentMethod.map((r) => ({ paymentMethod: r.paymentMethod, total: Number(r.total) })),
```
`reports.mapper.ts` `toRevenueReportDto`'ga:
```ts
  byPaymentMethod: r.byPaymentMethod.map((p) => ({ paymentMethod: p.paymentMethod, total: p.total })),
```

- [ ] **Step 3: Run — PASS** + `bun run generate:contract`.

- [ ] **Step 4: Donut komponenti**

`apps/web/src/features/dashboard/components/widgets/Donut.tsx`:
```tsx
interface DonutSegment { label: string; value: number; color: string; }
interface DonutProps { segments: DonutSegment[]; size?: number; thickness?: number; }

/** Yengil SVG donut (stroke-dasharray arklar) — chart-lib dep'siz. */
export function Donut({ segments, size = 120, thickness = 14 }: DonutProps) {
  const total = segments.reduce((s, x) => s + Math.max(0, x.value), 0);
  const r = (size - thickness) / 2;
  const circ = 2 * Math.PI * r;
  let offset = 0;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
        {total === 0 && (
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--border)" strokeWidth={thickness} />
        )}
        {total > 0 && segments.map((s) => {
          const frac = Math.max(0, s.value) / total;
          const dash = `${frac * circ} ${circ}`;
          const el = (
            <circle key={s.label} cx={size / 2} cy={size / 2} r={r} fill="none"
              stroke={s.color} strokeWidth={thickness} strokeDasharray={dash}
              strokeDashoffset={-offset * circ} />
          );
          offset += frac;
          return el;
        })}
      </g>
    </svg>
  );
}
```

- [ ] **Step 5: ReportsScreen'ga donut + legenda**

`ReportsScreen.tsx` «Dental analitika» bo'limiga (~435) yangi karta: `useRevenueReport(period)` allaqachon bor (yoki qo'sh) → `revenue.data?.byPaymentMethod`'ni Donut segmentlariga map qil. To'lov-usuli ranglar: cash=`var(--success)`, card=`var(--info)`, transfer=`var(--violet)`, other=`var(--ink-3)`. Har segment yonida `t('payment.method.<key>')` legenda + `formatCurrency(total, t)`.

- [ ] **Step 6: i18n** — `payment.method.cash/card/transfer/other` + `reports.byPaymentMethod` sarlavhasi (uz/ru). Mavjud bo'lsa qayta ishlatma.

- [ ] **Step 7: Verifikatsiya + commit**
```bash
git add apps/api/src/modules/reports apps/api/tests/integration apps/web/src/features packages/i18n packages/api-client
git commit -m "feat(ds12-a): to'lov-usuli donut (revenue byPaymentMethod + SVG)"
```

---

## Task 4: Occupancy heatmap (appointments occupancy + frontend CSS grid)

**Files:**
- Modify: `reports.schema.ts`, `reports.service.ts`, `reports.mapper.ts`
- Modify: `apps/api/tests/integration/ds12-a-series.test.ts`
- Create: `apps/web/src/features/dashboard/components/widgets/Heatmap.tsx`
- Modify: `apps/web/src/features/reports/components/ReportsScreen.tsx`
- Modify: `packages/i18n/src/{uz,ru}.json`

**Interfaces:**
- Produces (schema): `AppointmentStatsReport.occupancy: { weekday: number; hour: number; count: number }[]` (weekday 0=Yak..6=Shan, hour 0–23, faqat count>0).
- Produces (frontend): `Heatmap({ cells: { weekday: number; hour: number; count: number }[] }): JSX.Element`.

- [ ] **Step 1: occupancy test (FAIL)**
```ts
test('appointmentStats.occupancy: kun×soat matritsa', async () => {
  const r = await run((c) => service.appointmentStats(c, RANGE));
  // 2026-06-01 dushanba(weekday=1), 09:00 da 1 completed qabul (reports.test setup)
  expect(r.occupancy.find((o) => o.weekday === 1 && o.hour === 9)?.count).toBe(1);
});
```
Run → FAIL.

- [ ] **Step 2: Schema + service + mapper**

`appointmentStatsReportDtoSchema`'ga:
```ts
    occupancy: z.array(z.object({ weekday: z.number(), hour: z.number(), count: z.number() })),
```
`appointmentStats()`'da (return'dan oldin):
```ts
    const wExpr = sql<number>`EXTRACT(DOW FROM ${appointments.startTime} AT TIME ZONE 'Asia/Tashkent')::int`;
    const hExpr = sql<number>`EXTRACT(HOUR FROM ${appointments.startTime} AT TIME ZONE 'Asia/Tashkent')::int`;
    const occRows = await db
      .select({ weekday: wExpr, hour: hExpr, c: count() })
      .from(appointments)
      .where(and(...base))
      .groupBy(wExpr, hExpr);
    const occupancy = occRows.map((r) => ({
      weekday: Number(r.weekday), hour: Number(r.hour), count: Number(r.c),
    }));
```
return obyektiga `occupancy,`. Mapper `toAppointmentStatsReportDto`'ga:
```ts
  occupancy: r.occupancy.map((o) => ({ weekday: o.weekday, hour: o.hour, count: o.count })),
```

- [ ] **Step 3: Run — PASS** + `bun run generate:contract`.

- [ ] **Step 4: Heatmap komponenti**

`apps/web/src/features/dashboard/components/widgets/Heatmap.tsx` — CSS grid (7 ustun × ish-soatlari qatorlar, masalan 8–20). Har hujayra rangi `var(--primary)` ustiga `opacity = count/max`. Bo'sh hujayra `var(--surface-2)`. Hafta-kun va soat o'qlari `t()` bilan. Misol struktura:
```tsx
interface HeatCell { weekday: number; hour: number; count: number; }
interface HeatmapProps { cells: HeatCell[]; hours?: number[]; }

const HOURS = Array.from({ length: 13 }, (_, i) => i + 8); // 8..20

export function Heatmap({ cells, hours = HOURS }: HeatmapProps) {
  const max = Math.max(1, ...cells.map((c) => c.count));
  const at = (w: number, h: number) => cells.find((c) => c.weekday === w && c.hour === h)?.count ?? 0;
  // weekday 1=Mon..6,0=Sun → ko'rsatish tartibi [1,2,3,4,5,6,0]
  const order = [1, 2, 3, 4, 5, 6, 0];
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `auto repeat(${order.length}, 1fr)`, gap: 2 }}>
      {/* sarlavha qatori + har soat uchun qator — count>0 da primary opacity */}
      {/* ... hujayralar: background var(--primary), opacity at(w,h)/max ... */}
    </div>
  );
}
```
> To'liq grid render'ni ReportsScreen mavjud kartalar uslubiga moslab yoz; weekday label `t('weekday.mon')` h.k.

- [ ] **Step 5: ReportsScreen'ga heatmap karta** — `useAppointmentStats(period)` → `data?.occupancy` Heatmap'ga.

- [ ] **Step 6: i18n** — `reports.occupancy` sarlavha + `weekday.{sun..sat}` (mavjud bo'lsa qayta ishlat) uz/ru.

- [ ] **Step 7: Verifikatsiya + commit**
```bash
git add apps/api/src/modules/reports apps/api/tests/integration apps/web/src/features packages/i18n packages/api-client
git commit -m "feat(ds12-a): occupancy heatmap (appointments occupancy + CSS grid)"
```

---

## Task 5: Recall summary endpoint + DS7 4-KPI + DS1 recall rail

**Files:**
- Modify: `apps/api/src/modules/recalls/recalls.schema.ts`
- Modify: `apps/api/src/modules/recalls/recalls.repository.ts`
- Modify: `apps/api/src/modules/recalls/recalls.service.ts`
- Modify: `apps/api/src/modules/recalls/recalls.routes.ts`
- Create: `apps/api/tests/integration/ds12-a-recall-summary.test.ts`
- Modify: `apps/web/src/features/recalls/recalls.api.ts`, `recalls.keys.ts`
- Modify: `apps/web/src/features/recalls/components/RecallDashboard.tsx`
- Modify: `apps/web/src/features/dashboard/components/ManagerDashboard.tsx`
- Modify: `packages/i18n/src/{uz,ru}.json`

**Interfaces:**
- Produces (schema): `recallSummaryDtoSchema` → `{ pending: number; contacted: number; scheduled: number; overdue: number; efficacyPct: number }`.
- Produces (repo): `summary(c, branchId?): Promise<RecallSummary>`.
- Produces (route): `GET /recalls/summary?branchId=` (`recall.view`), operationId `getRecallSummary`.
- Produces (frontend): `useRecallSummary(branchId?)`.

- [ ] **Step 1: Schema + query schema**

`recalls.schema.ts`'ga:
```ts
export const recallSummaryQuerySchema = z.object({ branchId: z.uuid().optional() });
export type RecallSummaryQuery = z.infer<typeof recallSummaryQuerySchema>;

export const recallSummaryDtoSchema = z
  .object({
    pending: z.number().int(),
    contacted: z.number().int(),
    scheduled: z.number().int(),
    overdue: z.number().int(),
    efficacyPct: z.number(),
  })
  .openapi('RecallSummary');
export type RecallSummaryDto = z.infer<typeof recallSummaryDtoSchema>;
```

- [ ] **Step 2: Repository summary so'rovi**

`recalls.repository.ts`'ga (import `count`, `sql` allaqachon bor; `sql` mavjud):
```ts
  /** Status bo'yicha sanoq + overdue (dueDate < bugun, ochiq) + efficacy. RLS tenant-scoped. */
  async function summary(c: Context, branchId?: string) {
    const db = getDb(c);
    const filters = branchId ? [eq(recalls.branchId, branchId)] : [];
    const where = filters.length ? and(...filters) : undefined;
    const [row] = await db
      .select({
        pending: sql<number>`COUNT(*) FILTER (WHERE ${recalls.status} = 'pending')`,
        contacted: sql<number>`COUNT(*) FILTER (WHERE ${recalls.status} = 'contacted')`,
        scheduled: sql<number>`COUNT(*) FILTER (WHERE ${recalls.status} = 'scheduled')`,
        completed: sql<number>`COUNT(*) FILTER (WHERE ${recalls.status} = 'completed')`,
        total: count(),
        overdue: sql<number>`COUNT(*) FILTER (WHERE ${recalls.dueDate} < CURRENT_DATE AND ${recalls.status} IN ('pending','contacted'))`,
      })
      .from(recalls)
      .where(where);
    return {
      pending: Number(row?.pending ?? 0),
      contacted: Number(row?.contacted ?? 0),
      scheduled: Number(row?.scheduled ?? 0),
      completed: Number(row?.completed ?? 0),
      overdue: Number(row?.overdue ?? 0),
      total: Number(row?.total ?? 0),
    };
  }
```
`return { ... }` ob'yektiga `summary,` qo'sh. Import qatoriga `count` qo'sh (`drizzle-orm`dan).

- [ ] **Step 3: Service summary (efficacy bilan)**

`recalls.service.ts`'ga (import `recallEfficacy`? — yo'q, recalls modulda yo'q; arifmetikani inline qil yoki reports.aggregations'dan import qilma — modul-cross qochish uchun inline):
```ts
  async function summary(c: Context, branchId?: string) {
    const s = await repo.summary(c, branchId);
    const converted = s.scheduled + s.completed;
    const efficacyPct = s.total === 0 ? 0 : (converted / s.total) * 100;
    return {
      pending: s.pending,
      contacted: s.contacted,
      scheduled: s.scheduled,
      overdue: s.overdue,
      efficacyPct,
    };
  }
```
`return { ... }`'ga `summary,` qo'sh.

- [ ] **Step 4: Route**

`recalls.routes.ts`'ga (listRoute'dan keyin), import'ga `recallSummaryDtoSchema, recallSummaryQuerySchema` qo'sh:
```ts
  const summaryRoute = createRoute({
    method: 'get',
    path: '/summary',
    tags: ['recalls'],
    operationId: 'getRecallSummary',
    middleware: [requirePermission('recall.view')] as const,
    request: { query: recallSummaryQuerySchema },
    responses: okJson(recallSummaryDtoSchema, 'Recall KPI summary'),
  });
  app.openapi(summaryRoute, async (c) => {
    const { branchId } = c.req.valid('query');
    return c.json(ok(await service.summary(c, branchId)), 200);
  });
```
> ⚠️ `/summary` ni `/{id}` yo'llaridan OLDIN ro'yxatdan o'tkaz (Hono static>param) — bu yerda `/summary` GET, `/patient/{id}` GET'dan keyin lekin POST `/`/PATCH `/{id}`'dan oldin qo'yilsa xавfsiz; aniqligi uchun listRoute'dan keyin joyla.

- [ ] **Step 5: Integration test (FAIL→PASS) + RBAC**

`ds12-a-recall-summary.test.ts` — setup'da bir nechta recall insert qil (2 pending, 1 ulardan overdue dueDate o'tgan; 1 contacted; 1 scheduled). Service testi:
```ts
test('summary: status sanoq + overdue + efficacy', async () => {
  const r = await run((c) => service.summary(c));
  expect(r.pending).toBe(2);
  expect(r.contacted).toBe(1);
  expect(r.scheduled).toBe(1);
  expect(r.overdue).toBe(1);          // dueDate < CURRENT_DATE, pending
  expect(r.efficacyPct).toBeCloseTo((1 / 4) * 100, 1); // scheduled/(total=4)
});
```
RBAC test (`cli-153-permission-guard.test.ts` pattern): `recall.view` permset bilan route 200; `recall.view`siz permset bilan 403. (Agar route-level test infra mavjud bo'lsa; aks holda service-darajada permset yo'q, shuning uchun guard testini permission-guard test fayliga qo'sh.)

Run: `cd apps/api && bun test --env-file=../../.env ds12-a-recall-summary.test.ts` → PASS.

- [ ] **Step 6: api-client regeneratsiya** — `bun run generate:contract` → `getRecallSummary` paydo bo'ladi.

- [ ] **Step 7: Frontend hook + key**

`recalls.keys.ts`'ga: `summary: (branchId?: string) => ['recalls', 'summary', branchId ?? null] as const`.
`recalls.api.ts`'ga:
```ts
export function useRecallSummary(branchId?: string) {
  return useQuery({
    queryKey: recallKeys.summary(branchId),
    queryFn: () => getRecallSummary({ branchId }).then((r) => r.data),
  });
}
```

- [ ] **Step 8: RecallDashboard 4-KPI grid**

`RecallDashboard.tsx` (PageHead'dan keyin, ~84): `useRecallSummary()` → 4 `StatCard` grid (pending/contacted/scheduled/overdue) + efficacyPct hint. `StatCard`'ni `@dental/ui` yoki dashboard widgets'dan import qil (RecallDashboard joylashuviga mos).

- [ ] **Step 9: ManagerDashboard recall rail**

`ManagerDashboard.tsx` o'ng rail (~177–198): `hasPermission('recall.view')` bo'lsa recall summary kartasi (pending/overdue) ko'rsat. Permission yo'q → karta render qilinmaydi.

- [ ] **Step 10: i18n** — `recall.kpi.{pending,contacted,scheduled,overdue,efficacy}` uz/ru.

- [ ] **Step 11: Verifikatsiya + commit**
```bash
cd apps/api && bun test --env-file=../../.env ds12-a-recall-summary.test.ts && cd ../.. && bunx turbo typecheck && bunx biome check
git add apps/api/src/modules/recalls apps/api/tests/integration apps/web/src/features packages/i18n packages/api-client
git commit -m "feat(ds12-a): recall summary endpoint + DS7 4-KPI + DS1 recall rail"
```

---

## Task 6: Activity feed endpoint (audit recent, metadata-only) + DS1 rail

**Files:**
- Modify: `apps/api/src/modules/audit/audit.schema.ts`
- Modify: `apps/api/src/modules/audit/audit.service.ts`
- Modify: `apps/api/src/modules/audit/audit.routes.ts`
- Create: `apps/api/tests/integration/ds12-a-activity-feed.test.ts`
- Create/Modify: `apps/web/src/features/audit/audit.api.ts` (yoki dashboard hook)
- Modify: `apps/web/src/features/dashboard/components/ManagerDashboard.tsx`
- Modify: `packages/i18n/src/{uz,ru}.json`

**Interfaces:**
- Produces (schema): `auditRecentItemDtoSchema` → `{ id, actorName: string|null, action, resourceType, resourceId: string|null, createdAt }` (before/after YO'Q).
- Produces (service): `recent(c, limit=15): Promise<AuditRecentItem[]>` — `users` join actorName uchun.
- Produces (route): `GET /audit-log/recent` (`audit_log.view`), operationId `getRecentActivity`.
- Produces (frontend): `useRecentActivity()`.

- [ ] **Step 1: Schema (metadata-only)**

`audit.schema.ts`'ga:
```ts
export const auditRecentItemDtoSchema = z
  .object({
    id: z.uuid(),
    actorName: z.string().nullable(),
    action: z.string(),
    resourceType: z.string(),
    resourceId: z.uuid().nullable(),
    createdAt: z.string(),
  })
  .openapi('AuditRecentItem');
export type AuditRecentItemDto = z.infer<typeof auditRecentItemDtoSchema>;
```
> `before`/`after` QASDDAN yo'q — maxfiy tarkib chiqarilmaydi.

- [ ] **Step 2: Service recent() (users join)**

`audit.service.ts`'ga (`users` import `@dental/db-schema`'dan; `eq`, `desc`):
```ts
  async function recent(c: Context, limit = 15): Promise<AuditRecentItemDto[]> {
    const db = getDb(c);
    const rows = await db
      .select({
        id: auditLog.id,
        actorName: users.fullName,
        action: auditLog.action,
        resourceType: auditLog.resourceType,
        resourceId: auditLog.resourceId,
        createdAt: auditLog.createdAt,
      })
      .from(auditLog)
      .leftJoin(users, eq(auditLog.userId, users.id))
      .orderBy(desc(auditLog.createdAt))
      .limit(limit);
    return rows.map((r) => ({
      id: r.id,
      actorName: r.actorName ?? null,
      action: r.action,
      resourceType: r.resourceType,
      resourceId: r.resourceId ?? null,
      createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt),
    }));
  }
```
`return { list }` → `return { list, recent }`. Import `AuditRecentItemDto` schema'dan.
> ⚠️ `users` jadval RLS tenant-scoped EMAS (platform-darajali) — lekin `auditLog` RLS tenant'ni filtrlaydi, join faqat o'sha tenant'ning audit qatorlari userId'lariga tegadi; cross-tenant user nomi sizib chiqmaydi (faqat shu tenant amalini bajargan userlar). Bu xulqni testda tasdiqla.

- [ ] **Step 3: Route**

`audit.routes.ts`'ga (listRoute'dan keyin), import'ga `auditRecentItemDtoSchema` + `z` qo'sh:
```ts
  const recentRoute = createRoute({
    method: 'get',
    path: '/recent',
    tags: ['audit'],
    operationId: 'getRecentActivity',
    middleware: [requirePermission('audit_log.view')] as const,
    responses: okJson(z.array(auditRecentItemDtoSchema), 'Recent activity (metadata-only)'),
  });
  app.openapi(recentRoute, async (c) => {
    return c.json(ok(await service.recent(c)), 200);
  });
```
> `/recent` static yo'l — listRoute (`/`)'dan keyin xавfsiz.

- [ ] **Step 4: Integration test (maxfiylik + limit + FAIL→PASS)**

`ds12-a-activity-feed.test.ts` — setup'da bir nechta `audit_log` qator insert qil (userId set, before/after JSON bilan). Test:
```ts
test('recent: metadata-only, before/after YO'Q, DESC, limit', async () => {
  const rows = await run((c) => service.recent(c, 15));
  expect(rows.length).toBeGreaterThan(0);
  expect(rows.length).toBeLessThanOrEqual(15);
  // maxfiylik: hech bir qatorda before/after maydoni bo'lmasligi kerak
  for (const r of rows) {
    expect(r).not.toHaveProperty('before');
    expect(r).not.toHaveProperty('after');
  }
  // DESC: birinchi qator eng yangi
  expect(new Date(rows[0]!.createdAt).getTime()).toBeGreaterThanOrEqual(
    new Date(rows[rows.length - 1]!.createdAt).getTime(),
  );
});
```
Run: `cd apps/api && bun test --env-file=../../.env ds12-a-activity-feed.test.ts` → PASS.

- [ ] **Step 5: api-client regeneratsiya** — `bun run generate:contract` → `getRecentActivity`.

- [ ] **Step 6: Frontend hook**

`apps/web/src/features/audit/audit.api.ts` (yoki dashboard.api.ts):
```ts
export function useRecentActivity() {
  return useQuery({
    queryKey: ['audit', 'recent'],
    queryFn: () => getRecentActivity().then((r) => r.data),
  });
}
```

- [ ] **Step 7: ManagerDashboard activity rail**

`ManagerDashboard.tsx` o'ng rail: `hasPermission('audit_log.view')` bo'lsa `useRecentActivity()` → oxirgi 15 ta qator ro'yxati (`actorName` + `t('audit.action.<action>')` + `t('audit.resource.<resourceType>')` + nisbiy vaqt). Permission yo'q → render yo'q.

- [ ] **Step 8: i18n** — `dashboard.activityFeed` sarlavha + `audit.action.{created,updated,deleted,viewed,login,workspace_switched}` + `audit.resource.*` (kerakli resurslar) uz/ru.

- [ ] **Step 9: Verifikatsiya + commit**
```bash
cd apps/api && bun test --env-file=../../.env ds12-a-activity-feed.test.ts && cd ../.. && bunx turbo typecheck && bunx biome check
git add apps/api/src/modules/audit apps/api/tests/integration apps/web/src/features packages/i18n packages/api-client
git commit -m "feat(ds12-a): activity feed endpoint (audit recent, metadata-only) + DS1 rail"
```

---

## Task 7: Yakuniy holistik verifikatsiya (rol-bo'yicha)

**Files:** test-only / manual.

- [ ] **Step 1: To'liq backend test + lint + RLS**
Run:
```bash
cd apps/api && bun test --env-file=../../.env
cd ../.. && bunx turbo typecheck && bunx biome check && bun run check:rls
```
Expected: barcha test yashil; typecheck 16/16; biome 0; check:rls coverage O'ZGARMAGAN (yangi jadval yo'q).

- [ ] **Step 2: Rol-bo'yicha RBAC tekshiruv (`@owner` EMAS)**
Mavjud `cli-153-permission-guard.test.ts` pattern'i bo'yicha tasdiqla:
- `report.view`siz rol (Receptionist permset) `/reports/*` → 403; `report.view`li (Branch Manager/Accountant) → 200.
- `recall.view`li har rol (Receptionist, Doctor, Branch Manager) `/recalls/summary` → 200; `recall.view`siz (Accountant, Nurse) → 403.
- `audit_log.view`li (Tenant Admin, Branch Manager) `/audit-log/recent` → 200; `audit_log.view`siz (Accountant, Doctor, Receptionist) → 403.

- [ ] **Step 3: Frontend rendering tekshiruv (Playwright/manual, owner-only EMAS)**
`reference_playwright_e2e_setup` bo'yicha full-stack ko'tarib, kamida Branch Manager + Accountant + Receptionist + Doctor rollari bilan dashboard/reports/recall ekranlarini och:
- Manager: KPI delta+sparkline ko'rinadi; recall rail + activity feed ko'rinadi.
- Accountant: KPI delta+sparkline + donut ko'rinadi; recall rail YO'Q (recall.view yo'q), activity feed YO'Q (audit_log.view yo'q).
- Receptionist: KPI kartalar delta/sparkline'siz (report.view yo'q); recall ekrani 4-KPI ko'rinadi (recall.view bor).
- Doctor: recall ekrani 4-KPI ko'rinadi.
- Konsol/network'da 403 xato YO'Q (permission yo'q joyда so'rov yuborilmaydi).

- [ ] **Step 4: Yakuniy commit (agar tuzatish bo'lsa) + Linear/Obsidian sync**
DS12-A yopilganini Linear'da belgilang (DS12 epik ostidagi A-task) va Obsidian `07-Dental-OS-Roadmap.md`'ga sync qiling. Branch `feat/ds12-a-readonly-aggregates` lokal qoladi (push foydalanuvchiniki).

---

## Self-Review (reja muallifi tomonidan bajarildi)

**Spec coverage:** §3 (6 aggregate) → Task 1 (delta/YoY), Task 2 (sparkline), Task 3 (donut), Task 4 (heatmap), Task 5 (recall summary), Task 6 (activity feed). §2 additive prinsipi → har task additive/mos-modul. §5 frontend ulash → har task'da frontend qadamlar. §6 null-handling → Task 1 `comparisonEntry`. §7 RBAC/test → Task 7. ✓ barcha qoplangan.

**Refinement (spec'dan):** §4.1 `comparison` `.nullable()` o'rniga obyekt doim mavjud, child'lar nullable (frontend uchun soddaroq, semantik bir xil).

**Placeholder scan:** Frontend Heatmap/ReportsScreen qadamlari to'liq grid render'ini «mavjud kartalar uslubiga moslab» qoldiradi — bu mavjud komponentga integratsiya bo'lgani uchun (implementer komponentni o'qiydi), TBD emas; kalit struktura va data-oqim berilgan.

**Type consistency:** `comparison` obyekt shakli schema/service/mapper/frontend bo'ylab bir xil; `RecallSummary`/`AuditRecentItem` operationId'lari (`getRecallSummary`/`getRecentActivity`) frontend hook'larda mos. ✓
