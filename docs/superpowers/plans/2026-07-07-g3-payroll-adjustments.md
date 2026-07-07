# G3 — Payroll refund reconciliation, Variant A (CLI-446 3-qism) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finalized (immutable) payroll run davriga tushgan tranzaksiyaga refund kelganda, komissiya haqiqiy pasaytirilishi kerak — lekin finalized run'ni tahrirlab bo'lmaydi (Qaror #16, snapshot falsafasi). Yechim (Variant A): yangi `payroll_adjustments` carry-forward jadvali — refund finalized davrga tushsa manfiy "komissiya-ekvivalenti" tuzatish yozadi, keyingi `createRun()` uni avtomatik qo'llaydi (yetarlicha komissiya bo'lsa), `finalizeRun()` qo'llangan qatorlarga muhr bosadi.

**Architecture:**
- Yangi jadval `payroll_adjustments` (`packages/db-schema/src/tables/payroll-adjustments.ts`) — RLS bilan, `packages/db-schema/src/index.ts`dan eksport.
- `cashier.service.ts::refund()` — muvaffaqiyatli refunddan keyin (tx commit bo'lgandan keyin, lekin hali umumiy request-tranzaksiya ichida) narrow DI hook `PayrollAdjustmentHook.recordRefundAdjustment(c, args)` chaqiradi — **faqat plan-linked tranzaksiyada** (`treatmentPlans.doctorId` orqali doktor topiladi; non-plan savdoda payroll attributsiyasi umuman yo'q). Naqsh — `RecallStageHook`/`PriceLookup` bilan bir xil (treatment-plans.service.ts): cashier o'z tipini e'lon qiladi, payroll.service.ts strukturaviy mos funksiya bilan implement qiladi, to'g'ridan import YO'Q.
- `payroll.service.ts::recordRefundAdjustment(c, args)` — refund sanasi (Asia/Tashkent kalendar kuni) qaysi **finalized** run diapazoniga tushishini topadi; topilsa, o'sha run'dagi doktorning **snapshot** `commissionPercent`ini (`payroll_lines`dan) o'qib, `amount = -(refundAmount × percent / 100)` bilan yangi `payroll_adjustments` qatori yozadi. Run topilmasa yoki doktor o'sha run'da komissiya olmagan bo'lsa — no-op (draft davr bo'lsa, mavjud `deleteRun`/`createRun` qayta yaratish orqali tabiiy hisobga olinadi).
- `payroll.service.ts::createRun()` — har eligible profil uchun endi (a) mavjud `computePayrollLine(base, attributedRevenue, percent)` bilan **o'zgarishsiz** xom komissiya (`rawCommission`) hisoblanadi (payroll.calc.ts **tegilmaydi**), (b) o'sha doktor uchun `appliedToRunId IS NULL` bo'lgan `payroll_adjustments` yig'indisi (`adjustmentSum`, odatda manfiy) olinadi, (c) **all-or-nothing**: agar `rawCommission + adjustmentSum >= 0` bo'lsa — TO'LIQ qo'llanadi (`commissionAmount = rawCommission + adjustmentSum`); aks holda — **hech narsa qo'llanmaydi** (`commissionAmount = rawCommission`, adjustment butunlay keyingi runga ko'chadi).
- `payroll.service.ts::finalizeRun()` — run finalized bo'lgandan keyin, shu run'dagi har doktor uchun LIVE qayta hisoblab (`payrollLines`da saqlangan `attributedRevenue`/`commissionPercent`dan `computePayrollLine` bilan `rawCommission` qayta olinadi + joriy `adjustmentSum` qayta so'raladi) — agar TO'LIQ singdirilishi mumkin bo'lsa, o'sha doktorning barcha qo'llanmagan adjustment'lariga `appliedToRunId = run.id` yoziladi (bitta tranzaksiyada, run finalize bilan atomik).

⚠️ **Spec matnidan aniqlangan og'ish (advisor tomonidan tasdiqlangan, MUHIM):** asl audit-fix spec "floor 0 saqlanadi" deb yozgan — bu so'zma-so'z "floor qilib qo'llash" deb o'qilsa, HAQIQIY moliyaviy bug beradi: adjustment −150,000 bo'lsa, floor-va-qo'llash dizaynida run B (raw 50,000) 0'ga floor qilinadi (50,000 chegiriladi, lekin adjustment "qisman qo'llangan" deb belgilanmaydi — binary `appliedToRunId` flag qisman-summani bilmaydi), keyin run C (raw 200,000) yana TO'LIQ −150,000ni qo'llaydi (yana 150,000 chegiriladi) — jami 200,000 chegirilgan, adjustment atigi 150,000 edi (50,000 ortiqcha chegirilgan, doktor zarar ko'radi). **Tuzatish: all-or-nothing per doktor batch** (yuqoridagi Architecture'da yozilgan) — bu bilan run B hech narsa chegirmaydi (adjustment butun holda saqlanadi), run C 200,000−150,000=50,000 (aynan 150,000 chegirilgan, xato yo'q). Bu — CLI-446'ni ushbu spec orqali yopishning bir qismi sifatida qasddan qabul qilingan tuzatish (asl spec matni emas, balki uning niyatiga to'g'ri mos implementatsiya).

⚠️ **Tor, hujjatlashtirilgan race oynasi (hal qilinmaydi, kelajakdagi ticket):** `createRun()` (draft) adjustment yig'indisini FAQAT o'sha paytda hisoblaydi va `payrollLines`ga FROZEN qiymat sifatida yozadi; `finalizeRun()` esa (odatda darhol yoki tez orada chaqiriladi) LIVE qayta so'rov qiladi. Agar aynan shu ikki chaqiruv oralig'ida (juda tor oyna — amaliyotda bitta admin ketma-ket ishlaydi) o'sha DOKTOR uchun YANGI adjustment kelib tushsa, `finalizeRun`ning "singdirilganmi" xulosasi createRun paytidagi frozen qiymatdan farq qilishi mumkin. **Muqobil (qo'llanmagan) dizayn:** `createRun()` paytida DARHOL `appliedToRunId`ni claim qilish + ustun FK'ni `ON DELETE SET NULL` qilish (draft o'chirilsa avtomatik bo'shaydi) — bu race'ni butunlay yo'q qiladi, lekin spec'ning "finalizeRun stempaydi" talabidan chetga chiqadi. Ushbu reja spec'ga sodiq qoladi (finalize-vaqtida stamp) va bu tor oynani ataylab qabul qiladi.

**Tech Stack:** Bun, Hono, Drizzle ORM, PostgreSQL (RLS), Vitest yo'q (bu guruh faqat real-DB integration testlar — sof funksiyalar payroll.calc.ts o'zgarmaydi), `bun test`.

## Global Constraints

- `payroll.calc.ts::computePayrollLine` **o'zgarmaydi** — mavjud floor(0) logikasi xom (pre-adjustment) komissiya uchun ishlatiladi, adjustment undan KEYIN, alohida qo'shiladi.
- Hech qanday `WHERE tenant_id` yozilmaydi — RLS (`getDb(c)`) filtrlaydi (CLAUDE.md §3.4). Yangi jadval `FORCE ROW LEVEL SECURITY` bilan.
- Pul summalari `numeric(14,2)` DB ustunlari, JS'da `Number()`/`String()` bilan.
- DI hook naqsh — `RecallStageHook`/`PriceLookup` bilan bir xil (treatment-plans.service.ts, cashier.service.ts): consumer (`cashier.service.ts`) o'z tipini e'lon qiladi, producer (`payroll.service.ts`) to'g'ridan import qilmasdan strukturaviy mos funksiya bilan implement qiladi.
- Integration testlar real DB (`bun test --env-file=../../.env`), `noopAudit` (mock/spy audit YO'Q).
- `cashier.service.ts::refund()`ning tashqi qaytarish tipi (`{ok:true, refund} | {ok:false, reason}`) **o'zgarmaydi** — `cashier.routes.ts`dagi route handlerlar tegilmaydi (faqat deps signature + ichki wiring o'zgaradi).

