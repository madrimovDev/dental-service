# G5 — Kunlik xulosaga xarajat integratsiyasi, expense.view-gated (CLI-452) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `GET /cashier/daily-summary` (`cashier.dailySummary`) javobiga shu kun+filial uchun `expensesTotal` (xarajatlar yig'indisi) va `netCashFlow` (sof pul oqimi = tushum − xarajat) qo'shish — LEKIN faqat so'rovchida `expense.view` (yoki `@owner`) bo'lsa. Boshqa foydalanuvchilar uchun bu ikki maydon javobda umuman bo'lmaydi (frontend mavjud kirim-qatorlarni ko'rsatishda davom etadi, xatoga chiqmaydi).

**Architecture:** `cashier.service.ts::dailySummary` hozir faqat `cashier_transactions`ni (`paymentMethod`+`type` bo'yicha guruhlangan) o'qiydi. Yangi qadam: (1) `userHasExpenseAccess(c)` — `patients.service.ts::userHasPiiAccess` bilan BIR XIL naqsh (`c.get('accessClaims')?.perms ?? []`, keyin `.includes('@owner') || .includes('expense.view')`), route darajasida YANGI middleware QO'SHILMAYDI — maydon shartli ravishda service ichida qo'shiladi/olib tashlanadi; (2) agar ruxsat bo'lsa — `expenses` jadvalidan `WHERE branchId = branchId AND date = dateStr` bo'yicha `SUM(amount)` (bitta qo'shimcha so'rov, bir xil RLS-bound `db`); (3) `netCashFlow = netRevenue - expensesTotal`, bunda `netRevenue` — `DailySummaryCard.tsx`dagi frontend hisobi bilan AYNAN bir xil formula (`Σ payment.total − Σ refund.total`, `void` HISOBGA OLINMAYDI — reports moduli `signedPaidAmount`sidan farqli, u yerda void musbat hisoblanadi; bu yerda frontend kartaga mos bo'lish ustunroq).

**Muhim topilma (spec vs kod):** Spec (`docs/superpowers/specs/2026-07-07-money-audit-fixes-design.md`, G5) `c.get('permissions')` deb yozgan — bunday getter mavjud EMAS. Haqiqiy naqsh — `c.get('accessClaims')?.perms` (massiv, `@owner` sentinel bilan), `patients.service.ts:55-58`dagi `userHasPiiAccess` — bu reja o'sha haqiqiy naqshni ishlatadi.

**Scope tashqarisida (bu reja uchun):** Spec matni (`Fayllar` qatori) `apps/api/src/modules/reports/reports.service.ts`ni ham tilga oladi ("tegishli reports revenue endpointi"). Bu reja **faqat `cashier.service.ts::dailySummary`ga tegadi** — `reports.service.ts::revenue` `from`/`to` DIAPAZON qabul qiladi (bitta kun emas, alohida so'rov shakli) va bu ish-guruh uchun berilgan aniq talab ro'yxatida (4 band) reports moduli YO'Q. Agar revenue-hisobotga ham xarajat qo'shish kerak bo'lsa — alohida keyingi topshiriq (reja tuzuvchiga xabar berilgan).

**Tech Stack:** Bun, Hono, Drizzle ORM, PostgreSQL, `@hono/zod-openapi`, orval (api-client generator), React/Mantine, `bun test` (real-DB integration test).

## Global Constraints

- Hech qanday `WHERE tenant_id` yozilmaydi — RLS (`getDb(c)`) filtrlaydi (CLAUDE.md §3.4).
- Pul summalari — `numeric(14,2)` DB ustunlari; javobda `expensesTotal`/`netCashFlow` — `z.number()` (reports moduli `total: z.number()` konvensiyasiga mos, `breakdown[].total` esa xom SQL string sifatida qoladi — o'zgarmaydi).
- Yangi route middleware QO'SHILMAYDI — mavjud `requirePermission('cashier.view')` yetarli qoladi; gate maydon-darajasida, service ichida.
- Integration test real DB (`bun test --env-file=../../.env`), `noopAudit`.
- Schema o'zgarishi (`dailySummaryDtoSchema`) OpenAPI spec + `packages/api-client` regeneratsiyasini talab qiladi (`bun run generate:contract`) — alohida Task, generated fayllar commit qilinadi.

---

### Task 1: `cashier.service.ts::dailySummary` — expense.view-gated `expensesTotal`/`netCashFlow`

**Files:**
- Modify: `apps/api/src/modules/cashier/cashier.schema.ts:144-159` (`dailySummaryDtoSchema`)
- Modify: `apps/api/src/modules/cashier/cashier.service.ts:1-9` (import), `:59-66` (yangi helper `PriceLookup` tipidan keyin, `createCashierService`dan OLDIN), `:431-466` (`dailySummary`)
- Test: yangi `apps/api/tests/integration/cli-452-expense-gated-summary.test.ts`

**Interfaces:**
- Produces: `dailySummary()` qaytar tipi endi `{ date, branchId, breakdown } | { date, branchId, breakdown, expensesTotal: number, netCashFlow: number }` (permission-shartli) — Task 2 (api-client regen) va Task 3 (frontend) shuni iste'mol qiladi.

- [ ] **Step 1: Write the failing integration test**

`apps/api/tests/integration/cli-452-expense-gated-summary.test.ts`:

```ts
/**
 * CLI-452 — kunlik xulosa (`dailySummary`) `expensesTotal`/`netCashFlow`ni FAQAT
 * so'rovchida `expense.view` (yoki `@owner`) bo'lsa qaytaradi. Real DB — haqiqiy
 * `cashier_transactions` + `expenses` fixture, `accessClaims.perms` parametrik.
 *
 * Ishga tushirish:
 *   cd apps/api && bun test tests/integration/cli-452-expense-gated-summary.test.ts --env-file=../../.env
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { branches, expenses, tenants, users } from '@dental/db-schema';
import { sql } from 'drizzle-orm';
import type { Context } from 'hono';
import type { DbOrTx } from '../../src/db/client.ts';
import { db } from '../../src/db/client.ts';
import type { AuditLogger } from '../../src/lib/audit-logger.ts';
import { createCashierService } from '../../src/modules/cashier/cashier.service.ts';

const noopAudit = { record: async () => {} } as unknown as AuditLogger;

// CLI-440 #2 naqshi bilan bir xil — Tashkent kalendar kuni (UTC EMAS).
const todayISO = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tashkent' }).format(new Date());

let tenantId: string;
let ownerId: string;
let branchId: string;
const dateStr = todayISO();

const ctx = (tx: DbOrTx, perms: string[]): Context =>
  ({
    get: (k: string) =>
      k === 'db'
        ? tx
        : k === 'accessClaims'
          ? { perms }
          : k === 'activeTenantId'
            ? tenantId
            : k === 'user'
              ? { id: ownerId }
              : undefined,
  }) as unknown as Context;

beforeAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);

  const [owner] = await db
    .insert(users)
    .values({ phone: '+998900000452', passwordHash: 'fake', fullName: 'Owner' })
    .returning({ id: users.id });
  if (!owner) throw new Error('owner insert failed');
  ownerId = owner.id;

  const [tenant] = await db
    .insert(tenants)
    .values({ name: 'CLI452 Clinic', slug: 'cli452-clinic', ownerUserId: ownerId })
    .returning({ id: tenants.id });
  if (!tenant) throw new Error('tenant insert failed');
  tenantId = tenant.id;

  await db.transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
    const [branch] = await tx
      .insert(branches)
      .values({ tenantId, name: 'Branch 1' })
      .returning({ id: branches.id });
    if (!branch) throw new Error('branch insert failed');
    branchId = branch.id;

    // Xarajat — shu filial + shu kun (branchId=null tenant-darajali xarajatlar
    // QASDDAN hisobga OLINMAYDI, "shu filial uchun" literal talqin — CLI-452
    // Architecture izohi).
    await tx.insert(expenses).values({
      tenantId,
      branchId,
      amount: '30000',
      date: dateStr,
      note: 'CLI-452 fixture',
    });
  });
});

afterAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
});

const stubPriceLookup = { getActivePrice: async () => ({ price: '100000' }) };

describe('CLI-452: dailySummary expense.view-gated fields', () => {
  test("expense.view BOR foydalanuvchi — expensesTotal/netCashFlow ko'rinadi", async () => {
    const cashier = createCashierService({ audit: noopAudit, priceLookup: stubPriceLookup });

    await db.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
      const cWrite = ctx(tx, ['cashier.view', 'cashier.create_transaction', 'expense.view']);

      await cashier.create(cWrite, {
        branchId,
        items: [{ serviceId: crypto.randomUUID(), quantity: 1, unitPrice: 100000, serviceName: 'X' }],
        discount: 0,
        paidAmount: 100000,
        paymentMethod: 'cash',
      } as never);

      const result = await cashier.dailySummary(
        ctx(tx, ['cashier.view', 'expense.view']),
        branchId,
        dateStr,
      );

      expect(result.expensesTotal).toBe(30000);
      // netRevenue = 100000 (payment) - 0 (refund) = 100000; netCashFlow = 100000 - 30000
      expect(result.netCashFlow).toBe(70000);
    });
  });

  test("expense.view YO'Q foydalanuvchi — expensesTotal/netCashFlow javobda YO'Q", async () => {
    const cashier = createCashierService({ audit: noopAudit, priceLookup: stubPriceLookup });

    await db.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));

      const result = await cashier.dailySummary(ctx(tx, ['cashier.view']), branchId, dateStr);

      expect(result.expensesTotal).toBeUndefined();
      expect(result.netCashFlow).toBeUndefined();
      expect(Object.hasOwn(result, 'expensesTotal')).toBe(false);
      expect(Object.hasOwn(result, 'netCashFlow')).toBe(false);
      // Asosiy breakdown baribir ko'rinadi (`cashier.view` orqali — bu maydonlar gate qilinmagan).
      expect(result.breakdown.length).toBeGreaterThan(0);
    });
  });

  test("@owner sentinel — expense.view yo'q bo'lsada ko'rinadi", async () => {
    const cashier = createCashierService({ audit: noopAudit, priceLookup: stubPriceLookup });

    await db.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));

      const result = await cashier.dailySummary(ctx(tx, ['@owner']), branchId, dateStr);

      expect(result.expensesTotal).toBe(30000);
      expect(result.netCashFlow).toBe(70000);
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && bun test tests/integration/cli-452-expense-gated-summary.test.ts --env-file=../../.env`
Expected: FAIL — `result.expensesTotal` `undefined` (funksiya hali xarajatni hisoblamaydi, maydon umuman yo'q) birinchi va uchinchi testda.

- [ ] **Step 3: Write minimal implementation**

`apps/api/src/modules/cashier/cashier.schema.ts:144-159` — eski:

```ts
/** Kunlik summary — kassa yopilishi uchun (breakdown.total = numeric → string). */
export const dailySummaryDtoSchema = z
  .object({
    date: z.string(),
    branchId: z.uuid(),
    breakdown: z.array(
      z.object({
        paymentMethod: paymentMethodSchema,
        type: transactionTypeSchema,
        total: z.string(),
        count: z.number().int(),
      }),
    ),
  })
  .openapi('DailySummary');
export type DailySummaryDto = z.infer<typeof dailySummaryDtoSchema>;
```

yangi:

```ts
/**
 * Kunlik summary — kassa yopilishi uchun (breakdown.total = numeric → string).
 * `expensesTotal`/`netCashFlow` — CLI-452: FAQAT so'rovchida `expense.view`
 * (yoki `@owner`) bo'lsa javobga qo'shiladi (`cashier.service.ts::userHasExpenseAccess`).
 * Ruxsat bo'lmasa — bu ikki maydon javobda UMUMAN YO'Q (frontend shartli ko'rsatadi).
 */
export const dailySummaryDtoSchema = z
  .object({
    date: z.string(),
    branchId: z.uuid(),
    breakdown: z.array(
      z.object({
        paymentMethod: paymentMethodSchema,
        type: transactionTypeSchema,
        total: z.string(),
        count: z.number().int(),
      }),
    ),
    expensesTotal: z.number().optional(),
    netCashFlow: z.number().optional(),
  })
  .openapi('DailySummary');
export type DailySummaryDto = z.infer<typeof dailySummaryDtoSchema>;
```

`apps/api/src/modules/cashier/cashier.service.ts:1-9` — eski import bloki:

```ts
import { randomBytes } from 'node:crypto';
import {
  cashierTransactionItems,
  cashierTransactions,
  treatmentPlans,
  treatmentStagePayments,
  treatmentStages,
} from '@dental/db-schema';
```

yangi:

```ts
import { randomBytes } from 'node:crypto';
import {
  cashierTransactionItems,
  cashierTransactions,
  expenses,
  treatmentPlans,
  treatmentStagePayments,
  treatmentStages,
} from '@dental/db-schema';
```

`apps/api/src/modules/cashier/cashier.service.ts:59-66` (`PriceLookup` tipidan keyin, `export const createCashierService`dan OLDIN) — qo'shing:

```ts
/**
 * CLI-452: `dailySummary` xarajat maydonlarini (`expensesTotal`/`netCashFlow`)
 * FAQAT shu ruxsat bo'lsa qaytaradi. `patients.service.ts::userHasPiiAccess`
 * bilan BIR XIL naqsh — yangi route middleware YO'Q, maydon-darajasidagi gate.
 */
const userHasExpenseAccess = (c: Context): boolean => {
  const perms = c.get('accessClaims')?.perms ?? [];
  return perms.includes('@owner') || perms.includes('expense.view');
};
```

`apps/api/src/modules/cashier/cashier.service.ts:431-466` (`dailySummary` funksiyasi) — eski:

```ts
  /** Daily summary for cashier close */
  async function dailySummary(c: Context, branchId: string, dateStr: string) {
    const db = getDb(c);
    // Asia/Tashkent (UTC+5, DST yo'q) kun chegarasi — appointments bilan izchil (f73a785).
    const start = new Date(`${dateStr}T00:00:00+05:00`);
    const end = new Date(`${dateStr}T23:59:59.999+05:00`);

    const rows = await db
      .select({
        paymentMethod: cashierTransactions.paymentMethod,
        type: cashierTransactions.type,
        // CLI-419: olingan pul = paidAmount (totalAmount = hisob-faktura; sale kam
        // to'langan bo'lishi mumkin → kassa qoldig'i totalAmount emas). `type` bo'yicha
        // guruhlanadi — frontend refundni kassa-chiqim sifatida netlaydi.
        total: sql<string>`SUM(${cashierTransactions.paidAmount})`,
        count: count(),
      })
      .from(cashierTransactions)
      .where(
        and(
          eq(cashierTransactions.branchId, branchId),
          between(cashierTransactions.createdAt, start, end),
          eq(cashierTransactions.status, 'completed'),
        ),
      )
      .groupBy(cashierTransactions.paymentMethod, cashierTransactions.type);

    await deps.audit.record(c, {
      action: 'viewed',
      resourceType: 'cashier_transaction',
      resourceId: branchId,
      after: { date: dateStr, count: rows.length },
    });

    return { date: dateStr, branchId, breakdown: rows };
  }
```

yangi:

```ts
  /** Daily summary for cashier close */
  async function dailySummary(c: Context, branchId: string, dateStr: string) {
    const db = getDb(c);
    // Asia/Tashkent (UTC+5, DST yo'q) kun chegarasi — appointments bilan izchil (f73a785).
    const start = new Date(`${dateStr}T00:00:00+05:00`);
    const end = new Date(`${dateStr}T23:59:59.999+05:00`);

    const rows = await db
      .select({
        paymentMethod: cashierTransactions.paymentMethod,
        type: cashierTransactions.type,
        // CLI-419: olingan pul = paidAmount (totalAmount = hisob-faktura; sale kam
        // to'langan bo'lishi mumkin → kassa qoldig'i totalAmount emas). `type` bo'yicha
        // guruhlanadi — frontend refundni kassa-chiqim sifatida netlaydi.
        total: sql<string>`SUM(${cashierTransactions.paidAmount})`,
        count: count(),
      })
      .from(cashierTransactions)
      .where(
        and(
          eq(cashierTransactions.branchId, branchId),
          between(cashierTransactions.createdAt, start, end),
          eq(cashierTransactions.status, 'completed'),
        ),
      )
      .groupBy(cashierTransactions.paymentMethod, cashierTransactions.type);

    await deps.audit.record(c, {
      action: 'viewed',
      resourceType: 'cashier_transaction',
      resourceId: branchId,
      after: { date: dateStr, count: rows.length },
    });

    const base = { date: dateStr, branchId, breakdown: rows };

    // CLI-452: expensesTotal/netCashFlow FAQAT `expense.view` (yoki `@owner`)
    // bo'lsa qo'shiladi — routes'da yangi middleware YO'Q, maydon-darajasidagi gate.
    if (!userHasExpenseAccess(c)) return base;

    // `expenses.date` — naive `date` ustuni (calendar kun, instant emas) —
    // expenses.service.ts bilan bir xil to'g'ridan-to'g'ri string taqqoslash
    // (Tashkent T00:00 arifmetikasi kerak emas). branchId=null (tenant-darajali,
    // masalan ijara) xarajatlar QASDDAN hisobga OLINMAYDI — "shu filial uchun"
    // literal talqin (Architecture izohi, kelajakda kengaytirilishi mumkin).
    const [expenseRow] = await db
      .select({ total: sql<string>`COALESCE(SUM(${expenses.amount}), 0)` })
      .from(expenses)
      .where(and(eq(expenses.branchId, branchId), eq(expenses.date, dateStr)));
    const expensesTotal = Number(expenseRow?.total ?? 0);

    // Sof tushum — `DailySummaryCard.tsx`dagi `totalPayment - totalRefund` bilan
    // AYNAN bir xil formula (`void` HISOBGA OLINMAYDI — reports moduli
    // `signedPaidAmount`sidan farqli, bu yerda frontend kartaga mos bo'lish kerak).
    const netRevenue = rows.reduce((sum, r) => {
      const amount = Number(r.total);
      if (r.type === 'payment') return sum + amount;
      if (r.type === 'refund') return sum - amount;
      return sum;
    }, 0);

    return { ...base, expensesTotal, netCashFlow: netRevenue - expensesTotal };
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/api && bun test tests/integration/cli-452-expense-gated-summary.test.ts --env-file=../../.env`
Expected: PASS — barcha 3 test yashil.

- [ ] **Step 5: Regression — mavjud cashier testlari**

Run: `cd apps/api && bun test apps/api/src/modules/cashier/ --env-file=../../.env`
Expected: PASS (mavjud cashier unit/schema testlar `dailySummary`ga tegmaydi — o'zgarishsiz yashil).

- [ ] **Step 6: Typecheck**

Run: `cd apps/api && bun run typecheck`
Expected: 0 xato.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/modules/cashier/cashier.schema.ts apps/api/src/modules/cashier/cashier.service.ts apps/api/tests/integration/cli-452-expense-gated-summary.test.ts
git commit -m "feat(api): CLI-452 — dailySummary expense.view-gated expensesTotal/netCashFlow"
```

---

### Task 2: OpenAPI spec + `packages/api-client` regeneratsiya

**Files:**
- Generated (bevosita tahrirlanmaydi): `packages/api-client/openapi.json`, `packages/api-client/src/generated/model/dailySummary.ts`, va shu bilan bog'liq boshqa avtomatik yaratiladigan fayllar (agar orval boshqa fayllarni ham qayta yozsa — diff `git status` bilan tekshiriladi).

**Interfaces:**
- Consumes: Task 1'dagi yangilangan `dailySummaryDtoSchema` (`expensesTotal?`, `netCashFlow?`).
- Produces: `DailySummary` TypeScript interfeysi (`packages/api-client`) — Task 3 shuni frontend'da ishlatadi.

- [ ] **Step 1: Regeneratsiyadan OLDIN — joriy generated fayl holatini tasdiqlash**

Run: `cat packages/api-client/src/generated/model/dailySummary.ts`
Expected (joriy, o'zgarishdan oldin):
```ts
export interface DailySummary {
  date: string;
  branchId: string;
  breakdown: DailySummaryBreakdownItem[];
}
```

- [ ] **Step 2: Regeneratsiya**

Run: `cd /home/madrimov/Projects/dental-service && bun run generate:contract`
Expected: 0 xato (skript `generate:openapi` — apps/api Zod schemadan `packages/api-client/openapi.json` yozadi — so'ng `generate:api-client` — orval shu spec'dan TypeScript client qayta yaratadi).

- [ ] **Step 3: Diff'ni tasdiqlash**

Run: `git diff --stat packages/api-client/`
Expected: `packages/api-client/openapi.json` (DailySummary schema'siga `expensesTotal`/`netCashFlow` optional propertylar qo'shilgan) + `packages/api-client/src/generated/model/dailySummary.ts` o'zgargan:

```ts
export interface DailySummary {
  date: string;
  branchId: string;
  breakdown: DailySummaryBreakdownItem[];
  expensesTotal?: number;
  netCashFlow?: number;
}
```

Boshqa generated fayllarda (masalan `cashier.ts` endpoint funksiyalari) kutilmagan o'zgarish BO'LMASLIGI kerak — bo'lsa, `git diff` bilan sabab tekshiriladi (masalan orval versiyasi eskirgan bo'lishi mumkin, unda `bun install` bilan `orval` versiyasi solishtiriladi).

- [ ] **Step 4: Typecheck (web + api-client)**

Run: `cd apps/web && bun run typecheck`
Expected: 0 xato (mavjud `DailySummaryCard.tsx` hali eski maydonlarni ishlatadi — yangi optional maydonlar qo'shilishi mavjud kodni buzmaydi, Task 3'da ishlatiladi).

- [ ] **Step 5: Commit**

```bash
git add packages/api-client/
git commit -m "chore(api-client): CLI-452 — regenerate contract (DailySummary.expensesTotal/netCashFlow)"
```

---

### Task 3: Frontend `DailySummaryCard.tsx` — "Xarajat" / "Sof oqim" qatorlari

**Files:**
- Modify: `apps/web/src/features/cashier/components/DailySummaryCard.tsx`
- Modify: `packages/i18n/src/locales/uz.json`, `packages/i18n/src/locales/ru.json` (yangi `cashier.expenses_total`, `cashier.net_cash_flow` kalitlari)

**Interfaces:**
- Consumes: `DailySummary.expensesTotal?: number`, `DailySummary.netCashFlow?: number` (Task 2, `@dental/api-client`).

- [ ] **Step 1: i18n kalitlar qo'shish**

`packages/i18n/src/locales/uz.json` — `"cashier"` blokida `"total_revenue": "Jami tushum",` qatoridan keyin qo'shing:

```json
    "total_revenue": "Jami tushum",
    "expenses_total": "Xarajat",
    "net_cash_flow": "Sof oqim",
```

`packages/i18n/src/locales/ru.json` — `"cashier"` blokida `"total_revenue": "Общая выручка",` qatoridan keyin qo'shing:

```json
    "total_revenue": "Общая выручка",
    "expenses_total": "Расход",
    "net_cash_flow": "Чистый поток",
```

- [ ] **Step 2: `DailySummaryCard.tsx` — shartli "Xarajat"/"Sof oqim" qatorlari**

`apps/web/src/features/cashier/components/DailySummaryCard.tsx` — eski (jami tushum blokidan keyin, `<Group gap="sm" grow ...>` dan OLDIN, ya'ni fayl :64-77 oralig'i o'zgarmaydi, faqat undan keyin — `<Group>`dan keyin, refund blokidan OLDIN — yangi shartli blok qo'shiladi):

Eski (`:79-118`):

```tsx
            <Group gap="sm" grow align="stretch">
              <StatBox
                label={t('cashier.method.cash')}
                share={cashShare}
                amount={formatCurrency(cashNet, t)}
              />
              <StatBox
                label={t('cashier.method.card')}
                share={cardShare}
                amount={formatCurrency(cardNet, t)}
              />
            </Group>

            {totalRefund > 0 && (
              <Box
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  background: 'var(--danger-bg)',
                  borderRadius: 10,
                  padding: '8px 12px',
                }}
              >
                <Group gap={6} wrap="nowrap">
                  <IconCornerDownLeft size={14} style={{ color: 'var(--danger)' }} />
                  <Text style={{ fontSize: 12, color: 'var(--ink-2)' }}>{cashOutLabel}</Text>
                </Group>
                <Text
                  fw={600}
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 14,
                    color: 'var(--danger)',
                  }}
                >
                  −{formatCurrency(totalRefund, t)}
                </Text>
              </Box>
            )}
          </Stack>
        )}
      </Stack>
    </Paper>
  );
}
```

yangi:

```tsx
            <Group gap="sm" grow align="stretch">
              <StatBox
                label={t('cashier.method.cash')}
                share={cashShare}
                amount={formatCurrency(cashNet, t)}
              />
              <StatBox
                label={t('cashier.method.card')}
                share={cardShare}
                amount={formatCurrency(cardNet, t)}
              />
            </Group>

            {totalRefund > 0 && (
              <Box
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  background: 'var(--danger-bg)',
                  borderRadius: 10,
                  padding: '8px 12px',
                }}
              >
                <Group gap={6} wrap="nowrap">
                  <IconCornerDownLeft size={14} style={{ color: 'var(--danger)' }} />
                  <Text style={{ fontSize: 12, color: 'var(--ink-2)' }}>{cashOutLabel}</Text>
                </Group>
                <Text
                  fw={600}
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 14,
                    color: 'var(--danger)',
                  }}
                >
                  −{formatCurrency(totalRefund, t)}
                </Text>
              </Box>
            )}

            {/* CLI-452: backend `expense.view` bo'lmasa bu maydonlarni umuman
                qaytarmaydi — shunda qator ko'rsatilmaydi (403/xato YO'Q, jim
                yashirin). `summary.expensesTotal !== undefined` — 0 qiymatni
                ham to'g'ri ko'rsatish uchun (falsy 0 emas, presence tekshiruvi). */}
            {summary.expensesTotal !== undefined && (
              <Box
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  background: 'var(--surface-2)',
                  borderRadius: 10,
                  padding: '8px 12px',
                }}
              >
                <Text style={{ fontSize: 12, color: 'var(--ink-2)' }}>
                  {t('cashier.expenses_total')}
                </Text>
                <Text fw={600} style={{ fontFamily: 'var(--font-mono)', fontSize: 14 }}>
                  −{formatCurrency(summary.expensesTotal, t)}
                </Text>
              </Box>
            )}

            {summary.netCashFlow !== undefined && (
              <Box
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  borderRadius: 10,
                  padding: '8px 12px',
                }}
              >
                <Text style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink-2)' }}>
                  {t('cashier.net_cash_flow')}
                </Text>
                <Text
                  fw={700}
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 16,
                    color: summary.netCashFlow < 0 ? 'var(--danger)' : 'var(--primary)',
                  }}
                >
                  {formatCurrency(summary.netCashFlow, t)}
                </Text>
              </Box>
            )}
          </Stack>
        )}
      </Stack>
    </Paper>
  );
}
```

- [ ] **Step 3: Verify (manual — vizual regressiyasiz komponent kompilyatsiyasi)**

Run: `cd apps/web && bun run typecheck`
Expected: 0 xato (`summary.expensesTotal`/`summary.netCashFlow` — Task 2'dan keyin `DailySummary` tipida mavjud optional maydonlar).

Run: `cd apps/web && bunx vitest run src/features/cashier/ 2>/dev/null || echo "no unit tests for this component — visual-only, manual QA orqali tekshiriladi"`
Expected: mavjud cashier feature testlari (agar bo'lsa) regressiyasiz yashil; `DailySummaryCard.tsx`ning o'zi hozircha unit-test qilinmagan (sof render komponent) — bu qadam faqat regressiya check.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/features/cashier/components/DailySummaryCard.tsx packages/i18n/src/locales/uz.json packages/i18n/src/locales/ru.json
git commit -m "feat(web): CLI-452 — DailySummaryCard xarajat/sof-oqim qatorlari (expense.view-gated)"
```

