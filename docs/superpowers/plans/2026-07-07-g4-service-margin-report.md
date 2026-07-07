# G4 — Xizmat margin hisoboti: BOM + avg-cost approksimatsiya (CLI-450) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `dental-analytics` hisobotidagi `procedureMix` javobiga har xizmat uchun `materialCost` (davr ichidagi jami material xarajati), `margin` (foyda) va `marginPct` (foyda foizi) maydonlarini qo'shish — BOM (`service_materials`) va item bo'yicha o'rtacha narx (`stock_batches.costPerUnit`) asosida.

**Muhim cheklov (v1 approksimatsiya, o'zgartirilmaydi):** `costPerUnit` FAQAT `stock_batches` jadvalida bor (batch-darajasida) — FIFO/batch-consumption tracking mavjud emas (`deductForServices` faqat item-darajasidagi `quantity`ni kamaytiradi, muayyan batch bilan bog'lamaydi). Shuning uchun material narxi = **shu item uchun barcha `stock_batches.costPerUnit IS NOT NULL` qatorlarning oddiy o'rtachasi** (og'irliksiz average, sana bo'yicha weighting yo'q). Itemning hech qanday batchida cost yozilmagan bo'lsa — narxi 0. Bu **qasddan approksimatsiya**, aniq COGS emas (scope tashqarisida — alohida keyingi ticket, agar aniq batch-consumption kerak bo'lsa).