---

### Task 1: `payroll_adjustments` jadvali — schema + RLS migratsiya

**Files:**
- Create: `packages/db-schema/src/tables/payroll-adjustments.ts`
- Modify: `packages/db-schema/src/index.ts`
- Generate: `apps/api/drizzle/00XX_<avtomatik-nom>.sql` (drizzle-kit avtomatik generatsiya qiladi)
- Create: `apps/api/migrations/rls/0017_payroll_adjustments_rls.sql`

**Interfaces:**
- Produces: `payrollAdjustments` Drizzle table + `PayrollAdjustment` tip — Task 2 shularni import qiladi (`payroll.service.ts`).

- [ ] **Step 1: Schema fayli yozish**

`packages/db-schema/src/tables/payroll-adjustments.ts` (yangi fayl):

```ts
import { sql } from 'drizzle-orm';
import { index, numeric, pgTable, timestamp, uuid } from 'drizzle-orm/pg-core';
import { branches } from './branches.ts';
import { cashierTransactions } from './cashier.ts';
import { payrollRuns } from './payroll-runs.ts';
import { tenants } from './tenants.ts';
import { users } from './users.ts';

/**
 * CLI-446 G3 (Variant A) — payroll refund reconciliation carry-forward jadvali.
 * Finalized (immutable) payroll run davriga tushgan refund uchun komissiya
 * tuzatishi shu yerda saqlanadi (finalized run'ni tahrirlab bo'lmaydi — Qaror #16
 * snapshot falsafasi). `cashier.service.ts::refund()` yozadi (faqat finalized
 * davrga tushsa); `payroll.service.ts::createRun()` qo'llanmagan
 * (`appliedToRunId IS NULL`) qatorlarni yig'ib komissiyaga qo'shadi (all-or-nothing
 * — floor tufayli to'liq singdirib bo'lmasa, HECH NARSA qo'llanmaydi, butun holda
 * keyingi runga ko'chadi); `finalizeRun()` qo'llangan qatorlarga `appliedToRunId`
 * yozadi.
 */
export const payrollAdjustments = pgTable(
  'payroll_adjustments',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    branchId: uuid('branch_id')
      .notNull()
      .references(() => branches.id, { onDelete: 'cascade' }),
    doctorId: uuid('doctor_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    sourceTransactionId: uuid('source_transaction_id')
      .notNull()
      .references(() => cashierTransactions.id, { onDelete: 'restrict' }),
    // Manfiy komissiya-ekvivalenti tuzatish (refundAmount × asl finalized run'dagi
    // payroll_lines.commissionPercent snapshot foizi / 100).
    amount: numeric('amount', { precision: 14, scale: 2 }).notNull(),
    // NULL = hali qo'llanmagan (kandidat). finalizeRun() to'liq singdirilsa yozadi.
    appliedToRunId: uuid('applied_to_run_id').references(() => payrollRuns.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('payroll_adjustments_tenant_doctor_idx').on(t.tenantId, t.doctorId),
    index('payroll_adjustments_unapplied_idx').on(t.doctorId, t.appliedToRunId),
  ],
);

export type PayrollAdjustment = typeof payrollAdjustments.$inferSelect;
```

- [ ] **Step 2: `packages/db-schema/src/index.ts`ga eksport qo'shish**

Eski (alifbo tartibida `payroll-lines.ts`dan oldin):

```ts
export * from './tables/patients.ts';
export * from './tables/payroll-lines.ts';
export * from './tables/payroll-runs.ts';
```

Yangi:

```ts
export * from './tables/patients.ts';
export * from './tables/payroll-adjustments.ts';
export * from './tables/payroll-lines.ts';
export * from './tables/payroll-runs.ts';
```

- [ ] **Step 3: Drizzle migratsiya generatsiya qilish**

Run: `cd apps/api && bun run db:generate`
Expected: yangi fayl `apps/api/drizzle/00XX_<tasodifiy-nom>.sql` yaratiladi (drizzle-kit nomni avtomatik tanlaydi — implementatsiya paytida `git status` yoki `ls apps/api/drizzle/*.sql | tail -1` bilan aniq nomni toping), tarkibida `CREATE TABLE "payroll_adjustments" (...)` + FK constraint'lar + 2 index. `apps/api/drizzle/meta/_journal.json` va yangi `meta/00XX_snapshot.json` ham yangilanadi.

- [ ] **Step 4: RLS SQL fayli yozish**

`apps/api/migrations/rls/0017_payroll_adjustments_rls.sql` (yangi fayl):

```sql
-- ===== PAYROLL_ADJUSTMENTS =====
ALTER TABLE payroll_adjustments ENABLE ROW LEVEL SECURITY;
ALTER TABLE payroll_adjustments FORCE ROW LEVEL SECURITY;
CREATE POLICY payroll_adjustments_tenant_isolation ON payroll_adjustments
  USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
```

- [ ] **Step 5: Migratsiyani local DB'ga qo'llash**

Run: `cd apps/api && bun run db:migrate`
Expected: drizzle migration + RLS SQL (idempotent, `_rls_migrations` jadvalida kuzatiladi) xatosiz qo'llanadi. Log'da `payroll_adjustments` jadvali yaratilgani va RLS yoqilgani ko'rinadi.

- [ ] **Step 6: RLS coverage CI lint tekshiruvi**

