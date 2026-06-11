# R2 — Billing poydevori (treatment-plan to'lov allocation + balans) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Treatment-plan bosqichlari uchun per-bosqich to'lov kuzatuvi va plan balansi — alohida, mustaqil backend poydevor. Kassa billing'ga egalik qiladi (yangi `treatment_stage_payments` allocation jadval + computed balans), treatment-plan jadvallarini faqat **o'qiydi**. `treatment_stages`'ga to'lov ustunlari **qo'shilmaydi** (Klinik egaligidagi jadval chegarasi toza saqlanadi).

**Architecture:** Backend-only. Schema avval (yangi allocation jadval + `cashier_transactions.treatment_plan_id` FK + Drizzle migration + qo'lda RLS policy fayli), keyin sof `computePlanBalance` helper (TDD, yagona unit test), keyin `cashier.service` kengaytmasi (create allocation, refund negatsiya, planBalance), keyin schema + routes + api-client. UI yo'q (Kassa-UI CLI-49 shu poydevorni iste'mol qiladi).

**Tech Stack:** Bun + Hono + Drizzle (backend), Drizzle Kit (migration), qo'lda RLS SQL (`apps/api/migrations/rls/`), `bun test` (helper unit test).

**Spec:** `docs/superpowers/specs/2026-06-11-r2-billing-foundation-design.md`

**Branch:** `feat/r2-billing` (main'dan; **birinchi quriladi va merge qilinadi**, Kassa-UI'dan oldin)

> **⚠️ Test harness to'g'risida (spec §4 ongli deskoupingi):**
> 1. `apps/api` **`bun test`** ishlatadi (vitest EMAS — `apps/api/package.json` da `"test": "bun test"`, vitest config yo'q). Shuning uchun yagona unit test `bun:test` import bilan yoziladi (`import { describe, expect, it } from 'bun:test'`) va `bun --filter @dental/api test` bilan ishga tushiriladi.
> 2. Backend **service** uchun unit-test harness yo'q (faqat `tests/integration/rls.test.ts` real DB bilan). Shuning uchun yagona unit test — **sof `computePlanBalance` helper** (balans hisobining eng muhim mantiqi, `cashier.billing.ts` ga ajratilgan). Service (`create`/`refund`/`planBalance`) — `typecheck` + `check:rls` + manual dev fidelity bilan tekshiriladi.

> **⚠️ RLS — ikki alohida artefakt (eng yuqori xavf):**
> - Drizzle `db:generate` **hech qachon** RLS chiqarmaydi (`apps/api/drizzle/*.sql` da bironta policy yo'q — tasdiqlangan). U faqat `CREATE TABLE` + `ALTER TABLE ... ADD COLUMN/FK/INDEX` chiqaradi.
> - RLS qo'lda yoziladigan faylda: `apps/api/migrations/rls/*.sql` (keyingisi `0007_*.sql`). `migrate.ts` ularni `_rls_migrations` tracking jadval orqali apply qiladi.
> - `check:rls` (`scripts/check-rls-coverage.ts`) har `tenantId: uuid('tenant_id')` li jadval uchun RLS fayl borligini majburlaydi. Yangi jadval db-schema'ga qo'shilishi bilan, RLS fayl bo'lmasa `check:rls` **DARHOL FAIL** bo'ladi. Shuning uchun jadval yaratish + RLS fayl + `check:rls` — **bitta task**da (Task 1), bitta commit.

---

## Fayl xaritasi

**Schema + migration (Task 1):**
- Create: `packages/db-schema/src/tables/treatment-stage-payments.ts` — yangi jadval
- Modify: `packages/db-schema/src/index.ts` — yangi jadval re-export
- Modify: `packages/db-schema/src/tables/cashier.ts` — `cashierTransactions.treatmentPlanId` ustun + index + `treatmentPlans` import
- Create: `apps/api/drizzle/0009_*.sql` — `db:generate` chiqaradi (qo'lda yozilmaydi)
- Create: `apps/api/migrations/rls/0007_billing_rls.sql` — qo'lda RLS policy

**Pure helper (Task 2):**
- Create: `apps/api/src/modules/cashier/cashier.billing.ts` — sof `computePlanBalance`
- Create: `apps/api/src/modules/cashier/cashier.billing.test.ts` — `bun:test` unit

**Service + schema + routes (Task 3, 4):**
- Modify: `apps/api/src/modules/cashier/cashier.schema.ts` — `createTransactionSchema` ga `treatmentPlanId` + `allocations`
- Modify: `apps/api/src/modules/cashier/cashier.service.ts` — `create` allocation, `refund` negatsiya, yangi `planBalance`
- Modify: `apps/api/src/modules/cashier/cashier.routes.ts` — `GET /plan-balance/:planId`

**api-client (Task 4):**
- Modify: `packages/api-client/src/types-m3.ts` — `CashierTransaction.treatmentPlanId` + `StageBalance`/`PlanBalance` tiplar
- Modify: `packages/api-client/src/endpoints.ts` — `cashier.create` body + `cashier.planBalance`

---

## Ochiq nuqtalar — plan'da hal qilindi (spec §"Ochiq mayda nuqtalar")

1. **RLS policy migration:** Drizzle generate qilmaydi → qo'lda `apps/api/migrations/rls/0007_billing_rls.sql` (Task 1 Step 5). `treatment_stage_payments` `tenant_id`'ga ega → **to'g'ridan-to'g'ri tenant_id pattern** (`queue_tickets`/`cashier_transactions` 0003 kabi), subquery EMAS.
2. **`allocations` yig'indisi:** qisman to'lov ruxsat (`Σ allocations < paidAmount` OK); `Σ allocations > paidAmount` **rad** — service'da `fail('allocations.exceed', ...)` 400 (routes ham 400 qaytaradi). Aniq shakl Task 3 Step 4.
3. **`planBalance` permission:** `cashier.view` (mavjud — `packages/core/src/permissions.ts:273`). Task 4 Step 3.
4. **numeric → string:** Drizzle `numeric` ustunlarni **string** qaytaradi (`cost`, `amount`). `computePlanBalance` string kirishlarni qabul qiladi va ichkarida `Number()`-parse qiladi; test ham string kiritadi (real DB shakli). Task 2.

---

## Task 1: Schema — `treatment_stage_payments` jadval + `cashier_transactions.treatment_plan_id` + migration + RLS

**Files:**
- Create: `packages/db-schema/src/tables/treatment-stage-payments.ts`
- Modify: `packages/db-schema/src/index.ts`
- Modify: `packages/db-schema/src/tables/cashier.ts`
- Create: `apps/api/drizzle/0009_*.sql` (generate)
- Create: `apps/api/migrations/rls/0007_billing_rls.sql`

- [ ] **Step 1: Yangi jadval fayli `treatment-stage-payments.ts`**

`packages/db-schema/src/tables/treatment-stage-payments.ts` yarating (to'liq):

```typescript
import { sql } from 'drizzle-orm';
import { index, numeric, pgTable, timestamp, uuid } from 'drizzle-orm/pg-core';
import { cashierTransactions } from './cashier.ts';
import { tenants } from './tenants.ts';
import { treatmentStages } from './treatment-plans.ts';

/**
 * Treatment stage payments — per-bosqich to'lov allocation jadvali (billing, Kassa egaligida).
 *
 * Bitta tranzaksiya bir necha bosqichni to'lashi mumkin (har biri bir row).
 * `amount` ijobiy = to'lov; manfiy = refund negatsiyasi (asl allocation'ni bekor qiladi).
 * Plan balansi shu rowlardan computed (saqlanmaydi). `treatment_stages` o'zgartirilmaydi.
 */
export const treatmentStagePayments = pgTable(
  'treatment_stage_payments',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    transactionId: uuid('transaction_id')
      .notNull()
      .references(() => cashierTransactions.id, { onDelete: 'cascade' }),
    stageId: uuid('stage_id')
      .notNull()
      .references(() => treatmentStages.id, { onDelete: 'cascade' }),
    amount: numeric('amount', { precision: 14, scale: 2 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('stage_payments_tenant_stage_idx').on(t.tenantId, t.stageId),
    index('stage_payments_transaction_idx').on(t.transactionId),
  ],
);

export type TreatmentStagePayment = typeof treatmentStagePayments.$inferSelect;
export type TreatmentStagePaymentInsert = typeof treatmentStagePayments.$inferInsert;
```

- [ ] **Step 2: `index.ts` re-export**

`packages/db-schema/src/index.ts` da `treatment-plans.ts` eksportidan **keyin** qo'shing (alifbo tartibida `treatment-stage-payments` `treatment-plans`'dan keyin keladi):

```typescript
export * from './tables/treatment-stage-payments.ts';
```

(Mavjud `export * from './tables/treatment-plans.ts';` qatoridan keyin, `export * from './tables/user-assignments.ts';` qatoridan oldin.)

- [ ] **Step 3: `cashier_transactions.treatmentPlanId` ustun**

`packages/db-schema/src/tables/cashier.ts` da import blokiga qo'shing (mavjud `import { branches } from './branches.ts';` dan keyin, alifbo bo'yicha — `services` dan keyin `tenants` dan oldin emas; aniqlik uchun `treatmentPlans` ni qo'shing):

```typescript
import { treatmentPlans } from './treatment-plans.ts';
```

(Joylashuv: mavjud `import { services } from './services.ts';` dan keyin, `import { tenants } from './tenants.ts';` dan oldin.)

`cashierTransactions` jadvalining `patientId` ustunidan **keyin** (41-qatordan keyin) ustun qo'shing:

```typescript
    treatmentPlanId: uuid('treatment_plan_id').references(() => treatmentPlans.id, {
      onDelete: 'set null',
    }),
```

`cashierTransactions` index massiviga (`(t) => [...]`, mavjud `index('cashier_tx_status_idx')...` dan keyin) qo'shing:

```typescript
    index('cashier_tx_treatment_plan_idx').on(t.treatmentPlanId),
```

- [ ] **Step 4: Drizzle migration generate**

Run: `bun --filter @dental/api db:generate`
Expected: yangi `apps/api/drizzle/0009_*.sql` fayli, ichida:
- `CREATE TABLE "treatment_stage_payments"` (id, tenant_id, transaction_id, stage_id, amount, created_at) + 3 FK + 2 index
- `ALTER TABLE "cashier_transactions" ADD COLUMN "treatment_plan_id" uuid` + FK (SET NULL) + `cashier_tx_treatment_plan_idx` index
- `apps/api/drizzle/meta/0009_snapshot.json` + `_journal.json` yangilanadi
- **RLS yo'q** (Drizzle chiqarmaydi — kutilgan).

- [ ] **Step 5: RLS policy fayli (qo'lda) — `0007_billing_rls.sql`**

`apps/api/migrations/rls/0007_billing_rls.sql` yarating (to'liq). `treatment_stage_payments` `tenant_id`'ga ega → to'g'ridan-to'g'ri pattern (`0003_m3_rls.sql` dagi `queue_tickets`/`cashier_transactions` kabi):

```sql
-- R2 — Billing: treatment_stage_payments RLS policy.
-- Tenant-scoped (tenant_id to'g'ridan-to'g'ri). cashier_transactions allaqachon RLS
-- (0003), yangi treatment_plan_id ustuni policy'ga ta'sir qilmaydi.

-- ===== TREATMENT_STAGE_PAYMENTS =====
ALTER TABLE treatment_stage_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE treatment_stage_payments FORCE ROW LEVEL SECURITY;
CREATE POLICY treatment_stage_payments_tenant_isolation ON treatment_stage_payments
  USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
```

- [ ] **Step 6: db-schema typecheck**

Run: `bun --filter @dental/db-schema typecheck`
Expected: exit 0.

- [ ] **Step 7: RLS coverage lint**

Run: `bun run check:rls`
Expected: exit 0 — `✅ RLS coverage OK`. `treatment_stage_payments` endi `0007_billing_rls.sql` da `ENABLE ROW LEVEL SECURITY` bilan topiladi. (Step 5 bo'lmasa bu FAIL bo'lardi — shuning uchun bitta task.)

- [ ] **Step 8: Migration mazmunini review**

Run: `git diff --stat && cat apps/api/drizzle/0009_*.sql`
Expected: faqat yangi `treatment_stage_payments` jadval + `cashier_transactions` ga `treatment_plan_id` ustun/FK/index. Boshqa jadval tegmagan. `treatment_stages` **o'zgarmagan** (Klinik chegarasi).

- [ ] **Step 9: Commit**

```bash
git add packages/db-schema/src/tables/treatment-stage-payments.ts packages/db-schema/src/index.ts packages/db-schema/src/tables/cashier.ts apps/api/drizzle apps/api/migrations/rls/0007_billing_rls.sql
git commit -m "feat(db): treatment_stage_payments allocation jadval + cashier_transactions.treatment_plan_id + RLS"
```

---

## Task 2: Pure helper — `computePlanBalance` + `bun:test` unit (TDD)

**Files:**
- Create: `apps/api/src/modules/cashier/cashier.billing.test.ts`
- Create: `apps/api/src/modules/cashier/cashier.billing.ts`

> Sof funksiya: `Context`/`getDb`/Drizzle import qilmaydi. Service rowlarni fetch qiladi, keyin shu helper'ni chaqiradi. Drizzle `numeric` → string, shuning uchun helper string kirishlarni qabul qiladi va `Number()`-parse qiladi.

- [ ] **Step 1: Failing test yozish (`bun:test`)**

`apps/api/src/modules/cashier/cashier.billing.test.ts` (to'liq):

```typescript
import { describe, expect, it } from 'bun:test';
import { computePlanBalance } from './cashier.billing.ts';

// Drizzle numeric'ni string qaytaradi — test real DB shaklini aks ettiradi.
const stages = [
  { id: 's1', serviceName: 'Konsultatsiya', cost: '100000.00' },
  { id: 's2', serviceName: 'Plomba', cost: '300000.00' },
];

describe('computePlanBalance', () => {
  it("to'lovsiz: paid=0, remaining=cost, balance=totalCost", () => {
    const r = computePlanBalance(stages, []);
    expect(r.totalCost).toBe(400000);
    expect(r.totalPaid).toBe(0);
    expect(r.balance).toBe(400000);
    const s1 = r.stages.find((s) => s.stageId === 's1');
    expect(s1).toEqual({
      stageId: 's1',
      serviceName: 'Konsultatsiya',
      cost: 100000,
      paid: 0,
      remaining: 100000,
    });
  });

  it("bitta bosqich to'liq to'langan", () => {
    const r = computePlanBalance(stages, [{ stageId: 's1', amount: '100000.00' }]);
    expect(r.totalPaid).toBe(100000);
    expect(r.balance).toBe(300000);
    expect(r.stages.find((s) => s.stageId === 's1')?.remaining).toBe(0);
    expect(r.stages.find((s) => s.stageId === 's2')?.remaining).toBe(300000);
  });

  it("qisman to'lov: bir bosqichga bir nechta allocation yig'iladi", () => {
    const r = computePlanBalance(stages, [
      { stageId: 's2', amount: '100000.00' },
      { stageId: 's2', amount: '50000.00' },
    ]);
    const s2 = r.stages.find((s) => s.stageId === 's2');
    expect(s2?.paid).toBe(150000);
    expect(s2?.remaining).toBe(150000);
    expect(r.totalPaid).toBe(150000);
    expect(r.balance).toBe(250000);
  });

  it("multi-stage: bir tranzaksiya bir necha bosqichni to'laydi", () => {
    const r = computePlanBalance(stages, [
      { stageId: 's1', amount: '100000.00' },
      { stageId: 's2', amount: '300000.00' },
    ]);
    expect(r.totalPaid).toBe(400000);
    expect(r.balance).toBe(0);
  });

  it("refund negatsiyasi: manfiy allocation balansni tiklaydi", () => {
    const r = computePlanBalance(stages, [
      { stageId: 's1', amount: '100000.00' },
      { stageId: 's1', amount: '-100000.00' },
    ]);
    const s1 = r.stages.find((s) => s.stageId === 's1');
    expect(s1?.paid).toBe(0);
    expect(s1?.remaining).toBe(100000);
    expect(r.totalPaid).toBe(0);
    expect(r.balance).toBe(400000);
  });

  it("noma'lum stage_id allocation'i e'tiborga olinmaydi (plan bosqichlari manba)", () => {
    const r = computePlanBalance(stages, [{ stageId: 'ghost', amount: '50000.00' }]);
    expect(r.totalPaid).toBe(0);
    expect(r.balance).toBe(400000);
  });
});
```

- [ ] **Step 2: Test ishga tushirish (FAIL)**

Run: `bun --filter @dental/api test cashier.billing`
Expected: FAIL — `computePlanBalance` aniqlanmagan / modul topilmadi.

- [ ] **Step 3: `cashier.billing.ts` implementatsiya (sof)**

`apps/api/src/modules/cashier/cashier.billing.ts` (to'liq):

```typescript
/**
 * Billing balans hisobi — SOF funksiya (Context/Drizzle YO'Q).
 * Service rowlarni fetch qiladi, keyin shuni chaqiradi.
 * Drizzle numeric → string, shuning uchun string kirish + Number()-parse.
 */

/** Plan bosqichi (treatment_stages'dan o'qiladi — billing o'zgartirmaydi). */
export type StageRow = {
  id: string;
  serviceName: string;
  cost: string; // numeric → string
};

/** Allocation row (treatment_stage_payments). amount ijobiy=to'lov, manfiy=refund. */
export type AllocationRow = {
  stageId: string;
  amount: string; // numeric → string
};

export type StageBalance = {
  stageId: string;
  serviceName: string;
  cost: number;
  paid: number;
  remaining: number;
};

export type PlanBalance = {
  totalCost: number;
  totalPaid: number;
  balance: number;
  stages: StageBalance[];
};

export function computePlanBalance(
  stages: StageRow[],
  allocations: AllocationRow[],
): PlanBalance {
  // stage_id bo'yicha allocation yig'indisi (manfiylar refundni negatsiya qiladi)
  const paidByStage = new Map<string, number>();
  for (const a of allocations) {
    paidByStage.set(a.stageId, (paidByStage.get(a.stageId) ?? 0) + Number(a.amount));
  }

  const stageBalances: StageBalance[] = stages.map((s) => {
    const cost = Number(s.cost);
    const paid = paidByStage.get(s.id) ?? 0;
    return {
      stageId: s.id,
      serviceName: s.serviceName,
      cost,
      paid,
      remaining: cost - paid,
    };
  });

  const totalCost = stageBalances.reduce((sum, s) => sum + s.cost, 0);
  const totalPaid = stageBalances.reduce((sum, s) => sum + s.paid, 0);

  return { totalCost, totalPaid, balance: totalCost - totalPaid, stages: stageBalances };
}
```

- [ ] **Step 4: Test ishga tushirish (PASS)**

Run: `bun --filter @dental/api test cashier.billing`
Expected: PASS — 6 ta `it` o'tadi.

- [ ] **Step 5: Typecheck**

Run: `bun --filter @dental/api typecheck`
Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/cashier/cashier.billing.ts apps/api/src/modules/cashier/cashier.billing.test.ts
git commit -m "feat(cashier): computePlanBalance sof helper + bun:test unit (TDD)"
```

---

## Task 3: `cashier.schema.ts` + `cashier.service.ts` (create allocation + refund negatsiya + planBalance)

**Files:**
- Modify: `apps/api/src/modules/cashier/cashier.schema.ts`
- Modify: `apps/api/src/modules/cashier/cashier.service.ts`

- [ ] **Step 1: Schema — `createTransactionSchema` ga `treatmentPlanId` + `allocations`**

`apps/api/src/modules/cashier/cashier.schema.ts` da `createTransactionSchema` ni o'zgartiring. Mavjud `notes` qatoridan **keyin** (yopilish `})` dan oldin) qo'shing:

```typescript
export const createTransactionSchema = z.object({
  branchId: z.uuid(),
  patientId: z.uuid().optional(),
  items: z
    .array(
      z.object({
        serviceId: z.uuid(),
        quantity: z.coerce.number().int().positive().default(1),
        unitPrice: z.coerce.number().nonnegative(),
        serviceName: z.string().min(1),
      }),
    )
    .min(1),
  discount: z.coerce.number().nonnegative().default(0),
  paidAmount: z.coerce.number().nonnegative(),
  paymentMethod: z.enum(['cash', 'card', 'transfer', 'other']),
  notes: z.string().max(1000).optional(),
  treatmentPlanId: z.uuid().optional(),
  allocations: z
    .array(
      z.object({
        stageId: z.uuid(),
        amount: z.coerce.number().positive(),
      }),
    )
    .optional(),
});
export type CreateTransactionInput = z.infer<typeof createTransactionSchema>;
```

(`listTransactionsQuery` o'zgarmaydi.)

- [ ] **Step 2: Service — importlarni kengaytirish**

`apps/api/src/modules/cashier/cashier.service.ts` boshidagi importlarni o'zgartiring:

```typescript
import { randomBytes } from 'node:crypto';
import {
  cashierTransactionItems,
  cashierTransactions,
  treatmentStagePayments,
  treatmentStages,
} from '@dental/db-schema';
import { and, between, count, desc, eq, sql } from 'drizzle-orm';
import type { Context } from 'hono';
import { getDb } from '../../db/scoped.ts';
import type { AuditLogger } from '../../lib/audit-logger.ts';
import { computePlanBalance } from './cashier.billing.ts';
import type { CreateTransactionInput, ListTransactionsQuery } from './cashier.schema.ts';
```

- [ ] **Step 3: `create` — `treatmentPlanId` saqlash + allocation rowlar + cheklov**

`create` funksiyasini o'zgartiring. (a) `totalAmount`/`netTotal` dan keyin allocation cheklovini tekshiring; (b) transaction insert `values`'ga `treatmentPlanId` qo'shing; (c) items insert'dan keyin allocation rowlarini insert qiling.

`create` boshidagi `const netTotal = totalAmount - input.discount;` dan **keyin**, `const receiptNumber` dan **oldin** qo'shing:

```typescript
    // Allocation yig'indisi paidAmount'dan oshmasligi shart (qisman ruxsat, oshib ketish RAD).
    if (input.allocations && input.allocations.length > 0) {
      const allocSum = input.allocations.reduce((s, a) => s + a.amount, 0);
      if (allocSum > input.paidAmount) {
        throw new AllocationExceedError();
      }
    }
```

`db.transaction` ichidagi `cashierTransactions` insert `.values({...})` obyektiga `createdBy: user?.id ?? null,` dan **oldin** (yoki ichida istalgan joyda) qo'shing:

```typescript
          treatmentPlanId: input.treatmentPlanId ?? null,
```

Items insert (`const items = await tx.insert(cashierTransactionItems)...returning();`) dan **keyin**, fiscal chaqiruvidan **oldin** qo'shing:

```typescript
      // Per-bosqich allocation rowlar (ijobiy = to'lov). Bir tx ichida (RLS tx-bound).
      if (input.allocations && input.allocations.length > 0) {
        await tx.insert(treatmentStagePayments).values(
          input.allocations.map((a) => ({
            tenantId,
            transactionId: transaction.id,
            stageId: a.stageId,
            amount: String(a.amount),
          })),
        );
      }
```

- [ ] **Step 4: `AllocationExceedError` klassi**

`cashier.service.ts` da, `createCashierService` factory'dan **oldin** (fayl yuqorisida, `generateReceiptNumber` dan keyin) qo'shing:

```typescript
/** Allocation yig'indisi paidAmount'dan oshganda — routes 400 ga aylantiradi. */
export class AllocationExceedError extends Error {
  constructor() {
    super('Allocation sum exceeds paid amount');
    this.name = 'AllocationExceedError';
  }
}
```

- [ ] **Step 5: `refund` — allocation negatsiyasi**

`refund` funksiyasidagi `db.transaction(async (tx) => {...})` blokida, `refundTx` insert'dan **keyin**, `tx.update(...).set({ status: 'voided' })` dan **oldin** qo'shing:

```typescript
      // Asl tranzaksiya allocation'larini negatsiya qilish (balansni tiklaydi).
      const origAllocations = await tx
        .select({ stageId: treatmentStagePayments.stageId, amount: treatmentStagePayments.amount })
        .from(treatmentStagePayments)
        .where(eq(treatmentStagePayments.transactionId, id));

      if (refundTx && origAllocations.length > 0) {
        await tx.insert(treatmentStagePayments).values(
          origAllocations.map((a) => ({
            tenantId: original.tenantId,
            transactionId: refundTx.id,
            stageId: a.stageId,
            amount: String(-Number(a.amount)),
          })),
        );
      }
```

> Eslatma: mavjud `refund` `set_config` ni qayta chaqirmaydi va `cashierTransactions` (RLS-forced) ga muvaffaqiyatli insert qiladi — demak middleware GUC mavjud. Yangi allocation insert ham shu yondashuvni ishlatadi (qo'shimcha `set_config` qo'shilmaydi — uniform).

- [ ] **Step 6: `planBalance` funksiyasi**

`dailySummary` dan **keyin**, `return {...}` dan **oldin** qo'shing:

```typescript
  /** Plan balansi — sof o'qish (treatment_stages + allocation yig'indilari). Saqlanmaydi. */
  async function planBalance(c: Context, planId: string) {
    const db = getDb(c);

    // Plan bosqichlari (RLS tenant orqali filtrlaydi — explicit WHERE tenant_id YOZILMAYDI).
    const stageRows = await db
      .select({
        id: treatmentStages.id,
        serviceName: treatmentStages.serviceName,
        cost: treatmentStages.cost,
      })
      .from(treatmentStages)
      .where(eq(treatmentStages.treatmentPlanId, planId));

    // Shu bosqichlarga tegishli allocation'lar.
    const allocRows = await db
      .select({
        stageId: treatmentStagePayments.stageId,
        amount: treatmentStagePayments.amount,
      })
      .from(treatmentStagePayments)
      .innerJoin(treatmentStages, eq(treatmentStagePayments.stageId, treatmentStages.id))
      .where(eq(treatmentStages.treatmentPlanId, planId));

    return computePlanBalance(stageRows, allocRows);
  }
```

- [ ] **Step 7: Return obyektiga `planBalance` qo'shish**

`return { list, getById, create, refund, dailySummary };` ni o'zgartiring:

```typescript
  return { list, getById, create, refund, dailySummary, planBalance };
```

- [ ] **Step 8: Typecheck**

Run: `bun --filter @dental/api typecheck`
Expected: exit 0.

- [ ] **Step 9: Helper test hali yashil (regression)**

Run: `bun --filter @dental/api test cashier.billing`
Expected: PASS (6 it) — helper o'zgarmadi.

- [ ] **Step 10: Commit**

```bash
git add apps/api/src/modules/cashier/cashier.schema.ts apps/api/src/modules/cashier/cashier.service.ts
git commit -m "feat(cashier): allocation create + refund negatsiya + planBalance service"
```

---

## Task 4: `cashier.routes.ts` (plan-balance endpoint) + api-client

**Files:**
- Modify: `apps/api/src/modules/cashier/cashier.routes.ts`
- Modify: `packages/api-client/src/types-m3.ts`
- Modify: `packages/api-client/src/endpoints.ts`

- [ ] **Step 1: Route — `AllocationExceedError` 400 handling (create) + `GET /plan-balance/:planId`**

`apps/api/src/modules/cashier/cashier.routes.ts` import'iga `AllocationExceedError` qo'shing:

```typescript
import { AllocationExceedError, createCashierService } from './cashier.service.ts';
```

Mavjud `POST /transactions` handler'ini o'zgartiring (allocation cheklov xatosini 400 ga aylantirish uchun):

```typescript
  app.post('/transactions', requirePermission('cashier.create_transaction'), async (c) => {
    const body = createTransactionSchema.safeParse(await c.req.json());
    if (!body.success) throw new HTTPException(400, { message: 'Invalid input' });
    try {
      const tx = await service.create(c, body.data);
      return c.json(ok(tx), 201);
    } catch (e) {
      if (e instanceof AllocationExceedError) {
        return c.json(fail('allocations.exceed', 'Allocation sum exceeds paid amount'), 400);
      }
      throw e;
    }
  });
```

`GET /daily-summary` handler'idan **keyin** (`return app;` dan oldin) yangi route qo'shing:

```typescript
  app.get('/plan-balance/:planId', requirePermission('cashier.view'), async (c) => {
    return c.json(ok(await service.planBalance(c, c.req.param('planId'))));
  });
```

- [ ] **Step 2: api-client tiplari — `types-m3.ts`**

`packages/api-client/src/types-m3.ts` da `CashierTransaction` tipiga `patientId` qatoridan **keyin** qo'shing:

```typescript
  treatmentPlanId: string | null;
```

Shu faylga (`CashierTransaction` blokidan keyin, masalan `DailySummary` dan keyin) yangi tiplar qo'shing:

```typescript
export type StageBalance = {
  stageId: string;
  serviceName: string;
  cost: number;
  paid: number;
  remaining: number;
};

export type PlanBalance = {
  totalCost: number;
  totalPaid: number;
  balance: number;
  stages: StageBalance[];
};
```

- [ ] **Step 3: api-client endpoints — `endpoints.ts`**

`packages/api-client/src/endpoints.ts` da `types-m3.ts` import blokiga (`PaymentMethod`/`QueueTicket` yonida) qo'shing:

```typescript
  PlanBalance,
```

(import blok alifbo tartibida: `DailySummary,` dan keyin `PaymentMethod,` dan oldin `PlanBalance,` qo'shing.)

`cashier.create` body tipiga `notes?: string;` dan **keyin** qo'shing:

```typescript
      treatmentPlanId?: string;
      allocations?: Array<{ stageId: string; amount: number }>;
```

`cashier` blokining oxiriga (`dailySummary: ...` dan keyin, `},` dan oldin) yangi method qo'shing:

```typescript
    planBalance: (planId: string) =>
      api.get<PlanBalance>(`/api/cashier/plan-balance/${planId}`),
```

- [ ] **Step 4: Typecheck (api + api-client)**

Run: `bun --filter @dental/api typecheck && bun --filter @dental/api-client typecheck`
Expected: ikkalasi exit 0.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/cashier/cashier.routes.ts packages/api-client/src/types-m3.ts packages/api-client/src/endpoints.ts
git commit -m "feat(cashier): GET /plan-balance endpoint + api-client (create body + planBalance)"
```

---

## Task 5: To'liq verifikatsiya

- [ ] **Step 1: Backend typecheck**

Run: `bun --filter @dental/api typecheck`
Expected: exit 0.

- [ ] **Step 2: api-client typecheck**

Run: `bun --filter @dental/api-client typecheck`
Expected: exit 0.

- [ ] **Step 3: db-schema typecheck**

Run: `bun --filter @dental/db-schema typecheck`
Expected: exit 0.

- [ ] **Step 4: Pure helper unit test**

Run: `bun --filter @dental/api test cashier.billing`
Expected: PASS — 6 it (`computePlanBalance`).

- [ ] **Step 5: RLS coverage lint**

Run: `bun run check:rls`
Expected: exit 0 — `✅ RLS coverage OK`. `treatment_stage_payments` policy bilan; `cashier_transactions` allaqachon RLS (yangi ustun ta'sir qilmaydi).

- [ ] **Step 6: Migration review (yakuniy)**

Run: `cat apps/api/drizzle/0009_*.sql && echo '---RLS---' && cat apps/api/migrations/rls/0007_billing_rls.sql`
Expected: 0009 = `treatment_stage_payments` jadval (3 FK, 2 index) + `cashier_transactions.treatment_plan_id` ustun/FK/index. `treatment_stages` o'zgarmagan. RLS fayl = `ENABLE` + `FORCE` + policy (to'g'ridan-to'g'ri tenant_id).

- [ ] **Step 7: Dev fidelity (inson tekshiradi)**

Lokal migration apply: `bun --filter @dental/api db:migrate` (Drizzle 0009 + RLS 0007 ham apply bo'ladi — `migrate.ts` `migrations/rls/` ni `_rls_migrations` orqali ishlaydi). Keyin manual:
- `POST /api/cashier/transactions` `treatmentPlanId` + `allocations: [{stageId, amount}]` bilan → `treatment_stage_payments` rowlar yoziladi (ijobiy `amount`).
- `Σ allocations > paidAmount` → 400 `allocations.exceed`.
- `GET /api/cashier/plan-balance/:planId` → `{ totalCost, totalPaid, balance, stages: [{stageId, serviceName, cost, paid, remaining}] }`, balans to'g'ri.
- `POST /api/cashier/transactions/:id/refund` (allocation'li tx uchun) → refund tx allocation'lari manfiy (`-amount`), `planBalance` balansni tiklaydi.
- Cross-tenant: boshqa tenant'dan `plan-balance` so'rovi bo'sh/0 qaytaradi (RLS).

- [ ] **Step 8: Push + PR**

```bash
git push -u origin feat/r2-billing
gh pr create --base main --title "R2 — Billing poydevori: treatment-plan to'lov allocation + balans" --body "$(cat <<'EOF'
R2 Billing backend poydevori (Kassa-UI CLI-49 + R3 bemor-balansi shuni iste'mol qiladi).

Backend-only:
- Yangi treatment_stage_payments allocation jadval (tenant-scoped, FORCE RLS) + cashier_transactions.treatment_plan_id FK.
- computePlanBalance sof helper (bun:test, 6 case: per-bosqich/plan/refund-negatsiya/qisman/multi-stage/noma'lum-stage).
- cashier.service: create allocation (Σ ≤ paidAmount, oshsa 400), refund negatsiya (-amount, balans tiklanadi), planBalance (sof o'qish).
- api-client: cashier.create body (treatmentPlanId + allocations) + cashier.planBalance.
- treatment_stages O'ZGARTIRILMADI (Klinik chegarasi).

Spec: docs/superpowers/specs/2026-06-11-r2-billing-foundation-design.md
Plan: docs/superpowers/plans/2026-06-11-r2-billing-foundation.md

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Reja self-review notes

- **Spec coverage:** §1 schema (Task 1 — jadval + FK + migration + qo'lda RLS), §2.1 schema (Task 3 Step 1), §2.2 service create/refund/planBalance (Task 3), §2.3 routes (Task 4 Step 1), §2.4 api-client (Task 4 Step 2–3), §3 refund negatsiya to'g'rilik (Task 3 Step 5 + helper test Task 2), §4 testlar (Task 2 — sof helper, `bun test` deskoupingi yuqorida), §5 verifikatsiya (Task 5). Barchasi qoplangan.
- **RLS bitta taskda:** jadval (db-schema) + RLS fayl (`0007`) + `check:rls` Task 1'da birga — red checkpoint yo'q.
- **Test harness:** `bun test` (vitest emas) — `bun:test` import, `bun --filter @dental/api test cashier.billing`. Yagona unit = sof helper (string kirish, real numeric shakli).
- **Ochiq nuqtalar hal:** RLS qo'lda fayl; `Σ allocations > paidAmount` → 400 `allocations.exceed`; `planBalance` permission = `cashier.view`; numeric → string parse helper ichida.
- **Klinik chegarasi:** `treatment_stages` ustun qo'shilmaydi — allocation jadval orqali; `planBalance` faqat o'qiydi.
- **Type izchillik:** `computePlanBalance` → `PlanBalance`/`StageBalance` (Task 2) ↔ api-client `PlanBalance`/`StageBalance` (Task 4) bir xil shakl. `cashier.planBalance(planId)` (Task 4) ↔ `service.planBalance` (Task 3) ↔ route (Task 4 Step 1) izchil.
- **RLS o'qish:** `planBalance` `treatment_stages` ni `getDb` orqali o'qiydi (0004 RLS plan-subquery orqali himoyalangan) — explicit `WHERE tenant_id` YOZILMAYDI; clinical service allaqachon shu naqshda o'qiydi.