**Architecture:**
- `netServiceAggregates` (`reports.service.ts:83-129`, raw-SQL CTE) `procedureMix`/`byService` uchun `serviceName` bo'yicha guruhlangan `{serviceName, count, revenue}` qatorlarni qaytaradi. Bu funksiya `cashier_transaction_items.service_id`ni (nullable, FK `services.id`, `onDelete: 'set null'`) hisobga olmaydi — faqat `service_name` (snapshot text) bo'yicha guruhlaydi. G4 uchun BOM'ga bog'lash `service_id` orqali bo'lgani sababli, `netServiceAggregates`ga bitta qo'shimcha ustun qo'shiladi: `MAX(i.service_id::text) AS "serviceId"` (guruh ichidagi vakolatli id — `service_name` snapshot bo'lgani uchun bir nomga bir nechta turli `service_id` real amaliyotda deyarli uchramaydi; `MAX` NULL'larni e'tiborsiz qoldiradi, guruhda hech bo'lmasa bitta non-null id bo'lsa o'shani tanlaydi). `service_id IS NULL` bo'lgan guruhlar (eski/o'chirilgan xizmat snapshot'i) uchun BOM'ga bog'lab bo'lmaydi — material narxi 0 (dokumentlashtirilgan chegara holat).
- Yangi ikkita **sof funksiya** `reports.aggregations.ts`ga qo'shiladi: `materialCostByService` (BOM qatorlari + item-bo'yicha o'rtacha-narx `Map`'dan `Map<serviceId, materialCostPerOccurrence>` hisoblaydi) va `computeServiceMargin` (bitta `procedureMix` qatori uchun `materialCost/margin/marginPct` hisoblaydi). Ikkalasi ham Drizzle/Context'ni bilmaydi — faqat raqamlar bilan ishlaydi (G1/G2 pretsedenti).
- `dentalAnalytics()` (`reports.service.ts:447-539`) `netServiceAggregates`dan qaytgan qatorlardagi `serviceId`lar bo'yicha ikkita qo'shimcha (oddiy, non-correlated) Drizzle query-builder so'rovi qiladi: (1) `stock_batches`dan item bo'yicha o'rtacha narx (`GROUP BY item_id`, `WHERE cost_per_unit IS NOT NULL`), (2) `service_materials`dan BOM qatorlari (`WHERE service_id IN (...)`). Bular sof funksiyalarga uzatiladi, natija `procedureMix` javobiga birlashtiriladi.
- **Formula aniqlashtirish (spec matnidagi `margin = revenue - materialCostPerService` — birlik jihatdan mos emas: `revenue` — davr yig'indisi, `materialCostPerService` esa BITTA ijro narxi; javob maydoni nomi `materialCost` — bu ham yig'indi bo'lishi kerak):** `materialCost (javobda) = materialCostPerOccurrence (BOM'dan hisoblangan) × count (davrdagi jami bajarilgan protsedura soni, `netServiceAggregates`ning xom `SUM(quantity)`)`. `margin = revenue - materialCost`. `marginPct = margin / revenue` (`revenue === 0` → `null`). Bu yagona izchil talqin (`revenue` va `count` ikkalasi ham davr yig'indisi, ikkalasi bir xil miqyosda ko'paytiriladi) — implementatsiya paytida boshqacha talqin qidirilmasin.
- **Frontend haqiqiy holat spec taxminidan farq qiladi:** spec "mavjud xizmat-jadvaliga 3 ustun qo'shiladi" deydi, lekin `ReportsScreen.tsx`da `procedureMix` hozir **Table emas** — `BarMini` (sof CSS bar-chart, faqat `serviceName`+`revenue`, `count` умуман ko'rsatilmaydi) orqali render qilinadi. Shuning uchun "3 ustun qo'shish" imkonsiz — Task 3 `procedureMix` blokini `BarMini`dan Mantine `Table`ga (6 ustun: Xizmat/Soni/Daromad/Material xarajati/Margin/Margin %) ko'chiradi. Faqat shu blok o'zgaradi — yonidagi alohida `top_services` (`revenue.byService`) `BarMini` bloki (ReportsScreen.tsx:~284-296) TEGILMAYDI (spec bu blokni so'ramagan).
- `packages/api-client` — OpenAPI'dan **auto-generated** (CLAUDE.md §3.6). `reports.schema.ts` o'zgargandan keyin `bun run generate:contract` (= `generate:openapi` + `generate:api-client`) ishga tushiriladi va generated diff commit qilinadi — **Task 3 (frontend) Task 2 tugagunча boshlanmaydi**, chunki `DentalAnalyticsReportProcedureMixItem` tipiga yangi maydonlar faqat regenerate qilingandan keyin qo'shiladi.

**Tech Stack:** Bun, Hono, `@hono/zod-openapi`, Drizzle ORM (query-builder — raw SQL CTE shart emas, faqat `netServiceAggregates`ning mavjud raw-SQL'iga bitta ustun qo'shiladi), PostgreSQL, orval (`generate:api-client`), Vitest (pure-function unit test, web), `bun test` (real-DB integration test, api), React + Mantine `Table`.

## Global Constraints

- Hech qanday `WHERE tenant_id` yozilmaydi — `stock_batches`/`service_materials` RLS-bound `getDb(c)` orqali avtomatik tenant-scoped (CLAUDE.md §3.4).
- Pul summalari — `numeric(14,2)` DB ustunlari, JS'da `Number()` bilan o'qiladi.
- Sof funksiyalar (`materialCostByService`, `computeServiceMargin`) Context/Drizzle'ni bilmaydi — faqat raqamlar bilan ishlaydi, `reports.aggregations.ts`ga qo'shiladi (mavjud `noShowRate`/`utilizationPct` bilan bir joyda, bir xil eksport uslubi).
- Integration test real DB (`bun test --env-file=../../.env`), `noopAudit` (mock audit emas).
- Ruxsat (`report.view`) o'zgarmaydi — G4 yangi gate qo'shmaydi (bu G5'ning ishi, G4'ga aloqasi yo'q).
- Mapper (`reports.mapper.ts::toDentalAnalyticsReportDto`) o'zgarmaydi — `procedureMix: r.procedureMix.map((p) => ({ ...p }))` allaqachon shape-preserving spread, yangi maydonlar avtomatik o'tadi.
- `packages/api-client` generated fayllarni **qo'lda tahrirlama** — faqat `bun run generate:contract` orqali.

---

### Task 1: Sof funksiyalar — `materialCostByService` + `computeServiceMargin`

**Files:**
- Modify: `apps/api/src/modules/reports/reports.aggregations.ts`
- Test: `apps/api/src/modules/reports/reports.aggregations.test.ts`

**Interfaces:**
- Produces: `materialCostByService(bom: ServiceMaterialRow[], avgCostByItemId: Map<string, number>): Map<string, number>`, `computeServiceMargin(serviceName: string, count: number, revenue: number, materialCostPerOccurrence: number): ServiceMarginRow`, eksport qilingan `ServiceMaterialRow`/`ServiceMarginRow` tiplari — Task 2 shularni import qiladi.

- [ ] **Step 1: Write the failing tests**

`apps/api/src/modules/reports/reports.aggregations.test.ts` faylining import blokini kengaytiring — eski:

```ts
import { describe, expect, it, test } from 'bun:test';
import {
  branchOpenMinutes,
  comparisonEntry,
  completionRate,
  DEFAULT_WORK_MINUTES,
  deltaPct,
  noShowRate,
  periodLengthDays,
  recallEfficacy,
  retentionRate,
  shiftDays,
  shiftYears,
  utilizationPct,
} from './reports.aggregations.ts';
```

yangi:

```ts
import { describe, expect, it, test } from 'bun:test';
import {
  branchOpenMinutes,
  comparisonEntry,
  completionRate,
  computeServiceMargin,
  DEFAULT_WORK_MINUTES,
  deltaPct,
  materialCostByService,
  noShowRate,
  periodLengthDays,
  recallEfficacy,
  retentionRate,
  shiftDays,
  shiftYears,
  utilizationPct,
} from './reports.aggregations.ts';
```

Faylning oxiriga (mavjud `describe('ds12-a comparison helpers', ...)` blokidan keyin) qo'shing:

```ts
describe('CLI-450: materialCostByService', () => {
  it('BOM + avg-cost — xizmat uchun material narxini SUM(qty × avgCost) hisoblaydi', () => {
    const bom = [
      { serviceId: 's1', itemId: 'i1', qtyPerService: 2 },
      { serviceId: 's1', itemId: 'i2', qtyPerService: 1 },
      { serviceId: 's2', itemId: 'i1', qtyPerService: 3 },
    ];
    const avgCostByItemId = new Map([
      ['i1', 1000],
      ['i2', 500],
    ]);
    const result = materialCostByService(bom, avgCostByItemId);
    expect(result.get('s1')).toBe(2500); // 2×1000 + 1×500
    expect(result.get('s2')).toBe(3000); // 3×1000
  });

  it("item uchun cost yozilmagan (avgCostByItemId'da yo'q) — narxi 0 (v1 approksimatsiya)", () => {
    const bom = [{ serviceId: 's1', itemId: 'i-no-cost', qtyPerService: 5 }];
    const result = materialCostByService(bom, new Map());
    expect(result.get('s1')).toBe(0);
  });

  it("bo'sh BOM — bo'sh Map", () => {
    expect(materialCostByService([], new Map()).size).toBe(0);
  });
});