Run: `cd /home/madrimov/Projects/dental-service && bun run scripts/check-rls-coverage.ts`
Expected: `✅ RLS coverage OK — N ta tenant-scoped jadval policy bilan` (xato yo'q, `payroll_adjustments` `missing`/`missingForce` ro'yxatida yo'q).

- [ ] **Step 7: Typecheck**

Run: `cd packages/db-schema && bun run typecheck` (yoki repo-root `turbo run typecheck --filter=@dental/db-schema`)
Expected: 0 xato.

- [ ] **Step 8: Commit**

```bash
git add packages/db-schema/src/tables/payroll-adjustments.ts packages/db-schema/src/index.ts apps/api/drizzle apps/api/migrations/rls/0017_payroll_adjustments_rls.sql
git commit -m "feat(db): CLI-446 G3 — payroll_adjustments jadvali (RLS bilan)"
```

---

### Task 2: `recordRefundAdjustment` + `createRun`/`finalizeRun` carry-forward + cashier refund hook

**Files:**
- Modify: `apps/api/src/modules/payroll/payroll.service.ts` (import bloki, `createRun` :104-151, `finalizeRun` :204-238, yangi `recordRefundAdjustment` funksiyasi, return obyekti :274)
- Modify: `apps/api/src/modules/cashier/cashier.service.ts` (import kerak emas — mavjud, yangi `PayrollAdjustmentHook` tipi :65 dan keyin, `createCashierService` deps :67-71, `refund()` :311-429 to'liq)
- Modify: `apps/api/src/modules/cashier/cashier.routes.ts` (import :26-32, `cashierRoutes` deps + wiring :42-58)
- Modify: `apps/api/src/app.ts` (import :29, `priceLookup` yonida yangi instance :62-69, cashier mount :144)
- Test: yangi `apps/api/tests/integration/cli-446-payroll-adjustments.test.ts`

**Interfaces:**
- Produces: `payroll.service.ts::recordRefundAdjustment(c, args): Promise<void>` — `cashier.service.ts`dagi `PayrollAdjustmentHook.recordRefundAdjustment` tipiga strukturaviy mos (to'g'ridan import YO'Q).
- Produces: `cashier.service.ts::PayrollAdjustmentHook` tipi — `cashier.routes.ts` va `app.ts` shuni ishlatadi (wiring uchun, lekin structural typing tufayli `app.ts` uni import qilishi SHART EMAS — `recall`/`priceLookup` bilan bir xil naqsh).
- Consumes (Task 1): `payrollAdjustments` jadval + `PayrollAdjustment` tip.

- [ ] **Step 1: Write the failing integration test**

`apps/api/tests/integration/cli-446-payroll-adjustments.test.ts` (yangi fayl):

```ts
/**
 * CLI-446 G3 — payroll refund reconciliation (Variant A, payroll_adjustments
 * carry-forward). Real DB, sequential oy davrlar (Yan→Fev→Mar→Apr) bitta doktor
 * ustida: refund finalized davrga tushsa adjustment yaratiladi (T1); keyingi run
 * floor tufayli to'liq singdira olmasa — HECH QANDAY chegirim qo'llanmaydi va
 * adjustment o'zgarishsiz qoladi (T2, all-or-nothing — "qoplanmagan qoldiq
 * keyingi-keyingi runga ko'chadi"); keyingi-keyingi run yetarli komissiya bilan
 * TO'LIQ singdiradi va appliedToRunId yozadi (T3); undan keyingi run adjustmentni
 * IKKINCHI MARTA qo'llamaydi (T4).
 *
 * Ishga tushirish (yolg'iz — TRUNCATE poygasi):
 *   cd apps/api && bun test tests/integration/cli-446-payroll-adjustments.test.ts --env-file=../../.env
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import {
  branches,
  cashierTransactions,
  patients,
  payrollAdjustments,
  staffProfiles,
  tenants,
  treatmentPlans,
  users,
} from '@dental/db-schema';
import { eq, sql } from 'drizzle-orm';
import type { Context } from 'hono';
import type { DbOrTx } from '../../src/db/client.ts';
import { db } from '../../src/db/client.ts';
import type { AuditLogger } from '../../src/lib/audit-logger.ts';
import { createCashierService } from '../../src/modules/cashier/cashier.service.ts';
import { createPayrollService } from '../../src/modules/payroll/payroll.service.ts';

const noopAudit = { record: async () => {} } as unknown as AuditLogger;
const payrollService = createPayrollService({ audit: noopAudit });
const cashier = createCashierService({ audit: noopAudit, payrollAdjustment: payrollService });

const ctx = (tx: DbOrTx, tenantId: string, userId: string): Context =>
  ({
    get: (k: string) =>
      k === 'db'
        ? tx
        : k === 'activeTenantId'
          ? tenantId
          : k === 'user'
            ? { id: userId }
            : k === 'accessClaims'
              ? { perms: ['@owner'] }
              : undefined,
  }) as unknown as Context;

let tenantId: string;
let ownerId: string;
let doctorId: string;
let branchId: string;
let patientId: string;
let planId: string;

beforeAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);

  const [owner] = await db
    .insert(users)
    .values({ phone: '+998900000060', passwordHash: 'fake', fullName: 'Owner CLI446' })
    .returning({ id: users.id });
  const [doctor] = await db
    .insert(users)
    .values({ phone: '+998900000061', passwordHash: 'fake', fullName: 'Doctor CLI446' })
    .returning({ id: users.id });
  if (!owner || !doctor) throw new Error('user insert failed');
  ownerId = owner.id;
  doctorId = doctor.id;

  const [tenant] = await db
    .insert(tenants)
    .values({ name: 'CLI-446 Clinic', slug: 'cli-446-clinic', ownerUserId: ownerId })
    .returning({ id: tenants.id });
  if (!tenant) throw new Error('tenant insert failed');
  tenantId = tenant.id;

  await db.transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));

    const [branch] = await tx
      .insert(branches)
      .values({ tenantId, name: 'CLI-446 Branch' })
      .returning({ id: branches.id });
    if (!branch) throw new Error('branch insert failed');
    branchId = branch.id;

    await tx.insert(staffProfiles).values({
      tenantId,
      userId: doctorId,
      employmentStatus: 'active',
      baseSalary: '400000',
      commissionPercent: '10',
    });

    const [patient] = await tx
      .insert(patients)
      .values({ tenantId, fullName: 'CLI-446 Patient' })
      .returning({ id: patients.id });
    if (!patient) throw new Error('patient insert failed');
    patientId = patient.id;

    const [plan] = await tx
      .insert(treatmentPlans)
      .values({
        tenantId,
        patientId,
        doctorId,
        title: 'CLI-446 Plan',
        status: 'in_progress',
      })
      .returning({ id: treatmentPlans.id });
    if (!plan) throw new Error('plan insert failed');
    planId = plan.id;
  });
});

afterAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
});

describe('CLI-446 G3 — payroll_adjustments carry-forward', () => {
  let janTxId: string;

  test('Tayyorgarlik: Yanvar (2026-01) — 1,000,000 daromad, run finalized', async () => {
    await db.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));

      const [tx1] = await tx
        .insert(cashierTransactions)
        .values({
          tenantId,
          branchId,
          patientId,
          treatmentPlanId: planId,
          totalAmount: '1000000',
          paidAmount: '1000000',
          paymentMethod: 'cash',
          type: 'payment',
          status: 'completed',
          createdAt: new Date('2026-01-10T10:00:00+05:00'),
        })
        .returning({ id: cashierTransactions.id });
      if (!tx1) throw new Error('tx insert failed');
      janTxId = tx1.id;

      const janRun = await payrollService.createRun(ctx(tx, tenantId, ownerId), {
        periodFrom: '2026-01-01',
        periodTo: '2026-01-31',
      });
      const janLine = janRun.lines.find((l) => l.userId === doctorId);
      expect(Number(janLine?.commissionAmount)).toBe(100000); // 1,000,000 × 10%

      const finalized = await payrollService.finalizeRun(ctx(tx, tenantId, ownerId), janRun.id);
      expect(finalized.run?.status).toBe('finalized');
    });
  });

  test("T1: Yanvar tranzaksiyasi (finalized davr) 500,000ga refund qilinsa — payroll_adjustment yaratiladi (-50,000)", async () => {
    await db.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
      const c = ctx(tx, tenantId, ownerId);

      const refundResult = await cashier.refund(c, janTxId, 500000);
      expect(refundResult.ok).toBe(true);

      const rows = await tx
        .select()
        .from(payrollAdjustments)
        .where(eq(payrollAdjustments.doctorId, doctorId));
      expect(rows).toHaveLength(1);
      expect(Number(rows[0]?.amount)).toBe(-50000); // 500,000 × 10% (Yanvar snapshot foizi)
      expect(rows[0]?.appliedToRunId).toBeNull();
      expect(rows[0]?.sourceTransactionId).toBe(refundResult.ok ? refundResult.refund.id : '');
    });
  });

  test("T2 (all-or-nothing): Fevral (0 daromad) — rawCommission(0)+adjustment(-50,000)<0 → HECH NARSA qo'llanmaydi, adjustment o'zgarishsiz qoladi", async () => {
    await db.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
      const c = ctx(tx, tenantId, ownerId);

      const febRun = await payrollService.createRun(c, {
        periodFrom: '2026-02-01',
        periodTo: '2026-02-28',
      });
      const febLine = febRun.lines.find((l) => l.userId === doctorId);
      expect(Number(febLine?.commissionAmount)).toBe(0);

      await payrollService.finalizeRun(c, febRun.id);

      const [adj] = await tx
        .select()
        .from(payrollAdjustments)
        .where(eq(payrollAdjustments.doctorId, doctorId));
      // Muhim: hali ham qo'llanmagan — floor to'liq singdirilishiga yo'l qo'ymadi,
      // shuning uchun adjustment BUTUN HOLDA keyingi-keyingi runga ko'chadi.
      expect(adj?.appliedToRunId).toBeNull();
    });
  });

  test("T3: Mart (1,000,000 daromad) — rawCommission(100,000)+adjustment(-50,000)=50,000≥0 → TO'LIQ singdiriladi, appliedToRunId yoziladi", async () => {
    await db.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
      const c = ctx(tx, tenantId, ownerId);

      await tx.insert(cashierTransactions).values({
        tenantId,
        branchId,
        patientId,
        treatmentPlanId: planId,
        totalAmount: '1000000',
        paidAmount: '1000000',
        paymentMethod: 'cash',
        type: 'payment',
        status: 'completed',
        createdAt: new Date('2026-03-10T10:00:00+05:00'),
      });

      const marRun = await payrollService.createRun(c, {
        periodFrom: '2026-03-01',
        periodTo: '2026-03-31',
      });
      const marLine = marRun.lines.find((l) => l.userId === doctorId);
      expect(Number(marLine?.commissionAmount)).toBe(50000); // 100,000 − 50,000

      await payrollService.finalizeRun(c, marRun.id);

      const [adj] = await tx
        .select()
        .from(payrollAdjustments)
        .where(eq(payrollAdjustments.doctorId, doctorId));
      expect(adj?.appliedToRunId).toBe(marRun.id);
    });
  });

  test("T4: Aprel (1,000,000 daromad) — adjustment ALLAQACHON qo'llangan, IKKINCHI MARTA chegirilmaydi", async () => {
    await db.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
      const c = ctx(tx, tenantId, ownerId);

      await tx.insert(cashierTransactions).values({
        tenantId,
        branchId,
        patientId,
        treatmentPlanId: planId,
        totalAmount: '1000000',
        paidAmount: '1000000',
        paymentMethod: 'cash',
        type: 'payment',
        status: 'completed',
        createdAt: new Date('2026-04-10T10:00:00+05:00'),
      });

      const aprRun = await payrollService.createRun(c, {
        periodFrom: '2026-04-01',
        periodTo: '2026-04-30',
      });
      const aprLine = aprRun.lines.find((l) => l.userId === doctorId);
      expect(Number(aprLine?.commissionAmount)).toBe(100000); // to'liq, chegirimsiz (ikki marta emas)
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && bun test tests/integration/cli-446-payroll-adjustments.test.ts --env-file=../../.env`
Expected: FAIL — import xatosi (`payrollAdjustments` `@dental/db-schema`dan topilmasa Task 1 bajarilmagan bo'lsa) YOKI `createCashierService({..., payrollAdjustment: ...})` TypeScript xatosi (property mavjud emas) YOKI `T1` testida `rows` bo'sh massiv (`recordRefundAdjustment` hali chaqirilmagan).

- [ ] **Step 3: `payroll.service.ts` — import bloki yangilash**

Eski:

```ts
import {
  cashierTransactions,
  payrollLines,
  payrollRuns,
  staffProfiles,
  treatmentPlans,
} from '@dental/db-schema';
import { and, desc, eq, gte, inArray, lt, sql } from 'drizzle-orm';
```

Yangi:

```ts
import {
  cashierTransactions,
  payrollAdjustments,
  payrollLines,
  payrollRuns,
  staffProfiles,
  treatmentPlans,
} from '@dental/db-schema';
import { and, desc, eq, gte, inArray, isNull, lt, sql } from 'drizzle-orm';
```

- [ ] **Step 4: `payroll.service.ts::createRun` — adjustment carry-forward**

Eski (profillar yig'ilgandan keyin, "4. Har eligible profil..." bloki):

```ts
        const profiles = [...activeProfiles, ...inactiveEarning];

        // 4. Har eligible profil uchun snapshot qator (0-daromad profillar ham kiritiladi).
        const lines = [];
        for (const p of profiles) {
          const base = Number(p.baseSalary);
          const percent = Number(p.commissionPercent);
          const attributedRevenue = revByDoctor.get(p.userId) ?? 0;
          const { commissionAmount, total } = computePayrollLine(base, attributedRevenue, percent);

          const [line] = await tx
            .insert(payrollLines)
            .values({
              tenantId,
              runId: run.id,
              userId: p.userId,
              baseSalary: p.baseSalary,
              attributedRevenue: String(attributedRevenue),
              commissionPercent: p.commissionPercent,
              commissionAmount: String(commissionAmount),
              total: String(total),
            })
            .returning();
          if (line) lines.push(line);
        }
```

Yangi:

```ts
        const profiles = [...activeProfiles, ...inactiveEarning];

        // 3.5 (CLI-446 G3): shu profillar uchun qo'llanmagan (`appliedToRunId IS NULL`)
        // payroll_adjustments yig'indisi — komissiyaga qo'shiladi. ALL-OR-NOTHING per
        // doktor: agar rawCommission+adjustmentSum manfiy chiqsa, BU RUN'DA HECH NARSA
        // qo'llanmaydi — adjustment BUTUNLAY keyingi runga ko'chadi (qisman-clip YO'Q).
        // Sabab: `appliedToRunId` binary flag, qisman-summa maydoni yo'q — floor bilan
        // clip qilib qoldiqni "hali ham qo'llanmagan" deb qoldirsak ham, keyingi run
        // xuddi shu adjustmentni yana TO'LIQ hisobga olib ikki marta chegirgan bo'lardi
        // (over-clawback). All-or-nothing shu xatoning oldini oladi.
        const profileUserIds = profiles.map((p) => p.userId).filter((id): id is string => !!id);
        const unappliedAdjRows =
          profileUserIds.length > 0
            ? await tx
                .select({
                  doctorId: payrollAdjustments.doctorId,
                  sum: sql<string>`COALESCE(SUM(${payrollAdjustments.amount}), 0)`,
                })
                .from(payrollAdjustments)
                .where(
                  and(
                    inArray(payrollAdjustments.doctorId, profileUserIds),
                    isNull(payrollAdjustments.appliedToRunId),
                  ),
                )
                .groupBy(payrollAdjustments.doctorId)
            : [];
        const unappliedAdjByDoctor = new Map(
          unappliedAdjRows.map((r) => [r.doctorId, Number(r.sum)]),
        );

        // 4. Har eligible profil uchun snapshot qator (0-daromad profillar ham kiritiladi).
        const lines = [];
        for (const p of profiles) {
          const base = Number(p.baseSalary);
          const percent = Number(p.commissionPercent);
          const attributedRevenue = revByDoctor.get(p.userId) ?? 0;
          const { commissionAmount: rawCommission } = computePayrollLine(
            base,
            attributedRevenue,
            percent,
          );

          // CLI-446 G3: adjustment faqat TO'LIQ singdirilsa qo'llanadi (all-or-nothing).
          const adjustmentSum = unappliedAdjByDoctor.get(p.userId) ?? 0;
          const absorbable = rawCommission + adjustmentSum >= 0;
          const commissionAmount = absorbable ? rawCommission + adjustmentSum : rawCommission;
          const total = Math.max(0, base + commissionAmount);

          const [line] = await tx
            .insert(payrollLines)
            .values({
              tenantId,
              runId: run.id,
              userId: p.userId,
              baseSalary: p.baseSalary,
              attributedRevenue: String(attributedRevenue),
              commissionPercent: p.commissionPercent,
              commissionAmount: String(commissionAmount),
              total: String(total),
            })
            .returning();
          if (line) lines.push(line);
        }
```

- [ ] **Step 5: `payroll.service.ts::finalizeRun` — qo'llangan adjustment'larga muhr bosish**

Eski:

```ts
  async function finalizeRun(c: Context, runId: string) {
    const db = getDb(c);
    const tenantId = c.get('activeTenantId');
    if (!tenantId) throw new Error('No tenant context');

    // CLI-417: transaksiya + qator qulfi (FOR UPDATE) — ikki parallel finalize ikkalasi
    // ham `draft` ko'rib double-finalize qilishining oldini oladi (TOCTOU).
    return db.transaction(async (tx) => {
      await tx.execute(sql`SELECT set_config('app.current_tenant_id', ${tenantId}, true)`);

      const [run] = await tx
        .select()
        .from(payrollRuns)
        .where(eq(payrollRuns.id, runId))
        .for('update');
      if (!run) return { run: null, error: 'not_found' as const };
      if (run.status !== 'draft') return { run: null, error: 'not_draft' as const };

      const [updated] = await tx
        .update(payrollRuns)
        .set({ status: 'finalized' })
        .where(eq(payrollRuns.id, runId))
        .returning();

      await deps.audit.record(c, {
        action: 'finalized',
        resourceType: 'payroll_run',
        resourceId: runId,
        before: run,
        after: updated,
      });

      return { run: updated ?? null, error: null };
    });
  }
```

Yangi:

```ts
  async function finalizeRun(c: Context, runId: string) {
    const db = getDb(c);
    const tenantId = c.get('activeTenantId');
    if (!tenantId) throw new Error('No tenant context');

    // CLI-417: transaksiya + qator qulfi (FOR UPDATE) — ikki parallel finalize ikkalasi
    // ham `draft` ko'rib double-finalize qilishining oldini oladi (TOCTOU).
    return db.transaction(async (tx) => {
      await tx.execute(sql`SELECT set_config('app.current_tenant_id', ${tenantId}, true)`);

      const [run] = await tx
        .select()
        .from(payrollRuns)
        .where(eq(payrollRuns.id, runId))
        .for('update');
      if (!run) return { run: null, error: 'not_found' as const };
      if (run.status !== 'draft') return { run: null, error: 'not_draft' as const };

      const [updated] = await tx
        .update(payrollRuns)
        .set({ status: 'finalized' })
        .where(eq(payrollRuns.id, runId))
        .returning();

      // CLI-446 G3: shu run'dagi har doktor uchun — qo'llanmagan payroll_adjustments
      // TO'LIQ singdirilishi mumkin bo'lsa (createRun'dagi bir xil all-or-nothing shart,
      // LIVE qayta hisoblangan: `payrollLines`da saqlangan `attributedRevenue`/
      // `commissionPercent`dan `computePayrollLine` bilan xom komissiya qayta olinadi +
      // joriy qo'llanmagan adjustment yig'indisi qayta so'raladi) — `appliedToRunId`ga
      // shu run yoziladi.
      // ⚠️ Tor race oynasi (hujjatlashtirilgan, hal qilinmaydi): agar aynan
      // createRun→finalizeRun oralig'ida shu doktor uchun YANGI adjustment kelsa,
      // LIVE qayta hisob createRun paytidagi FROZEN qiymatdan farq qilishi mumkin
      // (amaliyotda juda tor oyna — bitta admin ketma-ket ishlaydi). Muqobil dizayn:
      // createRun paytida darhol stamp + `appliedToRunId` FK `ON DELETE SET NULL`
      // (draft delete'da avtomatik bo'shaydi) — bu yerda QO'LLANMAYDI (spec'ning
      // "finalizeRun stempaydi" talabiga sodiq qolamiz).
      const lines = await tx
        .select({
          userId: payrollLines.userId,
          baseSalary: payrollLines.baseSalary,
          attributedRevenue: payrollLines.attributedRevenue,
          commissionPercent: payrollLines.commissionPercent,
        })
        .from(payrollLines)
        .where(eq(payrollLines.runId, runId));

      const doctorIds = lines.map((l) => l.userId).filter((id): id is string => !!id);
      if (doctorIds.length > 0) {
        const unappliedAdjRows = await tx
          .select({
            doctorId: payrollAdjustments.doctorId,
            sum: sql<string>`COALESCE(SUM(${payrollAdjustments.amount}), 0)`,
          })
          .from(payrollAdjustments)
          .where(
            and(
              inArray(payrollAdjustments.doctorId, doctorIds),
              isNull(payrollAdjustments.appliedToRunId),
            ),
          )
          .groupBy(payrollAdjustments.doctorId);
        const unappliedAdjByDoctor = new Map(
          unappliedAdjRows.map((r) => [r.doctorId, Number(r.sum)]),
        );

        const absorbableDoctorIds = lines
          .filter((l) => {
            if (!l.userId) return false;
            const adjustmentSum = unappliedAdjByDoctor.get(l.userId) ?? 0;
            if (adjustmentSum === 0) return false; // qo'llanmagan adjustment yo'q
            const { commissionAmount: rawCommission } = computePayrollLine(
              Number(l.baseSalary),
              Number(l.attributedRevenue),
              Number(l.commissionPercent),
            );
            return rawCommission + adjustmentSum >= 0;
          })
          .map((l) => l.userId as string);

        if (absorbableDoctorIds.length > 0) {
          await tx
            .update(payrollAdjustments)
            .set({ appliedToRunId: runId })
            .where(
              and(
                inArray(payrollAdjustments.doctorId, absorbableDoctorIds),
                isNull(payrollAdjustments.appliedToRunId),
              ),
            );
        }
      }

      await deps.audit.record(c, {
        action: 'finalized',
        resourceType: 'payroll_run',
        resourceId: runId,
        before: run,
        after: updated,
      });

      return { run: updated ?? null, error: null };
    });
  }
```

- [ ] **Step 6: `payroll.service.ts` — yangi `recordRefundAdjustment` funksiyasi + return obyekti**

Eski (fayl oxiri):

```ts
  return { createRun, listRuns, getRun, finalizeRun, deleteRun };
};

export type PayrollService = ReturnType<typeof createPayrollService>;
```

Yangi — `deleteRun`dan keyin, `return` qatoridan OLDIN yangi funksiya qo'shiladi:

```ts
  /**
   * CLI-446 G3: `cashier.service.ts::refund()`dan chaqiriladigan narrow DI hook
   * (recall/priceLookup pattern — cashier o'zining `PayrollAdjustmentHook` tipini
   * mustaqil e'lon qiladi, bu yerda faqat strukturaviy mos funksiya bor, to'g'ridan
   * import YO'Q). Faqat FINALIZED run diapazoniga tushgan refund uchun adjustment
   * yozadi — draft davr qo'lda o'chirib qayta yaratilishi mumkin (CLI-417
   * `deleteRun`), refund shu bilan tabiiy hisobga olinadi.
   */
  async function recordRefundAdjustment(
    c: Context,
    args: {
      doctorId: string;
      branchId: string;
      sourceTransactionId: string;
      refundAmount: number;
      transactionCreatedAt: Date;
    },
  ): Promise<void> {
    const db = getDb(c);
    const tenantId = c.get('activeTenantId');
    if (!tenantId) throw new Error('No tenant context');

    // Asia/Tashkent (UTC+5, DST yo'q) kalendar kuni — createRun'dagi start/end
    // hisoblash metodologiyasi bilan izchil (teskari yo'nalish: timestamptz → sana).
    const tashkentDateStr = new Date(args.transactionCreatedAt.getTime() + 5 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);

    const [run] = await db
      .select({ id: payrollRuns.id })
      .from(payrollRuns)
      .where(
        and(
          eq(payrollRuns.status, 'finalized'),
          sql`daterange(${payrollRuns.periodFrom}, ${payrollRuns.periodTo}, '[]') @> ${tashkentDateStr}::date`,
        ),
      )
      .limit(1);
    if (!run) return; // finalized davrga tushmagan — draft qayta yaratilganda tabiiy hisobga olinadi.

    const [line] = await db
      .select({ commissionPercent: payrollLines.commissionPercent })
      .from(payrollLines)
      .where(and(eq(payrollLines.runId, run.id), eq(payrollLines.userId, args.doctorId)));
    if (!line) return; // doktor shu run'da komissiya olmagan — tuzatish hisoblab bo'lmaydi.

    const percent = Number(line.commissionPercent);
    const amount = -(Math.round(args.refundAmount * percent) / 100);

    await db.insert(payrollAdjustments).values({
      tenantId,
      branchId: args.branchId,
      doctorId: args.doctorId,
      sourceTransactionId: args.sourceTransactionId,
      amount: String(amount),
    });
  }

  return { createRun, listRuns, getRun, finalizeRun, deleteRun, recordRefundAdjustment };
};

export type PayrollService = ReturnType<typeof createPayrollService>;
```

- [ ] **Step 7: `cashier.service.ts` — `PayrollAdjustmentHook` tipi + deps**

Eski (`PriceLookup` tipidan keyin):

```ts
export type PriceLookup = {
  getActivePrice: (
    c: Context,
    serviceId: string,
    branchId: string,
  ) => Promise<{ price: string } | null>;
};

export const createCashierService = (deps: {
  audit: AuditLogger;
  fiscal?: FiscalProvider;
  priceLookup?: PriceLookup;
}) => {
```

Yangi:

```ts
export type PriceLookup = {
  getActivePrice: (
    c: Context,
    serviceId: string,
    branchId: string,
  ) => Promise<{ price: string } | null>;
};

/**
 * CLI-446 G3: narrow DI hook (recall/priceLookup pattern bilan bir xil) — payroll
 * modulidan inject qilinadi. Refund finalized payroll davriga tushsa, keyingi run
 * uchun carry-forward komissiya tuzatish yozadi (`payroll_adjustments`). Bog'liqlik
 * yo'nalishi: cashier → payroll (factory injection, to'g'ridan import emas).
 */
export type PayrollAdjustmentHook = {
  recordRefundAdjustment: (
    c: Context,
    args: {
      doctorId: string;
      branchId: string;
      sourceTransactionId: string;
      refundAmount: number;
      transactionCreatedAt: Date;
    },
  ) => Promise<void>;
};

export const createCashierService = (deps: {
  audit: AuditLogger;
  fiscal?: FiscalProvider;
  priceLookup?: PriceLookup;
  /** CLI-446 G3: refund finalized payroll davriga tushsa carry-forward tuzatish yozish uchun. */
  payrollAdjustment?: PayrollAdjustmentHook;
}) => {
```

- [ ] **Step 8: `cashier.service.ts::refund()` — to'liq almashtirish**

Eski (butun funksiya, `async function refund(...)` dan yopuvchi qavsgacha):

```ts
  async function refund(
    c: Context,
    id: string,
    amount?: number,
  ): Promise<
    | { ok: true; refund: typeof cashierTransactions.$inferSelect }
    | { ok: false; reason: 'invalid' | 'over_refund' | 'non_plan_partial' }
  > {
    const db = getDb(c);

    return await db.transaction(async (tx) => {
      // Row-lock: ikki parallel refund poygasini oldini olish (TOCTOU). Guard tx ichida.
      const [original] = await tx
        .select()
        .from(cashierTransactions)
        .where(eq(cashierTransactions.id, id))
        .for('update');
      if (!original) return { ok: false as const, reason: 'invalid' as const };
      // Refund of refund yoki allaqachon void qilingan — RAD.
      if (original.type === 'refund' || original.status === 'voided') {
        return { ok: false as const, reason: 'invalid' as const };
      }

      const paid = Number(original.paidAmount);

      // Allaqachon qaytarilgan summa (shu parentning refund row'lari).
      const [refundedRow] = await tx
        .select({ sum: sql<string>`COALESCE(SUM(${cashierTransactions.paidAmount}), 0)` })
        .from(cashierTransactions)
        .where(
          and(
            eq(cashierTransactions.parentTransactionId, id),
            eq(cashierTransactions.type, 'refund'),
          ),
        );
      const alreadyRefunded = Number(refundedRow?.sum ?? 0);
      const remaining = paid - alreadyRefunded;

      const refundAmount = amount ?? remaining;
      if (!(refundAmount > 0)) return { ok: false as const, reason: 'invalid' as const };
      if (refundAmount > remaining) return { ok: false as const, reason: 'over_refund' as const };

      // Qisman (yoki ketma-ket) refund — faqat plan-linked.
      const isPartial = refundAmount < paid;
      if (!original.treatmentPlanId && (isPartial || alreadyRefunded > 0)) {
        return { ok: false as const, reason: 'non_plan_partial' as const };
      }

      const refundSeq =
        (
          await tx
            .select({ c: count() })
            .from(cashierTransactions)
            .where(
              and(
                eq(cashierTransactions.parentTransactionId, id),
                eq(cashierTransactions.type, 'refund'),
              ),
            )
        )[0]?.c ?? 0;

      const [refundTx] = await tx
        .insert(cashierTransactions)
        .values({
          tenantId: original.tenantId,
          branchId: original.branchId,
          patientId: original.patientId,
          treatmentPlanId: original.treatmentPlanId,
          receiptNumber: `${original.receiptNumber}-R${refundSeq + 1}`,
          totalAmount: String(refundAmount),
          paidAmount: String(refundAmount),
          discount: '0',
          paymentMethod: original.paymentMethod,
          type: 'refund',
          parentTransactionId: id,
          status: 'completed',
          notes: `Refund of ${original.receiptNumber}${isPartial ? ` (${refundAmount})` : ''}`,
          createdBy: c.get('user')?.id ?? null,
        })
        .returning();
      if (!refundTx) return { ok: false as const, reason: 'invalid' as const };

      // Asl allocation'larni PROPORSIONAL negatsiya (balansni tiklaydi). Proporsional
      // bo'lgani uchun har bosqich uchun Σ negatsiya ≤ asl allocation (phantom-credit yo'q).
      const origAllocations = await tx
        .select({ stageId: treatmentStagePayments.stageId, amount: treatmentStagePayments.amount })
        .from(treatmentStagePayments)
        .where(eq(treatmentStagePayments.transactionId, id));

      if (origAllocations.length > 0) {
        // CLI-418: 2dp yaxlitlash + residue true-up (Σ negatsiya aynan proporsional
        // maqsad — kasr drift yo'q). `factor` inline ko'paytirish o'rniga sof helper.
        const negations = distributeRefundNegations(origAllocations, refundAmount, paid);
        await tx.insert(treatmentStagePayments).values(
          negations.map((n) => ({
            tenantId: original.tenantId,
            transactionId: refundTx.id,
            stageId: n.stageId,
            amount: n.amount,
          })),
        );
      }

      // CLI-406: original HECH QACHON void qilinmaydi (to'liq refundda ham
      // `completed` qoladi) — manfiy refund qatori yagona buxgalteriya izi.
      // Aks holda void completed-filtrdan chiqarardi VA refund qatori negatsiya
      // qilardi → daromad ikki marta ayirilardi.

      await deps.audit.record(c, {
        action: 'refunded',
        resourceType: 'cashier_transaction',
        resourceId: id,
        before: original,
        after: refundTx,
      });

      return { ok: true as const, refund: refundTx };
    });
  }
```

Yangi:

```ts
  async function refund(
    c: Context,
    id: string,
    amount?: number,
  ): Promise<
    | { ok: true; refund: typeof cashierTransactions.$inferSelect }
    | { ok: false; reason: 'invalid' | 'over_refund' | 'non_plan_partial' }
  > {
    const db = getDb(c);

    const txResult = await db.transaction(async (tx) => {
      // Row-lock: ikki parallel refund poygasini oldini olish (TOCTOU). Guard tx ichida.
      const [original] = await tx
        .select()
        .from(cashierTransactions)
        .where(eq(cashierTransactions.id, id))
        .for('update');
      if (!original) return { ok: false as const, reason: 'invalid' as const };
      // Refund of refund yoki allaqachon void qilingan — RAD.
      if (original.type === 'refund' || original.status === 'voided') {
        return { ok: false as const, reason: 'invalid' as const };
      }

      const paid = Number(original.paidAmount);

      // Allaqachon qaytarilgan summa (shu parentning refund row'lari).
      const [refundedRow] = await tx
        .select({ sum: sql<string>`COALESCE(SUM(${cashierTransactions.paidAmount}), 0)` })
        .from(cashierTransactions)
        .where(
          and(
            eq(cashierTransactions.parentTransactionId, id),
            eq(cashierTransactions.type, 'refund'),
          ),
        );
      const alreadyRefunded = Number(refundedRow?.sum ?? 0);
      const remaining = paid - alreadyRefunded;

      const refundAmount = amount ?? remaining;
      if (!(refundAmount > 0)) return { ok: false as const, reason: 'invalid' as const };
      if (refundAmount > remaining) return { ok: false as const, reason: 'over_refund' as const };

      // Qisman (yoki ketma-ket) refund — faqat plan-linked.
      const isPartial = refundAmount < paid;
      if (!original.treatmentPlanId && (isPartial || alreadyRefunded > 0)) {
        return { ok: false as const, reason: 'non_plan_partial' as const };
      }

      const refundSeq =
        (
          await tx
            .select({ c: count() })
            .from(cashierTransactions)
            .where(
              and(
                eq(cashierTransactions.parentTransactionId, id),
                eq(cashierTransactions.type, 'refund'),
              ),
            )
        )[0]?.c ?? 0;

      const [refundTx] = await tx
        .insert(cashierTransactions)
        .values({
          tenantId: original.tenantId,
          branchId: original.branchId,
          patientId: original.patientId,
          treatmentPlanId: original.treatmentPlanId,
          receiptNumber: `${original.receiptNumber}-R${refundSeq + 1}`,
          totalAmount: String(refundAmount),
          paidAmount: String(refundAmount),
          discount: '0',
          paymentMethod: original.paymentMethod,
          type: 'refund',
          parentTransactionId: id,
          status: 'completed',
          notes: `Refund of ${original.receiptNumber}${isPartial ? ` (${refundAmount})` : ''}`,
          createdBy: c.get('user')?.id ?? null,
        })
        .returning();
      if (!refundTx) return { ok: false as const, reason: 'invalid' as const };

      // Asl allocation'larni PROPORSIONAL negatsiya (balansni tiklaydi). Proporsional
      // bo'lgani uchun har bosqich uchun Σ negatsiya ≤ asl allocation (phantom-credit yo'q).
      const origAllocations = await tx
        .select({ stageId: treatmentStagePayments.stageId, amount: treatmentStagePayments.amount })
        .from(treatmentStagePayments)
        .where(eq(treatmentStagePayments.transactionId, id));

      if (origAllocations.length > 0) {
        // CLI-418: 2dp yaxlitlash + residue true-up (Σ negatsiya aynan proporsional
        // maqsad — kasr drift yo'q). `factor` inline ko'paytirish o'rniga sof helper.
        const negations = distributeRefundNegations(origAllocations, refundAmount, paid);
        await tx.insert(treatmentStagePayments).values(
          negations.map((n) => ({
            tenantId: original.tenantId,
            transactionId: refundTx.id,
            stageId: n.stageId,
            amount: n.amount,
          })),
        );
      }

      // CLI-406: original HECH QACHON void qilinmaydi (to'liq refundda ham
      // `completed` qoladi) — manfiy refund qatori yagona buxgalteriya izi.
      // Aks holda void completed-filtrdan chiqarardi VA refund qatori negatsiya
      // qilardi → daromad ikki marta ayirilardi.

      await deps.audit.record(c, {
        action: 'refunded',
        resourceType: 'cashier_transaction',
        resourceId: id,
        before: original,
        after: refundTx,
      });

      // CLI-446 G3: payroll carry-forward hook uchun kerakli maydonlarni tx
      // ichidan tashqariga olib chiqamiz (tx yopilgandan keyin hook chaqiriladi).
      // Faqat plan-linked tranzaksiyada doktor bor (treatmentPlans.doctorId) —
      // non-plan savdo payroll attributsiyasiga umuman bog'lanmagan (createRun
      // ham faqat treatmentPlanId orqali join qiladi), shuning uchun bu yerda
      // ANIQLASH kifoya, hookni CHAQIRISH emas.
      let payrollDoctorId: string | null = null;
      if (original.treatmentPlanId) {
        const [plan] = await tx
          .select({ doctorId: treatmentPlans.doctorId })
          .from(treatmentPlans)
          .where(eq(treatmentPlans.id, original.treatmentPlanId));
        payrollDoctorId = plan?.doctorId ?? null;
      }

      return {
        ok: true as const,
        refund: refundTx,
        payrollDoctorId,
        payrollBranchId: original.branchId,
        payrollRefundAmount: refundAmount,
        payrollTransactionCreatedAt: original.createdAt,
      };
    });

    // CLI-446 G3: tx (savepoint) commit qilingandan KEYIN, lekin hali umumiy
    // request-tranzaksiya (rlsMiddleware) ichida chaqiriladi — `deps.recall.
    // autoCreateFromStage(c, ...)` bilan bir xil naqsh (treatment-plans.service.ts).
    // Agar hook otsa — butun request-tranzaksiya rollback bo'ladi (refund + adjustment
    // baribir bir-biriga bog'liq atomik holda qoladi: yozib bo'lmagan adjustment
    // refundni ham bekor qiladi).
    if (txResult.ok && txResult.payrollDoctorId && deps.payrollAdjustment) {
      await deps.payrollAdjustment.recordRefundAdjustment(c, {
        doctorId: txResult.payrollDoctorId,
        branchId: txResult.payrollBranchId,
        sourceTransactionId: txResult.refund.id,
        refundAmount: txResult.payrollRefundAmount,
        transactionCreatedAt: txResult.payrollTransactionCreatedAt,
      });
    }

    if (!txResult.ok) return txResult;
    return { ok: true as const, refund: txResult.refund };
  }
```

- [ ] **Step 9: `cashier.routes.ts` — deps + wiring**

Eski (import bloki):

```ts
import {
  AllocationExceedError,
  createCashierService,
  DiscountExceedsTotalError,
  NoActivePriceError,
  type PriceLookup,
} from './cashier.service.ts';
```

Yangi:

```ts
import {
  AllocationExceedError,
  createCashierService,
  DiscountExceedsTotalError,
  NoActivePriceError,
  type PayrollAdjustmentHook,
  type PriceLookup,
} from './cashier.service.ts';
```

Eski (`cashierRoutes` deps + service quruvchi):

```ts
export const cashierRoutes = (deps: {
  db: Database;
  audit: AuditLogger;
  fiscal?: FiscalProvider;
  /** CLI-443: POS item narxini serverda hisoblash uchun (services.service.ts::getActivePrice). */
  priceLookup: PriceLookup;
}) => {
  const app = new OpenAPIHono();
  app.use('*', requireModuleInDesktop('cashier'));
  app.use('*', authMiddleware());
  app.use('*', rlsMiddleware(deps.db));

  const service = createCashierService({
    audit: deps.audit,
    fiscal: deps.fiscal,
    priceLookup: deps.priceLookup,
  });
```

Yangi:

```ts
export const cashierRoutes = (deps: {
  db: Database;
  audit: AuditLogger;
  fiscal?: FiscalProvider;
  /** CLI-443: POS item narxini serverda hisoblash uchun (services.service.ts::getActivePrice). */
  priceLookup: PriceLookup;
  /** CLI-446 G3: refund finalized payroll davriga tushsa carry-forward tuzatish yozish uchun. */
  payrollAdjustment?: PayrollAdjustmentHook;
}) => {
  const app = new OpenAPIHono();
  app.use('*', requireModuleInDesktop('cashier'));
  app.use('*', authMiddleware());
  app.use('*', rlsMiddleware(deps.db));

  const service = createCashierService({
    audit: deps.audit,
    fiscal: deps.fiscal,
    priceLookup: deps.priceLookup,
    payrollAdjustment: deps.payrollAdjustment,
  });
```

- [ ] **Step 10: `app.ts` — composition root wiring**

Eski (import qatori):

```ts
import { payrollRoutes } from './modules/payroll/index.ts';
```

Yangi:

```ts
import { createPayrollService, payrollRoutes } from './modules/payroll/index.ts';
```

Eski (`priceLookup` yaratilgandan keyin):

```ts
  const priceLookup = createServicesService({
    audit,
    categories: createServiceCategoriesService({ audit }),
  });
```

Yangi:

```ts
  const priceLookup = createServicesService({
    audit,
    categories: createServiceCategoriesService({ audit }),
  });
  // CLI-446 G3: payroll carry-forward hook — cashier.refund() finalized payroll
  // davriga tushgan refund uchun `payroll_adjustments` yozishi kerak. Bir marta
  // (early) quriladi va cashierRoutes'ga narrow `payrollAdjustment` hook sifatida
  // uzatiladi. `payrollRoutes` (pastda) o'zining ALOHIDA instance'ini quradi —
  // ikkalasi ham stateless factory, bir xil DB'ga o'qiydi, churn kamaytirish uchun
  // bitta umumiy instance shart emas (priceLookup bilan bir xil qaror, :62-69).
  const payrollAdjustmentHook = createPayrollService({ audit });
```

Eski (`/api/cashier` mount):

```ts
  app.route('/api/cashier', cashierRoutes({ db, audit, fiscal, priceLookup }));
```

Yangi:

```ts
  app.route(
    '/api/cashier',
    cashierRoutes({ db, audit, fiscal, priceLookup, payrollAdjustment: payrollAdjustmentHook }),
  );
```

- [ ] **Step 11: Run test to verify it passes**

Run: `cd apps/api && bun test tests/integration/cli-446-payroll-adjustments.test.ts --env-file=../../.env`
Expected: PASS — barcha 5 test (Tayyorgarlik + T1-T4) yashil.

- [ ] **Step 12: Regression — mavjud payroll/cashier testlari**

Run: `cd apps/api && bun test tests/integration/cli-417-payroll-guards.test.ts --env-file=../../.env`
Expected: PASS (o'zgarmagan — CLI-417'ning barcha stsenariylarida hech qanday `payroll_adjustments` qatori yo'q, `unappliedAdjByDoctor` doim bo'sh Map, `absorbable` hisoblash mavjud floor(0) xulqini o'zgartirmaydi: `adjustmentSum=0` bo'lganda `commissionAmount = rawCommission` — eski formulaga aynan teng).

Run: `cd apps/api && bunx vitest run src/modules/payroll/`
Expected: PASS (`payroll.calc.test.ts` — `computePayrollLine` o'zgarmagan).

Run: `cd apps/api && bun test tests/integration/cashier-plan-balance.test.ts --env-file=../../.env` (yoki mavjud cashier refund/billing testlari — `payrollAdjustment` deps bermasa `undefined`, hook chaqirilmaydi, xulq o'zgarmaydi)
Expected: PASS.

- [ ] **Step 13: Typecheck**

Run: `cd apps/api && bun run typecheck` (yoki repo-root `turbo run typecheck --filter=@dental/api`)
Expected: 0 xato.

- [ ] **Step 14: Commit**

```bash
git add apps/api/src/modules/payroll/payroll.service.ts apps/api/src/modules/cashier/cashier.service.ts apps/api/src/modules/cashier/cashier.routes.ts apps/api/src/app.ts apps/api/tests/integration/cli-446-payroll-adjustments.test.ts
git commit -m "feat(api): CLI-446 G3 — payroll_adjustments carry-forward (finalized run refund reconciliation)"
```

---

## Yakuniy DoD

- [ ] `payroll_adjustments` jadval — RLS bilan migratsiya qilingan, `check-rls-coverage` yashil (Task 1).
- [ ] `cashier.service.ts::refund()` finalized davrga tushgan plan-linked refund uchun `payroll_adjustments` qatori yozadi (Task 2).
- [ ] `createRun()` qo'llanmagan adjustment'larni all-or-nothing qo'shadi (floor 0 saqlanadi, `payroll.calc.ts` o'zgarmagan).
- [ ] `finalizeRun()` to'liq singdirilgan adjustment'larga `appliedToRunId` yozadi (bitta tranzaksiyada).
- [ ] 5 integration test yashil (Tayyorgarlik + T1: adjustment yaratiladi, T2: floor to'liq singdira olmasa — hech narsa qo'llanmaydi, T3: keyingi-keyingi run to'liq singdiradi + muhr, T4: ikki marta qo'llanmaydi).
- [ ] Mavjud `cli-417-payroll-guards.test.ts`, `payroll.calc.test.ts`, cashier refund/billing testlari regressiyasiz yashil.
- [ ] Typecheck toza (`@dental/db-schema` + `@dental/api`).
- [ ] Linear CLI-446 — "Done"ga o'tkaziladi (implementatsiya + verify-agentdan keyin).
