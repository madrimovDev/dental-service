# G1 — Bemor balans formulasi: non-plan refund + overpay (CLI-448, CLI-451) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Non-plan (erkin POS) bemor qarzi formulasiga refund'ni to'g'ri qo'shish (to'liq refund = bekor qilingan savdo, hissasi 0) va overpay'ni server tomonidan kredit sifatida ruxsat berish (qo'shimcha guard qo'shilmaydi, faqat tasdiqlash).

**Architecture:** `patients.service.ts`dagi ikkita balans-hisoblovchi funksiya (`list`, `balanceFor`) hozir `SUM(totalAmount-paidAmount) WHERE type='payment'` ishlatadi — refund qatorlari butunlay chiqarib tashlanadi. Yangi yondashuv: (1) non-plan `type='payment'` qatorlarni xom holda o'qish (id, totalAmount, paidAmount), (2) shu qatorlarning `parentTransactionId`siga ishora qiluvchi `type='refund'` qatorlarning yig'indisini alohida so'rov bilan olish, (3) sof `computeNonPlanRemainder` funksiyasi orqali har qator uchun: to'liq refund qilingan bo'lsa (`refundedSum >= paidAmount`) hissasi 0, aks holda `totalAmount - (paidAmount - refundedSum)`. Bu CLI-430'dagi `netServiceAggregates` bilan bir xil `parentTransactionId`-orqali-bog'lash g'oyasi, lekin raw-SQL CTE o'rniga oddiy Drizzle query builder + JS reduce (Date-interpolatsiya xatosi sinfidan butunlay qochish uchun, CLI-430/441 darsi).

**Tech Stack:** Bun, Hono, Drizzle ORM, PostgreSQL, Vitest (pure-function unit test), `bun test` (real-DB integration test).

## Global Constraints