describe('CLI-450: computeServiceMargin', () => {
  it('materialCost = materialCostPerOccurrence × count; margin = revenue - materialCost', () => {
    const row = computeServiceMargin('Plomba', 10, 500000, 20000);
    expect(row).toEqual({
      serviceName: 'Plomba',
      count: 10,
      revenue: 500000,
      materialCost: 200000, // 20000 × 10
      margin: 300000,
      marginPct: 0.6,
    });
  });

  it('revenue=0 → marginPct null (ma\'noli foiz yo\'q)', () => {
    const row = computeServiceMargin('X', 0, 0, 0);
    expect(row.marginPct).toBeNull();
    expect(row.margin).toBe(0);
  });

  it('materialCost > revenue — manfiy margin (zarar)', () => {
    const row = computeServiceMargin('Y', 5, 10000, 5000); // materialCost = 5×5000 = 25000
    expect(row.margin).toBe(-15000);
    expect(row.marginPct).toBe(-1.5);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/api && bunx vitest run src/modules/reports/reports.aggregations.test.ts`
Expected: FAIL — `materialCostByService`/`computeServiceMargin` is not a function (hali yo'q).

- [ ] **Step 3: Write minimal implementation**

`apps/api/src/modules/reports/reports.aggregations.ts` faylining oxiriga qo'shing:

```ts
// ─── CLI-450: Xizmat margin hisoboti (BOM + avg-cost approksimatsiya) ────────

/** `service_materials` BOM qatori — sof kirish (Drizzle numeric ustunlar JS number'ga o'girilgan). */
export type ServiceMaterialRow = {
  serviceId: string;
  itemId: string;
  qtyPerService: number;
};

/**
 * BOM + item bo'yicha o'rtacha narx (`avgCostByItemId` — `stock_batches.costPerUnit`
 * o'rtachasi) dan xizmat uchun BITTA ijro (occurrence) narxini hisoblaydi.
 * v1 approksimatsiya (dokumentlashtirilgan cheklov): FIFO/batch-consumption tracking
 * yo'q; itemning hech qanday batchida cost yozilmagan bo'lsa (`avgCostByItemId`da
 * yo'q) — narxi 0.
 */
export function materialCostByService(
  bom: ServiceMaterialRow[],
  avgCostByItemId: Map<string, number>,
): Map<string, number> {
  const result = new Map<string, number>();
  for (const row of bom) {
    const unitCost = avgCostByItemId.get(row.itemId) ?? 0;
    result.set(row.serviceId, (result.get(row.serviceId) ?? 0) + row.qtyPerService * unitCost);
  }
  return result;
}

/** Xizmat margin qatori — CLI-450 `procedureMix` javobi uchun. */
export type ServiceMarginRow = {
  serviceName: string;
  count: number;
  revenue: number;
  materialCost: number;
  margin: number;
  marginPct: number | null;
};

/**
 * Xizmat margin hisobi: `materialCost = materialCostPerOccurrence × count` (davr
 * ichida bajarilgan barcha ijrolar — `count` = xom `SUM(quantity)`, `netServiceAggregates`
 * bilan bir xil miqyos). `margin = revenue - materialCost`. `marginPct = margin / revenue`
 * (`revenue === 0` → `null`, ma'noli foiz yo'q).
 */
export function computeServiceMargin(
  serviceName: string,
  count: number,
  revenue: number,
  materialCostPerOccurrence: number,
): ServiceMarginRow {
  const materialCost = materialCostPerOccurrence * count;
  const margin = revenue - materialCost;
  const marginPct = revenue === 0 ? null : margin / revenue;
  return { serviceName, count, revenue, materialCost, margin, marginPct };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/api && bunx vitest run src/modules/reports/reports.aggregations.test.ts`
Expected: PASS — barcha mavjud + yangi 6 test yashil.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/reports/reports.aggregations.ts apps/api/src/modules/reports/reports.aggregations.test.ts
git commit -m "feat(api): CLI-450 — materialCostByService/computeServiceMargin sof funksiyalari"
```

---

### Task 2: Backend ulash — `netServiceAggregates` + `dentalAnalytics` + schema + OpenAPI regenerate

**Files:**
- Modify: `apps/api/src/modules/reports/reports.service.ts:1-28` (import), `:61` (`NetServiceRow` tipi), `:93-129` (`netServiceAggregates` SQL+mapping), `:447-539` (`dentalAnalytics`)
- Modify: `apps/api/src/modules/reports/reports.schema.ts:105-137` (`dentalAnalyticsReportDtoSchema.procedureMix`)
- Regenerate: `packages/api-client/src/generated/**` (`bun run generate:contract`)
- Test: yangi `apps/api/tests/integration/cli-450-service-margin.test.ts`

**Interfaces:**
- Consumes: `materialCostByService`, `computeServiceMargin`, `ServiceMaterialRow` (Task 1).
- Produces: `dentalAnalytics()` xulqi o'zgaradi (`procedureMix` qatorlariga 3 yangi maydon) — Task 3 shu maydonlarni frontend'da render qiladi. **Task 3 ushbu Task tugab, `generate:contract` ishga tushirilgunча boshlanmaydi** (generated tip Task 3'ga kerak).

- [ ] **Step 1: Write the failing integration test**

`apps/api/tests/integration/cli-450-service-margin.test.ts`:

```ts
/**
 * CLI-450 — xizmat margin hisoboti: BOM (`service_materials`) + item bo'yicha
 * o'rtacha narx (`stock_batches.costPerUnit`) asosida `materialCost`/`margin`/
 * `marginPct` — v1 approksimatsiya (FIFO/batch-consumption tracking yo'q,
 * dokumentlashtirilgan cheklov). Real DB.
 *
 * Ishga tushirish (yolg'iz — TRUNCATE poygasi):
 *   cd apps/api && bun test tests/integration/cli-450-service-margin.test.ts --env-file=../../.env
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import {
  branches,
  cashierTransactionItems,
  cashierTransactions,
  patients,
  serviceMaterials,
  services,
  stockBatches,
  stockItems,
  tenants,
  users,
} from '@dental/db-schema';
import { sql } from 'drizzle-orm';
import type { Context } from 'hono';
import type { DbOrTx } from '../../src/db/client.ts';
import { db } from '../../src/db/client.ts';
import type { AuditLogger } from '../../src/lib/audit-logger.ts';
import { createReportsService } from '../../src/modules/reports/reports.service.ts';

const noopAudit = { record: async () => {} } as unknown as AuditLogger;
const service = createReportsService({ audit: noopAudit });
const ctx = (tx: DbOrTx): Context =>
  ({
    get: (k: string) =>
      k === 'db' ? tx : k === 'accessClaims' ? { perms: ['@owner'] } : undefined,
  }) as unknown as Context;

const RANGE = { from: '2026-06-01', to: '2026-06-30' };

let tenantId: string;
let ownerId: string;
let branchId: string;
let patientId: string;
let serviceId: string;

beforeAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
  const [owner] = await db
    .insert(users)
    .values({ phone: '+998900000450', passwordHash: 'x', fullName: 'Doc' })
    .returning({ id: users.id });
  if (!owner) throw new Error('owner insert failed');
  ownerId = owner.id;
  const [tenant] = await db
    .insert(tenants)
    .values({ name: 'CLI450 Clinic', slug: 'cli450-clinic', ownerUserId: ownerId })
    .returning({ id: tenants.id });
  if (!tenant) throw new Error('tenant insert failed');
  tenantId = tenant.id;

  await db.transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));

    const [branch] = await tx
      .insert(branches)
      .values({ tenantId, name: 'B' })
      .returning({ id: branches.id });
    if (!branch) throw new Error('branch insert failed');
    branchId = branch.id;

    const [patient] = await tx
      .insert(patients)
      .values({ tenantId, fullName: 'P' })
      .returning({ id: patients.id });
    if (!patient) throw new Error('patient insert failed');
    patientId = patient.id;

    const [svc] = await tx
      .insert(services)
      .values({ tenantId, code: 'PL-450', nameUz: 'Plomba' })
      .returning({ id: services.id });
    if (!svc) throw new Error('service insert failed');
    serviceId = svc.id;

    const [item] = await tx
      .insert(stockItems)
      .values({ tenantId, name: 'Kompozit', unit: 'dona' })
      .returning({ id: stockItems.id });
    if (!item) throw new Error('stock item insert failed');
    const itemId = item.id;

    // Ikki partiya, turli costPerUnit — o'rtacha narx (1000+3000)/2 = 2000 (v1 approksimatsiya).
    await tx.insert(stockBatches).values([
      { tenantId, itemId, costPerUnit: '1000', qtyReceived: '10' },
      { tenantId, itemId, costPerUnit: '3000', qtyReceived: '10' },
    ]);

    // BOM: har protseduraga 2 dona kompozit → materialCostPerOccurrence = 2 × 2000 = 4000
    await tx.insert(serviceMaterials).values({
      tenantId,
      serviceId,
      itemId,
      qtyPerService: '2',
    });

    // Savdo: 3 marta bajarilgan, refundsiz, chegirmasiz — revenue = 150000, count = 3.
    const [tx1] = await tx
      .insert(cashierTransactions)
      .values({
        tenantId,
        branchId,
        patientId,
        totalAmount: '150000',
        paidAmount: '150000',
        paymentMethod: 'cash',
        type: 'payment',
        status: 'completed',
        createdAt: new Date('2026-06-10T12:00:00+05:00'),
      })
      .returning({ id: cashierTransactions.id });
    if (!tx1) throw new Error('tx insert failed');
    await tx.insert(cashierTransactionItems).values({
      transactionId: tx1.id,
      serviceId,
      serviceName: 'Plomba',
      quantity: 3,
      unitPrice: '50000',
      subtotal: '150000',
    });
  });
});

afterAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
});

describe('CLI-450: xizmat margin hisoboti (procedureMix)', () => {
  test('materialCost = qtyPerService × avgCostPerUnit × count; margin = revenue - materialCost', async () => {
    const r = await db.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
      return service.dentalAnalytics(ctx(tx), RANGE);
    });

    const row = r.procedureMix.find((p) => p.serviceName === 'Plomba');
    expect(row).toBeDefined();
    expect(row?.count).toBe(3);
    expect(row?.revenue).toBe(150000);
    // avgCost(item) = (1000+3000)/2 = 2000; materialCostPerOccurrence = 2 × 2000 = 4000
    // materialCost (davr) = 4000 × 3 = 12000
    expect(row?.materialCost).toBe(12000);
    expect(row?.margin).toBe(138000); // 150000 − 12000
    expect(row?.marginPct).toBeCloseTo(0.92, 5);
  });

  test("serviceId yo'q (eski/o'chirilgan xizmat snapshot) — materialCost 0, margin = revenue", async () => {
    const r = await db.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));

      const [tx2] = await tx
        .insert(cashierTransactions)
        .values({
          tenantId,
          branchId,
          patientId,
          totalAmount: '20000',
          paidAmount: '20000',
          paymentMethod: 'cash',
          type: 'payment',
          status: 'completed',
          createdAt: new Date('2026-06-11T12:00:00+05:00'),
        })
        .returning({ id: cashierTransactions.id });
      if (!tx2) throw new Error('tx2 insert failed');
      await tx.insert(cashierTransactionItems).values({
        transactionId: tx2.id,
        serviceName: "O'chirilgan xizmat",
        quantity: 1,
        unitPrice: '20000',
        subtotal: '20000',
      });

      return service.dentalAnalytics(ctx(tx), RANGE);
    });

    const row = r.procedureMix.find((p) => p.serviceName === "O'chirilgan xizmat");
    expect(row).toBeDefined();
    expect(row?.materialCost).toBe(0);
    expect(row?.margin).toBe(row?.revenue);
    expect(row?.marginPct).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && bun test tests/integration/cli-450-service-margin.test.ts --env-file=../../.env`
Expected: FAIL — `row?.materialCost` `undefined` (maydon hali javobda yo'q) yoki TypeScript xatosi (`materialCost` `ProcedureMix` tipida yo'q).

- [ ] **Step 3: Write minimal implementation**

`apps/api/src/modules/reports/reports.service.ts` import blokini yangilang — eski:

```ts
import {
  appointments,
  branches,
  cashierTransactions,
  patients,
  recalls,
  treatmentPlans,
  treatmentStages,
} from '@dental/db-schema';
import type { Column } from 'drizzle-orm';
import { and, count, countDistinct, desc, eq, gte, isNull, lt, ne, sql } from 'drizzle-orm';
import type { Context } from 'hono';
import type { DbOrTx } from '../../db/client.ts';
import { getDb } from '../../db/scoped.ts';
import type { AuditLogger } from '../../lib/audit-logger.ts';
import {
  branchOpenMinutes,
  comparisonEntry,
  completionRate,
  DEFAULT_WORK_MINUTES,
  noShowRate,
  periodLengthDays,
  recallEfficacy,
  retentionRate,
  shiftDays,
  shiftYears,
  utilizationPct,
} from './reports.aggregations.ts';
```

yangi:

```ts
import {
  appointments,
  branches,
  cashierTransactions,
  patients,
  recalls,
  serviceMaterials,
  stockBatches,
  treatmentPlans,
  treatmentStages,
} from '@dental/db-schema';
import type { Column } from 'drizzle-orm';
import {
  and,
  count,
  countDistinct,
  desc,
  eq,
  gte,
  inArray,
  isNotNull,
  isNull,
  lt,
  ne,
  sql,
} from 'drizzle-orm';
import type { Context } from 'hono';
import type { DbOrTx } from '../../db/client.ts';
import { getDb } from '../../db/scoped.ts';
import type { AuditLogger } from '../../lib/audit-logger.ts';
import {
  branchOpenMinutes,
  comparisonEntry,
  completionRate,
  computeServiceMargin,
  DEFAULT_WORK_MINUTES,
  materialCostByService,
  noShowRate,
  periodLengthDays,
  recallEfficacy,
  retentionRate,
  shiftDays,
  shiftYears,
  utilizationPct,
} from './reports.aggregations.ts';
```

`NetServiceRow` tipini (`:61`) yangilang — eski:

```ts
type NetServiceRow = { serviceName: string; count: number; revenue: number };
```

yangi:

```ts
type NetServiceRow = { serviceName: string; serviceId: string | null; count: number; revenue: number };
```

`netServiceAggregates` funksiyasidagi SQL SELECT va return mapping'ni (`:110-129`) yangilang — eski:

```ts
    SELECT
      i.service_name AS "serviceName",
      COALESCE(SUM(i.quantity), 0) AS "count",
      COALESCE(SUM(
        CASE WHEN tn.gross > 0 THEN ROUND((i.subtotal * tn.net_paid / tn.gross)::numeric, 2) ELSE 0 END
      ), 0) AS "revenue"
    FROM cashier_transaction_items i
    JOIN tx_net tn ON tn.tx_id = i.transaction_id
    GROUP BY i.service_name
    ORDER BY "revenue" DESC
  `);

  return (rows as unknown as { serviceName: string; count: string; revenue: string }[]).map(
    (r) => ({
      serviceName: r.serviceName,
      count: Number(r.count),
      revenue: Number(r.revenue),
    }),
  );
}
```

yangi:

```ts
    SELECT
      i.service_name AS "serviceName",
      MAX(i.service_id::text) AS "serviceId",
      COALESCE(SUM(i.quantity), 0) AS "count",
      COALESCE(SUM(
        CASE WHEN tn.gross > 0 THEN ROUND((i.subtotal * tn.net_paid / tn.gross)::numeric, 2) ELSE 0 END
      ), 0) AS "revenue"
    FROM cashier_transaction_items i
    JOIN tx_net tn ON tn.tx_id = i.transaction_id
    GROUP BY i.service_name
    ORDER BY "revenue" DESC
  `);

  return (
    rows as unknown as {
      serviceName: string;
      serviceId: string | null;
      count: string;
      revenue: string;
    }[]
  ).map((r) => ({
    serviceName: r.serviceName,
    // CLI-450: BOM (`service_materials`) `service_id` orqali bog'lanadi — `service_name`
    // snapshot bo'lgani uchun (xizmat o'chirilsa ham saqlanadi) guruh ichida `MAX`
    // orqali vakolatli non-null id tanlanadi; barcha qator `service_id IS NULL` bo'lsa
    // (eski/o'chirilgan xizmat) — `null`, material narxi 0 bo'ladi (dentalAnalytics'da).
    serviceId: r.serviceId,
    count: Number(r.count),
    revenue: Number(r.revenue),
  }));
}
```

`dentalAnalytics()` funksiyasida (`:447-539`) `mixRows` hisoblangandan keyin BOM+avg-cost blokini qo'shing va `procedureMix`ni hisoblangan qatorlar bilan almashtiring — eski:

```ts
    // 1. Procedure-mix — kassa item'lari (completed payment, oraliq, filial).
    //    `count` = XOM SUM(quantity) (bajarilgan protsedura soni); `revenue` = net-of-
    //    refund-and-discount (CLI-430) — `netServiceAggregates` bilan bir xil hisoblash.
    const mixRows = await netServiceAggregates(db, start, end, branchId);
```

yangi:

```ts
    // 1. Procedure-mix — kassa item'lari (completed payment, oraliq, filial).
    //    `count` = XOM SUM(quantity) (bajarilgan protsedura soni); `revenue` = net-of-
    //    refund-and-discount (CLI-430) — `netServiceAggregates` bilan bir xil hisoblash.
    const mixRows = await netServiceAggregates(db, start, end, branchId);

    // CLI-450: xizmat margin (BOM + item bo'yicha o'rtacha-narx approksimatsiya, v1 —
    // dokumentlashtirilgan cheklov: FIFO/batch-consumption tracking yo'q). `serviceId`
    // yo'q guruhlar (eski/o'chirilgan xizmat snapshot'i) uchun material narxi 0.
    const mixServiceIds = mixRows
      .map((r) => r.serviceId)
      .filter((id): id is string => id != null);

    let materialCostByServiceId = new Map<string, number>();
    if (mixServiceIds.length > 0) {
      const avgCostRows = await db
        .select({
          itemId: stockBatches.itemId,
          avgCost: sql<string>`AVG(${stockBatches.costPerUnit})`,
        })
        .from(stockBatches)
        .where(isNotNull(stockBatches.costPerUnit))
        .groupBy(stockBatches.itemId);
      const avgCostByItemId = new Map(avgCostRows.map((r) => [r.itemId, Number(r.avgCost)]));

      const bomRows = await db
        .select({
          serviceId: serviceMaterials.serviceId,
          itemId: serviceMaterials.itemId,
          qtyPerService: serviceMaterials.qtyPerService,
        })
        .from(serviceMaterials)
        .where(inArray(serviceMaterials.serviceId, mixServiceIds));

      materialCostByServiceId = materialCostByService(
        bomRows.map((r) => ({
          serviceId: r.serviceId,
          itemId: r.itemId,
          qtyPerService: Number(r.qtyPerService),
        })),
        avgCostByItemId,
      );
    }

    const procedureMix = mixRows.map((r) =>
      computeServiceMargin(
        r.serviceName,
        r.count,
        r.revenue,
        r.serviceId ? (materialCostByServiceId.get(r.serviceId) ?? 0) : 0,
      ),
    );
```

Funksiya oxiridagi `return` blokida (`:517-538`) `procedureMix: mixRows,`ni almashtiring — eski:

```ts
    return {
      procedureMix: mixRows,
      retention: {
```

yangi:

```ts
    return {
      procedureMix,
      retention: {
```

`apps/api/src/modules/reports/reports.schema.ts` faylida `dentalAnalyticsReportDtoSchema.procedureMix` maydonini (`:105-113`) yangilang — eski:

```ts
    // CLI-430: net-of-refund-and-discount (netServiceAggregates) — `count` = xom
    // bajarilgan protsedura soni (SUM quantity), `revenue` = net collected (chegirma +
    // qisman refund hisobga olingan, `revenue.total` bilan izchil cash-basis).
    procedureMix: z.array(
      z.object({ serviceName: z.string(), count: z.number(), revenue: z.number() }),
    ),
```

yangi:

```ts
    // CLI-430: net-of-refund-and-discount (netServiceAggregates) — `count` = xom
    // bajarilgan protsedura soni (SUM quantity), `revenue` = net collected (chegirma +
    // qisman refund hisobga olingan, `revenue.total` bilan izchil cash-basis).
    // CLI-450: `materialCost`/`margin`/`marginPct` — BOM (`service_materials`) + item
    // bo'yicha o'rtacha narx (`stock_batches.costPerUnit`) asosida, v1 approksimatsiya
    // (FIFO/batch-consumption tracking yo'q, dokumentlashtirilgan cheklov). `marginPct`
    // `revenue === 0` bo'lsa `null` (ma'noli foiz yo'q).
    procedureMix: z.array(
      z.object({
        serviceName: z.string(),
        count: z.number(),
        revenue: z.number(),
        materialCost: z.number(),
        margin: z.number(),
        marginPct: z.number().nullable(),
      }),
    ),
```

- [ ] **Step 4: Regenerate OpenAPI spec + api-client**

Run: `cd /home/madrimov/Projects/dental-service && bun run generate:contract`
Expected: 0 xato; `packages/api-client/src/generated/model/dentalAnalyticsReportProcedureMixItem.ts` endi `materialCost: number; margin: number; marginPct: number | null;` maydonlarini o'z ichiga oladi (avval faqat `serviceName/count/revenue`).

- [ ] **Step 5: Run test to verify it passes**

Run: `cd apps/api && bun test tests/integration/cli-450-service-margin.test.ts --env-file=../../.env`
Expected: PASS — ikkala test yashil.

- [ ] **Step 6: Regression — mavjud reports testlari**

Run: `cd apps/api && bun test tests/integration/reports.test.ts --env-file=../../.env`
Expected: PASS (o'zgarmagan — `revenue.byService` `serviceId`ni e'tiborsiz qoldiradi, `netServiceAggregates`ning qo'shilgan `serviceId` maydoni bu testga ta'sir qilmaydi).

Run: `cd apps/api && bunx vitest run src/modules/reports/`
Expected: PASS.

- [ ] **Step 7: Typecheck**

Run: `cd apps/api && bun run typecheck` (yoki repo-root `turbo run typecheck --filter=@dental/api`)
Expected: 0 xato.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/modules/reports/reports.service.ts apps/api/src/modules/reports/reports.schema.ts apps/api/tests/integration/cli-450-service-margin.test.ts packages/api-client/openapi.json packages/api-client/src/generated
git commit -m "feat(api): CLI-450 — procedureMix'ga materialCost/margin/marginPct (BOM+avg-cost)"
```

> `generate:openapi` (`apps/api/scripts/generate-openapi.ts`) `packages/api-client/openapi.json`ga yozadi (`orval.config.ts::input.target`); `generate:api-client` shu fayldan `packages/api-client/src/generated/**`ni ishlab chiqaradi (`orval.config.ts::output`) — ikkalasi ham yuqoridagi `git add`ga kiritilgan.

---

### Task 3: Frontend — `procedureMix` BarMini → Table (6 ustun)

**Files:**
- Modify: `apps/web/src/features/reports/components/ReportsScreen.tsx` (dental analitika bloki, `procedureMix` qismi)
- Modify: `packages/i18n/src/locales/uz.json`, `packages/i18n/src/locales/ru.json` (`reports.service`, `reports.material_cost`, `reports.margin`, `reports.margin_pct`)
- Modify: `apps/web/src/features/reports/components/ReportsScreen.test.tsx` (mock fixture + assertion)

**Interfaces:**
- Consumes: Task 2'dan keyin regenerate qilingan `DentalAnalyticsReportProcedureMixItem` (`materialCost/margin/marginPct` maydonlari bilan) — **bu Task Task 2 tugab, `generate:contract` bajarilgunча boshlanmaydi** (aks holda TypeScript `analytics.data.procedureMix[i].materialCost` xato beradi, maydon hali generated tipida yo'q).

> **Spec/real-kod farqi:** dizayn spec "mavjud xizmat-jadvaliga 3 ustun qo'shiladi" deydi, lekin `procedureMix` hozir Table emas — `BarMini` (sof CSS bar, faqat `serviceName`+`revenue`). Shuning uchun bu Task `BarMini`ni Mantine `Table`ga almashtiradi (6 ustun). Yonidagi alohida `top_services` (`revenue.byService`) `BarMini` bloki TEGILMAYDI.

- [ ] **Step 1: i18n kalitlari qo'shish**

`packages/i18n/src/locales/uz.json` — `"reports"` blokidagi `"occupancy": "Qabullar bandligi (issiqligi)"` qatoridan keyin (yopuvchi `}`dan oldin) qo'shing:

```json
    "occupancy": "Qabullar bandligi (issiqligi)",
    "service": "Xizmat",
    "material_cost": "Material xarajati",
    "margin": "Margin",
    "margin_pct": "Margin %"
```

`packages/i18n/src/locales/ru.json` — `"occupancy": "Тепловая карта записей"` qatoridan keyin (yopuvchi `}`dan oldin) qo'shing:

```json
    "occupancy": "Тепловая карта записей",
    "service": "Услуга",
    "material_cost": "Стоимость материалов",
    "margin": "Маржа",
    "margin_pct": "Маржа %"
```

- [ ] **Step 2: `procedureMix` blokini `BarMini`dan `Table`ga o'zgartirish**

`apps/web/src/features/reports/components/ReportsScreen.tsx` faylida `procedureMix` bloki — eski:

```tsx
              <Stack gap="xs">
                <Text fw={600}>{t('reports.procedure_mix')}</Text>
                {analytics.data.procedureMix.length > 0 ? (
                  <BarMini
                    data={analytics.data.procedureMix.map((p) => ({
                      label: p.serviceName,
                      value: p.revenue,
                    }))}
                  />
                ) : (
                  <Text c="dimmed">{t('reports.empty')}</Text>
                )}
              </Stack>
```

yangi:

```tsx
              <Stack gap="xs">
                <Text fw={600}>{t('reports.procedure_mix')}</Text>
                {analytics.data.procedureMix.length > 0 ? (
                  <Table>
                    <Table.Thead>
                      <Table.Tr>
                        <Table.Th>{t('reports.service')}</Table.Th>
                        <Table.Th>{t('reports.count')}</Table.Th>
                        <Table.Th>{t('reports.revenue')}</Table.Th>
                        <Table.Th>{t('reports.material_cost')}</Table.Th>
                        <Table.Th>{t('reports.margin')}</Table.Th>
                        <Table.Th>{t('reports.margin_pct')}</Table.Th>
                      </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                      {analytics.data.procedureMix.map((p) => (
                        <Table.Tr key={p.serviceName}>
                          <Table.Td>{p.serviceName}</Table.Td>
                          <Table.Td>{fmt(p.count)}</Table.Td>
                          <Table.Td>{formatCurrency(p.revenue, t)}</Table.Td>
                          <Table.Td>{formatCurrency(p.materialCost, t)}</Table.Td>
                          <Table.Td>{formatCurrency(p.margin, t)}</Table.Td>
                          <Table.Td>{p.marginPct === null ? '—' : pct(p.marginPct)}</Table.Td>
                        </Table.Tr>
                      ))}
                    </Table.Tbody>
                  </Table>
                ) : (
                  <Text c="dimmed">{t('reports.empty')}</Text>
                )}
              </Stack>
```

`BarMini` importi faylning boshqa joyida (`top_services` bloki) hali ishlatilgani uchun **import qatori o'zgarmaydi** (`import { BarMini } from './BarMini';` saqlanadi).

- [ ] **Step 3: Mavjud frontend testni yangilash**

`apps/web/src/features/reports/components/ReportsScreen.test.tsx` faylida `useDentalAnalytics` mock'ini kengaytiring — eski:

```ts
  useDentalAnalytics: () => ({
    data: {
      procedureMix: [],
      retention: { newPatients: 5, returningPatients: 3, retentionRate: 0.6 },
      recallEfficacy: { converted: 2, total: 4, efficacy: 0.5 },
      noShowByWeekday: [],
    },
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
```

yangi:

```ts
  useDentalAnalytics: () => ({
    data: {
      procedureMix: [
        {
          serviceName: 'Plomba',
          count: 10,
          revenue: 500000,
          materialCost: 200000,
          margin: 300000,
          marginPct: 0.6,
        },
      ],
      retention: { newPatients: 5, returningPatients: 3, retentionRate: 0.6 },
      recallEfficacy: { converted: 2, total: 4, efficacy: 0.5 },
      noShowByWeekday: [],
    },
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
```

Faylning `it(...)` blokiga (mavjud test ichiga, oxiriga) yangi assertion qo'shing:

```tsx
    // CLI-450: procedureMix jadvali — material xarajati/margin ustunlari
    expect(screen.getByText('Plomba')).toBeInTheDocument();
    expect(screen.getByText('Material xarajati')).toBeInTheDocument();
    expect(screen.getByText('Margin')).toBeInTheDocument();
```

- [ ] **Step 4: Run frontend tests**

Run: `cd apps/web && bunx vitest run src/features/reports/components/ReportsScreen.test.tsx`
Expected: PASS.

- [ ] **Step 5: Typecheck**

Run: `cd apps/web && bun run typecheck` (yoki repo-root `turbo run typecheck --filter=@dental/web`)
Expected: 0 xato — `analytics.data.procedureMix[i].materialCost` generated tipida mavjud bo'lishi kerak (Task 2 Step 4'da regenerate qilingan).

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/features/reports/components/ReportsScreen.tsx apps/web/src/features/reports/components/ReportsScreen.test.tsx packages/i18n/src/locales/uz.json packages/i18n/src/locales/ru.json
git commit -m "feat(web): CLI-450 — procedureMix jadvaliga material xarajati/margin ustunlari"
```

---

## Yakuniy DoD

- [ ] `materialCostByService` + `computeServiceMargin` — 6 sof unit test yashil (Task 1).
- [ ] `netServiceAggregates` `serviceId`ni qaytaradi; `dentalAnalytics.procedureMix` `materialCost`/`margin`/`marginPct` bilan — 2 integration test yashil (Task 2).
- [ ] `packages/api-client` regenerate qilingan (`materialCost/margin/marginPct` generated tipida).
- [ ] Mavjud `reports.test.ts` va `reports.aggregations.test.ts` regressiyasiz yashil.
- [ ] Frontend `procedureMix` jadval ko'rinishida (6 ustun), `top_services` bloki tegilmagan.
- [ ] Typecheck (api + web) toza.
- [ ] Linear CLI-450 — "Done"ga o'tkaziladi (implementatsiya + verify-agentdan keyin).