---

## Yakuniy DoD

- [ ] `cashier.service.ts::dailySummary` — `expense.view` (yoki `@owner`) bo'lganda `expensesTotal`/`netCashFlow` qaytaradi, bo'lmaganda maydonlar UMUMAN YO'Q (Task 1).
- [ ] 3 integration test yashil (`expense.view` bor / yo'q / `@owner`).
- [ ] `packages/api-client` regenerate qilingan va commit qilingan (Task 2).
- [ ] `DailySummaryCard.tsx` — yangi qatorlar faqat maydon mavjud bo'lsa ko'rinadi, i18n kalitlar uz/ru (Task 3).
- [ ] Mavjud cashier testlari (unit + integration) regressiyasiz yashil.
- [ ] Typecheck toza (`apps/api` + `apps/web`).
- [ ] Linear CLI-452 — "Done"ga o'tkaziladi (implementatsiya + verify-agentdan keyin).

## Ma'lum cheklovlar / kelajakdagi ish (won't-fix bu reja doirasida)

- `reports.service.ts::revenue` (davr+filial hisoboti) xarajat integratsiyasi qamrab olinmagan — spec matni tilga oladi, lekin bergan aniq talab ro'yxati faqat `dailySummary`ni so'raydi. Agar kerak bo'lsa — alohida keyingi topshiriq (revenue `from`/`to` diapazon oladi, `dailySummary` bitta kun — filtr shakli farq qiladi, `expenses.service.ts::summary` bilan bir xil `between(expenses.date, from, to)` naqshi ishlatiladi).
- `expenses.branchId IS NULL` (tenant-darajali, filial-bog'liq bo'lmagan xarajat, masalan umumiy ijara) — joriy filtr bunday qatorlarni HECH BIR filialning `dailySummary`siga qo'shmaydi (faqat aniq `branchId` mos qatorlar). Agar kelajakda "tenant-darajali xarajat har filialga proporsional taqsimlanishi" kerak bo'lsa — alohida qaror + ticket kerak.