- Hech qanday `WHERE tenant_id` yozilmaydi — RLS (`getDb(c)`) filtrlaydi (CLAUDE.md §3.4).
- Pul summalari — `numeric(14,2)` DB ustunlari, JS'da `Number()` bilan o'qiladi (loyihada butun so'm invariant, CLI-117 qarori).
- Sof funksiyalar (`patients.balance.ts`) Context/Drizzle'ni bilmaydi — faqat raqamlar bilan ishlaydi.
- Integration testlar real DB (`bun test --env-file=../../.env`), mock/spy audit YO'Q — `noopAudit` ishlatiladi.
- Frontend `BalanceChip.tsx`/`BalanceBadge.tsx` allaqachon manfiy balansni "kredit" deb to'g'ri ko'rsatadi (tasdiqlangan, `apps/web/src/features/patients/components/BalanceChip.tsx:24-33`, `apps/web/src/components/BalanceBadge.tsx:17-24`) — **frontend o'zgarmaydi**, faqat backend.

---

### Task 1: `computeNonPlanRemainder` sof funksiyasi

**Files:**
- Modify: `apps/api/src/modules/patients/patients.balance.ts`
- Test: `apps/api/src/modules/patients/patients.balance.test.ts`

**Interfaces:**
- Produces: `computeNonPlanRemainder(rows: NonPlanTransactionRow[]): number` va eksport qilingan `NonPlanTransactionRow` tipi — Task 2 shularni import qiladi.

- [ ] **Step 1: Write the failing tests**

`apps/api/src/modules/patients/patients.balance.test.ts` faylining oxiriga (mavjud `describe('computePatientBalance', ...)` blokidan keyin, faylning eng oxiriga) qo'shing:

```ts
import { computeNonPlanRemainder } from './patients.balance.ts';

describe('computeNonPlanRemainder', () => {
  it("bo'sh massiv — 0", () => {
    expect(computeNonPlanRemainder([])).toBe(0);
  });

  it("to'liq to'langan, refundsiz — hissasi 0", () => {
    const result = computeNonPlanRemainder([
      { totalAmount: 100000, paidAmount: 100000, refundedSum: 0 },
    ]);
    expect(result).toBe(0);
  });

  it("qisman to'langan, refundsiz — hissasi qarz", () => {
    const result = computeNonPlanRemainder([
      { totalAmount: 100000, paidAmount: 60000, refundedSum: 0 },
    ]);
    expect(result).toBe(40000);
  });

  it("qisman to'langan (60/100), TO'LIQ refund qilingan (60) — hissasi 0 (CLI-448 fix)", () => {
    const result = computeNonPlanRemainder([
      { totalAmount: 100000, paidAmount: 60000, refundedSum: 60000 },
    ]);
    expect(result).toBe(0);
  });

  it("to'liq to'langan (100/100), TO'LIQ refund qilingan (100) — hissasi 0", () => {
    const result = computeNonPlanRemainder([
      { totalAmount: 100000, paidAmount: 100000, refundedSum: 100000 },
    ]);
    expect(result).toBe(0);
  });

  it('overpay (paidAmount > totalAmount), refundsiz — manfiy (kredit, CLI-451)', () => {
    const result = computeNonPlanRemainder([
      { totalAmount: 100000, paidAmount: 120000, refundedSum: 0 },
    ]);
    expect(result).toBe(-20000);
  });

  it('bir necha qator — yig\'indi to\'g\'ri', () => {
    const result = computeNonPlanRemainder([
      { totalAmount: 100000, paidAmount: 60000, refundedSum: 0 }, // 40000 qarz
      { totalAmount: 50000, paidAmount: 50000, refundedSum: 50000 }, // 0 (bekor)
      { totalAmount: 30000, paidAmount: 35000, refundedSum: 0 }, // -5000 kredit
    ]);
    expect(result).toBe(35000); // 40000 + 0 - 5000
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/api && bunx vitest run src/modules/patients/patients.balance.test.ts`
Expected: FAIL — `computeNonPlanRemainder is not a function` yoki import xatosi (funksiya hali yo'q).

- [ ] **Step 3: Write minimal implementation**

`apps/api/src/modules/patients/patients.balance.ts` fayliga (mavjud `computePatientBalance`dan keyin) qo'shing:

```ts
/**
 * Non-plan (erkin POS) tranzaksiya qatori — bemor balansi hisobi uchun xom kirish.
 * `refundedSum` — shu qatorga (`parentTransactionId`) ishora qiluvchi barcha
 * `type='refund'` qatorlarning `paidAmount` yig'indisi.
 */
export type NonPlanTransactionRow = {
  totalAmount: number;
  paidAmount: number;
  refundedSum: number;
};

/**
 * Non-plan qoldiq — CLI-448: to'liq refund qilingan qator (refundedSum >= paidAmount)
 * savdo bekor qilingan hisoblanadi, hissasi 0 (avval: refund butunlay chiqarib
 * tashlanardi, qarz o'zgarmasdan qolardi). Non-plan uchun qisman refund server
 * darajasida taqiqlangan (`cashier.service.ts` `non_plan_partial` guard) — shuning
 * uchun amalda `refundedSum` har doim 0 yoki aynan `paidAmount`ga teng, lekin
 * formula umumiy holatda ham to'g'ri ishlaydi (himoya sifatida).
 * CLI-451: overpay (paidAmount > totalAmount) uchun qo'shimcha guard yo'q — natija
 * tabiiy ravishda manfiy (kredit) bo'ladi.
 */
export function computeNonPlanRemainder(rows: NonPlanTransactionRow[]): number {
  return rows.reduce((sum, row) => {
    if (row.refundedSum >= row.paidAmount) return sum;
    return sum + (row.totalAmount - (row.paidAmount - row.refundedSum));
  }, 0);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/api && bunx vitest run src/modules/patients/patients.balance.test.ts`
Expected: PASS (barcha `computePatientBalance` + yangi `computeNonPlanRemainder` testlar yashil).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/patients/patients.balance.ts apps/api/src/modules/patients/patients.balance.test.ts
git commit -m "feat(api): CLI-448/451 — computeNonPlanRemainder sof funksiyasi (to'liq refund=bekor, overpay=kredit)"
```

---

### Task 2: `patients.service.ts::list` va `balanceFor` — yangi formula ulash

**Files:**
- Modify: `apps/api/src/modules/patients/patients.service.ts:96-166` (`list` ichidagi balans blok), `:176-223` (`balanceFor`)
- Test: yangi `apps/api/tests/integration/cli-448-nonplan-refund-balance.test.ts`

**Interfaces:**
- Consumes: `computeNonPlanRemainder(rows: NonPlanTransactionRow[]): number` (Task 1).
- Produces: `list()` va `balanceFor()` xulqi o'zgaradi (signature o'zgarmaydi) — Task 3 yo'q, bu guruh mustaqil yakunlanadi.

- [ ] **Step 1: Write the failing integration test**

`apps/api/tests/integration/cli-448-nonplan-refund-balance.test.ts`:

```ts
/**
 * CLI-448/451 — non-plan (erkin POS) bemor balansi: to'liq refund = bekor qilingan
 * savdo (hissasi 0), overpay = kredit (manfiy balans). Real DB, cashier.refund()
 * orqali (parentTransactionId ulanishi haqiqiy bo'lishi uchun).
 *
 * Ishga tushirish (yolg'iz — TRUNCATE poygasi):
 *   cd apps/api && bun test tests/integration/cli-448-nonplan-refund-balance.test.ts --env-file=../../.env
 */

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { branches, patients, tenants, users } from '@dental/db-schema';
import { sql } from 'drizzle-orm';
import type { Context } from 'hono';
import type { DbOrTx } from '../../src/db/client.ts';
import { db } from '../../src/db/client.ts';
import type { AuditLogger } from '../../src/lib/audit-logger.ts';
import { createCashierService } from '../../src/modules/cashier/cashier.service.ts';
import { createPatientsService } from '../../src/modules/patients/patients.service.ts';

const noopAudit = { record: async () => {} } as unknown as AuditLogger;
const cashier = createCashierService({ audit: noopAudit });
const patientsSvc = createPatientsService({ audit: noopAudit });

const ctx = (tx: DbOrTx, userId: string): Context =>
  ({
    get: (k: string) =>
      k === 'db'
        ? tx
        : k === 'accessClaims'
          ? { perms: ['@owner'] }
          : k === 'activeTenantId'
            ? tenantId
            : k === 'user'
              ? { id: userId }
              : undefined,
  }) as unknown as Context;

let tenantId: string;
let ownerId: string;
let branchId: string;

beforeAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);

  const [owner] = await db
    .insert(users)
    .values({ phone: '+998900000048', passwordHash: 'fake', fullName: 'Owner' })
    .returning({ id: users.id });
  if (!owner) throw new Error('owner insert failed');
  ownerId = owner.id;

  const [tenant] = await db
    .insert(tenants)
    .values({ name: 'CLI448 Clinic', slug: 'cli448-clinic', ownerUserId: ownerId })
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
  });
});

afterAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
});

let patientId: string;

beforeEach(async () => {
  await db.transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
    const [patient] = await tx
      .insert(patients)
      .values({ tenantId, fullName: 'Test Bemor' })
      .returning({ id: patients.id });
    if (!patient) throw new Error('patient insert failed');
    patientId = patient.id;
  });
});

describe('CLI-448: to\'liq refund qilingan non-plan savdo — qarz 0 (bekor qilingan)', () => {
  test("qisman to'langan (60000/100000) savdo TO'LIQ refund qilinsa — balans 0, avval 40000 edi", async () => {
    await db.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
      const c = ctx(tx, ownerId);

      const created = await cashier.create(c, {
        branchId,
        patientId,
        items: [],
        discount: 0,
        paidAmount: 60000,
        paymentMethod: 'cash',
        allocations: undefined,
      } as never);
      // Erkin POS non-plan yaratish uchun to'g'ridan-to'g'ri repository darajasida
      // netTotal=100000 kerak (items bilan) — quyidagi Step 3'da to'g'ri fixture bilan almashtiriladi.
      void created;
    });
  });
});
```

> **Diqqat implementatsiya paytida:** yuqoridagi test skeletidagi `cashier.create` chaqiruvi `items`siz (`netTotal = paidAmount`) chaqirilsa, `totalAmount` har doim `paidAmount`ga teng bo'lib qoladi (`cashier.service.ts:179`: `netTotal = items.length>0 ? itemsGross-discount : input.paidAmount`) — bu esa "totalAmount≠paidAmount" (qisman to'langan) stsenariyni test qila olmaydi. **To'g'ri fixture:** `items: [{serviceId, quantity:1, unitPrice:100000, serviceName:'X'}]`, `discount: 0`, `paidAmount: 60000` — bu holda `PriceLookup` DI kerak (`priceLookup: {getActivePrice: async()=>({price:'100000'})}` stub bilan `createCashierService({audit:noopAudit, priceLookup: stubPriceLookup})`). Buni Step 1'ning yakuniy (ishlaydigan) versiyasida ishlating — yuqoridagi kod faqat boshlang'ich skelet, quyidagi to'liq versiyani yozing:

```ts
const stubPriceLookup = {
  getActivePrice: async () => ({ price: '100000' }),
};
const cashierWithPrice = createCashierService({ audit: noopAudit, priceLookup: stubPriceLookup });

