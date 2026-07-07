# G2 — Fiscal chek summasi: paidAmount (CLI-449) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fiskal chek so'rovidagi `amount` maydonini `transaction.totalAmount` (nominal/hisob-faktura) o'rniga `transaction.paidAmount` (haqiqatda olingan naqd) bilan yuborish.

**Architecture:** Bitta maydon o'zgarishi (`cashier.service.ts::create`, fiscal chaqiruvi) + spy `FiscalProvider` bilan unit test, chaqiruvga qaysi summa uzatilganini tasdiqlaydi. `NoOpFiscalProvider` runtime xulqi o'zgarmaydi (u `amount`ni e'tiborsiz qoldiradi) — bu faqat kelajakdagi real Soliq integratsiyasiga tayyorgarlik.

**Tech Stack:** Bun, Hono, `@dental/fiscal` (`FiscalProvider` interfeysi), `bun test`.

## Global Constraints

- Pul summalari `Number()` bilan DB numeric ustunidan o'qiladi, JS float emas DB-darajasida (`numeric(14,2)`).
- Real-DB integration test (`bun test --env-file=../../.env`), `noopAudit` (mock audit emas, lekin fiscal — spy, chunki `FiscalProvider` DI orqali almashtiriladigan tashqi bog'liqlik).

---

### Task 1: `create()` fiscal chaqiruvini `paidAmount`ga o'tkazish

**Files:**
- Modify: `apps/api/src/modules/cashier/cashier.service.ts:273-277`
- Test: yangi `apps/api/tests/integration/cli-449-fiscal-paid-amount.test.ts`

**Interfaces:**
- Consumes: mavjud `FiscalProvider.createReceipt({id, amount, items}): Promise<FiscalReceipt>` (`packages/fiscal/src/index.ts:19-21`) — signature o'zgarmaydi, faqat `amount` qiymati manbai.

- [ ] **Step 1: Write the failing test**

`apps/api/tests/integration/cli-449-fiscal-paid-amount.test.ts`:

```ts
/**
 * CLI-449 — fiskal chek summasi paidAmount (haqiqiy olingan naqd) bilan
 * chaqiriladi, totalAmount (nominal) bilan emas. Spy FiscalProvider — real
 * DB (cashier.create() to'liq oqim, RLS tx ichida).
 *
 * Ishga tushirish:
 *   cd apps/api && bun test tests/integration/cli-449-fiscal-paid-amount.test.ts --env-file=../../.env
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { branches, patients, tenants, users } from '@dental/db-schema';
import type { FiscalPayment, FiscalProvider, FiscalReceipt } from '@dental/fiscal';
import { sql } from 'drizzle-orm';
import type { Context } from 'hono';
import type { DbOrTx } from '../../src/db/client.ts';
import { db } from '../../src/db/client.ts';
import type { AuditLogger } from '../../src/lib/audit-logger.ts';
import { createCashierService } from '../../src/modules/cashier/cashier.service.ts';

const noopAudit = { record: async () => {} } as unknown as AuditLogger;

let tenantId: string;
let ownerId: string;
let branchId: string;
let patientId: string;

beforeAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);

  const [owner] = await db
    .insert(users)
    .values({ phone: '+998900000049', passwordHash: 'fake', fullName: 'Owner' })
    .returning({ id: users.id });
  if (!owner) throw new Error('owner insert failed');
  ownerId = owner.id;

  const [tenant] = await db
    .insert(tenants)
    .values({ name: 'CLI449 Clinic', slug: 'cli449-clinic', ownerUserId: ownerId })
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

    const [patient] = await tx
      .insert(patients)
      .values({ tenantId, fullName: 'Test Bemor' })
      .returning({ id: patients.id });
    if (!patient) throw new Error('patient insert failed');
    patientId = patient.id;
  });
});

afterAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
});

const ctx = (tx: DbOrTx): Context =>
  ({
    get: (k: string) =>
      k === 'db'
        ? tx
        : k === 'accessClaims'
          ? { perms: ['@owner'] }
          : k === 'activeTenantId'
            ? tenantId
            : k === 'user'
              ? { id: ownerId }
              : undefined,
  }) as unknown as Context;

describe('CLI-449: fiscal.createReceipt amount = paidAmount', () => {
  test('qisman to\'langan (60000/100000) savdoda fiscal amount=60000 (paidAmount), 100000 (totalAmount) EMAS', async () => {
    const receivedPayments: FiscalPayment[] = [];
    const spyFiscal: FiscalProvider = {
      async createReceipt(payment) {
        receivedPayments.push(payment);
        return { fiscalId: null, response: { provider: 'spy' } } satisfies FiscalReceipt;
      },
    };
    const stubPriceLookup = { getActivePrice: async () => ({ price: '100000' }) };
    const cashier = createCashierService({
      audit: noopAudit,
      fiscal: spyFiscal,
      priceLookup: stubPriceLookup,
    });

    await db.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
      const c = ctx(tx);

      await cashier.create(c, {
        branchId,
        patientId,
        items: [{ serviceId: crypto.randomUUID(), quantity: 1, unitPrice: 100000, serviceName: 'X' }],
        discount: 0,
        paidAmount: 60000,
        paymentMethod: 'cash',
      } as never);
    });

    expect(receivedPayments).toHaveLength(1);
    expect(receivedPayments[0]?.amount).toBe(60000);
  });

  test("to'liq to'langan (100000/100000) savdoda fiscal amount=100000 (regressiya)", async () => {
    const receivedPayments: FiscalPayment[] = [];
    const spyFiscal: FiscalProvider = {
      async createReceipt(payment) {
        receivedPayments.push(payment);
        return { fiscalId: null, response: { provider: 'spy' } } satisfies FiscalReceipt;
      },
    };
    const stubPriceLookup = { getActivePrice: async () => ({ price: '50000' }) };
    const cashier = createCashierService({
      audit: noopAudit,
      fiscal: spyFiscal,
      priceLookup: stubPriceLookup,
    });

    await db.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
      const c = ctx(tx);

      await cashier.create(c, {
        branchId,
        patientId,
        items: [{ serviceId: crypto.randomUUID(), quantity: 1, unitPrice: 50000, serviceName: 'Y' }],
        discount: 0,
        paidAmount: 50000,
        paymentMethod: 'cash',
      } as never);
    });

    expect(receivedPayments[0]?.amount).toBe(50000);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && bun test tests/integration/cli-449-fiscal-paid-amount.test.ts --env-file=../../.env`
Expected: FAIL — birinchi test `receivedPayments[0]?.amount` = `100000` (joriy: `totalAmount`), `60000` kutilgan.

- [ ] **Step 3: Write minimal implementation**

`apps/api/src/modules/cashier/cashier.service.ts:273-277` — eski:

```ts
      // Fiscal (NoOp — M3 da)
      const fiscalResult = await fiscal.createReceipt({
        id: transaction.id,
        amount: Number(transaction.totalAmount),
        items: items,
      });
```

yangi:

```ts
      // Fiscal (NoOp — M3 da). CLI-449: paidAmount (haqiqatda olingan naqd) —
      // totalAmount (nominal/hisob-faktura) EMAS, qisman to'langan savdoda fiskal
      // chek haqiqiy qabul qilingan summaga mos bo'lishi uchun.
      const fiscalResult = await fiscal.createReceipt({
        id: transaction.id,
        amount: Number(transaction.paidAmount),
        items: items,
      });
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/api && bun test tests/integration/cli-449-fiscal-paid-amount.test.ts --env-file=../../.env`
Expected: PASS — ikkala test yashil.

- [ ] **Step 5: Regression — mavjud cashier testlari**

Run: `cd apps/api && bun test apps/api/src/modules/cashier/ --env-file=../../.env` (yoki mavjud `cashier.billing.test.ts`/`cashier.schema.test.ts` — bular fiscal chaqiruvini tekshirmaydi, o'zgarishsiz yashil qolishi kerak)
Expected: PASS.

- [ ] **Step 6: Typecheck**

Run: `cd apps/api && bun run typecheck`
Expected: 0 xato.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/modules/cashier/cashier.service.ts apps/api/tests/integration/cli-449-fiscal-paid-amount.test.ts
git commit -m "fix(api): CLI-449 — fiscal chek summasi paidAmount bilan (totalAmount emas)"
```

---

## Yakuniy DoD

- [ ] `cashier.service.ts::create` fiscal chaqiruvi `paidAmount` bilan (Task 1).
- [ ] 2 integration test yashil (qisman to'langan + to'liq to'langan regressiya).
- [ ] Mavjud cashier testlari regressiyasiz yashil.
- [ ] Typecheck toza.
- [ ] Linear CLI-449 — "Done"ga o'tkaziladi.