test("qisman to'langan (60000/100000) savdo TO'LIQ refund qilinsa — balans 0, avval 40000 edi", async () => {
  await db.transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
    const c = ctx(tx, ownerId);

    const sale = await cashierWithPrice.create(c, {
      branchId,
      patientId,
      items: [{ serviceId: crypto.randomUUID(), quantity: 1, unitPrice: 100000, serviceName: 'X' }],
      discount: 0,
      paidAmount: 60000,
      paymentMethod: 'cash',
    } as never);

    const before = await patientsSvc.balanceFor(c, patientId);
    expect(before.nonPlanBalance).toBe(40000);

    const refundResult = await cashierWithPrice.refund(c, sale.id, 60000);
    expect(refundResult.ok).toBe(true);

    const after = await patientsSvc.balanceFor(c, patientId);
    expect(after.nonPlanBalance).toBe(0); // CLI-448: avval 40000 bo'lib qolardi
  });
});

test('overpay (paidAmount > totalAmount) — balans manfiy (kredit, CLI-451)', async () => {
  await db.transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
    const c = ctx(tx, ownerId);

    await cashierWithPrice.create(c, {
      branchId,
      patientId,
      items: [{ serviceId: crypto.randomUUID(), quantity: 1, unitPrice: 100000, serviceName: 'X' }],
      discount: 0,
      paidAmount: 120000,
      paymentMethod: 'cash',
    } as never);

    const balance = await patientsSvc.balanceFor(c, patientId);
    expect(balance.nonPlanBalance).toBe(-20000);
    expect(balance.balance).toBe(-20000);
  });
});

test("to'liq to'langan, refundsiz — balans 0 (regressiya)", async () => {
  await db.transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
    const c = ctx(tx, ownerId);

    await cashierWithPrice.create(c, {
      branchId,
      patientId,
      items: [{ serviceId: crypto.randomUUID(), quantity: 1, unitPrice: 50000, serviceName: 'Y' }],
      discount: 0,
      paidAmount: 50000,
      paymentMethod: 'cash',
    } as never);

    const balance = await patientsSvc.balanceFor(c, patientId);
    expect(balance.nonPlanBalance).toBe(0);
  });
});

test("list() ham bir xil formulani qo'llaydi (bulk-aggregate)", async () => {
  await db.transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
    const c = ctx(tx, ownerId);

    const sale = await cashierWithPrice.create(c, {
      branchId,
      patientId,
      items: [{ serviceId: crypto.randomUUID(), quantity: 1, unitPrice: 100000, serviceName: 'X' }],
      discount: 0,
      paidAmount: 100000,
      paymentMethod: 'cash',
    } as never);
    await cashierWithPrice.refund(c, sale.id, 100000);

    const result = await patientsSvc.list(c, { page: 1, pageSize: 20, archived: false } as never);
    const row = result.data.find((p) => p.id === patientId);
    expect(row?.balance).toBe(0); // to'liq refund — bekor qilingan
  });
});
```

Butun faylni shu to'liq (skeletsiz) versiya bilan yozing — yuqoridagi "boshlang'ich skelet" bloki OLIB TASHLANADI, faqat oxirgi to'liq test-suite qoladi (import bloki + `beforeAll`/`afterAll`/`beforeEach` + 4 ta `test()`).

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && bun test tests/integration/cli-448-nonplan-refund-balance.test.ts --env-file=../../.env`
Expected: FAIL — birinchi test `expect(after.nonPlanBalance).toBe(0)` da `40000` qaytaradi (joriy bug).

- [ ] **Step 3: Write minimal implementation**

`apps/api/src/modules/patients/patients.service.ts` boshiga import qo'shing:

```ts
import { computeNonPlanRemainder, computePatientBalance } from './patients.balance.ts';
import type { NonPlanTransactionRow } from './patients.balance.ts';
```

`list()` funksiyasidagi uchinchi query (`:135-149`) va undan keyingi hisoblashni almashtiring — eski:

```ts
        db
          .select({
            patientId: cashierTransactions.patientId,
            sum: sql<string>`COALESCE(SUM(${cashierTransactions.totalAmount} - ${cashierTransactions.paidAmount}), 0)`,
          })
          .from(cashierTransactions)
          .where(
            and(
              inArray(cashierTransactions.patientId, ids),
              eq(cashierTransactions.type, 'payment'),
              eq(cashierTransactions.status, 'completed'),
              isNull(cashierTransactions.treatmentPlanId),
            ),
          )
          .groupBy(cashierTransactions.patientId),
      ]);

      const costById = new Map(costRows.map((r) => [r.patientId, Number(r.sum)]));
      const allocById = new Map(allocRows.map((r) => [r.patientId, Number(r.sum)]));
      const nonPlanByIdRaw = new Map(
        nonPlanRows.map((r) => [r.patientId as string, Number(r.sum)]),
      );

      for (const id of ids) {
        const { balance } = computePatientBalance({
          stageCostSum: costById.get(id) ?? 0,
          allocationSum: allocById.get(id) ?? 0,
          nonPlanRemainder: nonPlanByIdRaw.get(id) ?? 0,
        });
        balanceById.set(id, balance);
      }
```

yangi:

```ts
        db
          .select({
            id: cashierTransactions.id,
            patientId: cashierTransactions.patientId,
            totalAmount: cashierTransactions.totalAmount,
            paidAmount: cashierTransactions.paidAmount,
          })
          .from(cashierTransactions)
          .where(
            and(
              inArray(cashierTransactions.patientId, ids),
              eq(cashierTransactions.type, 'payment'),
              eq(cashierTransactions.status, 'completed'),
              isNull(cashierTransactions.treatmentPlanId),
            ),
          ),
      ]);

      const costById = new Map(costRows.map((r) => [r.patientId, Number(r.sum)]));
      const allocById = new Map(allocRows.map((r) => [r.patientId, Number(r.sum)]));

      // CLI-448: har original non-plan to'lovning refund'ini parentTransactionId
      // orqali topamiz (bitta qo'shimcha guruhlangan so'rov — N+1 emas).
      const originalIds = nonPlanOriginals.map((r) => r.id);
      const refundSumRows =
        originalIds.length > 0
          ? await db
              .select({
                parentTransactionId: cashierTransactions.parentTransactionId,
                sum: sql<string>`COALESCE(SUM(${cashierTransactions.paidAmount}), 0)`,
              })
              .from(cashierTransactions)
              .where(
                and(
                  eq(cashierTransactions.type, 'refund'),
                  inArray(cashierTransactions.parentTransactionId, originalIds),
                ),
              )
              .groupBy(cashierTransactions.parentTransactionId)
          : [];
      const refundedByParentId = new Map(
        refundSumRows.map((r) => [r.parentTransactionId as string, Number(r.sum)]),
      );

      const nonPlanRowsByPatientId = new Map<string, NonPlanTransactionRow[]>();
      for (const row of nonPlanOriginals) {
        const pid = row.patientId as string;
        const list = nonPlanRowsByPatientId.get(pid) ?? [];
        list.push({
          totalAmount: Number(row.totalAmount),
          paidAmount: Number(row.paidAmount),
          refundedSum: refundedByParentId.get(row.id) ?? 0,
        });
        nonPlanRowsByPatientId.set(pid, list);
      }

      for (const id of ids) {
        const { balance } = computePatientBalance({
          stageCostSum: costById.get(id) ?? 0,
          allocationSum: allocById.get(id) ?? 0,
          nonPlanRemainder: computeNonPlanRemainder(nonPlanRowsByPatientId.get(id) ?? []),
        });
        balanceById.set(id, balance);
      }
```

Diqqat: `Promise.all([costRows, allocRows, nonPlanOriginals])` — massiv nomi `nonPlanRows`dan `nonPlanOriginals`ga o'zgaradi, destructuring qatorini ham yangilang:
```ts
const [costRows, allocRows, nonPlanOriginals] = await Promise.all([
```

`balanceFor()` funksiyasida (`:204-216`) xuddi shu naqsh — eski uchinchi query va return blokini almashtiring:

```ts
    const [nonPlanRow] = await db
      .select({
        sum: sql<string>`COALESCE(SUM(${cashierTransactions.totalAmount} - ${cashierTransactions.paidAmount}), 0)`,
      })
      .from(cashierTransactions)
      .where(
        and(
          eq(cashierTransactions.patientId, patientId),
          eq(cashierTransactions.type, 'payment'),
          eq(cashierTransactions.status, 'completed'),
          isNull(cashierTransactions.treatmentPlanId),
        ),
      );

    return computePatientBalance({
      stageCostSum: Number(costRow?.sum ?? 0),
      allocationSum: Number(allocRow?.sum ?? 0),
      nonPlanRemainder: Number(nonPlanRow?.sum ?? 0),
    });
```

yangi:

```ts
    const nonPlanOriginals = await db
      .select({
        id: cashierTransactions.id,
        totalAmount: cashierTransactions.totalAmount,
        paidAmount: cashierTransactions.paidAmount,
      })
      .from(cashierTransactions)
      .where(
        and(
          eq(cashierTransactions.patientId, patientId),
          eq(cashierTransactions.type, 'payment'),
          eq(cashierTransactions.status, 'completed'),
          isNull(cashierTransactions.treatmentPlanId),
        ),
      );

    const originalIds = nonPlanOriginals.map((r) => r.id);
    const refundSumRows =
      originalIds.length > 0
        ? await db
            .select({
              parentTransactionId: cashierTransactions.parentTransactionId,
              sum: sql<string>`COALESCE(SUM(${cashierTransactions.paidAmount}), 0)`,
            })
            .from(cashierTransactions)
            .where(
              and(
                eq(cashierTransactions.type, 'refund'),
                inArray(cashierTransactions.parentTransactionId, originalIds),
              ),
            )
            .groupBy(cashierTransactions.parentTransactionId)
        : [];
    const refundedByParentId = new Map(
      refundSumRows.map((r) => [r.parentTransactionId as string, Number(r.sum)]),
    );

    const nonPlanRows: NonPlanTransactionRow[] = nonPlanOriginals.map((row) => ({
      totalAmount: Number(row.totalAmount),
      paidAmount: Number(row.paidAmount),
      refundedSum: refundedByParentId.get(row.id) ?? 0,
    }));

    return computePatientBalance({
      stageCostSum: Number(costRow?.sum ?? 0),
      allocationSum: Number(allocRow?.sum ?? 0),
      nonPlanRemainder: computeNonPlanRemainder(nonPlanRows),
    });
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/api && bun test tests/integration/cli-448-nonplan-refund-balance.test.ts --env-file=../../.env`
Expected: PASS — barcha 4 test yashil.

- [ ] **Step 5: Run full regression (mavjud balans/plan testlari buzilmaganini tekshirish)**

Run: `cd apps/api && bun test tests/integration/cashier-plan-balance.test.ts --env-file=../../.env`
Expected: PASS (o'zgarmagan — bu fayl faqat plan-linked balansni tekshiradi, non-plan formulaga tegmaydi).

Run: `cd apps/api && bunx vitest run src/modules/patients/`
Expected: PASS.

- [ ] **Step 6: Typecheck**

Run: `cd apps/api && bun run typecheck` (yoki repo-root `turbo run typecheck --filter=@dental/api`)
Expected: 0 xato.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/modules/patients/patients.service.ts apps/api/tests/integration/cli-448-nonplan-refund-balance.test.ts
git commit -m "fix(api): CLI-448/451 — non-plan bemor balansi refund'ni to'g'ri hisoblaydi (to'liq refund=bekor, overpay=kredit)"
```

---

## Yakuniy DoD

- [ ] `computeNonPlanRemainder` — 7 unit test yashil (Task 1).
- [ ] `patients.service.ts::list` va `balanceFor` — yangi formula, 4 integration test yashil (Task 2).
- [ ] Mavjud `cashier-plan-balance.test.ts` va `patients.balance.test.ts` regressiyasiz yashil.
- [ ] Typecheck toza.
- [ ] Linear CLI-448 va CLI-451 — "Done"ga o'tkaziladi (implementatsiya + verify-agentdan keyin).
