/**
 * CLI-479 [Urgent] — payroll refund DOUBLE-CLAWBACK regressiya testi.
 *
 * Bug: `cashier.refund()` ikki mustaqil clawback otadi (dedupsiz):
 *   (1) carry-forward `recordRefundAdjustment` — asl to'lov FINALIZED davrga tushsa,
 *       `payroll_adjustment` (−refund×foiz) yozadi (appliedToRunId=NULL) va keyingi
 *       run'ga singdiriladi;
 *   (2) `createRun` revenue-query netting — `SUM(CASE type='refund' THEN -paidAmount)`
 *       refund qatorini O'Z davriga (refund createdAt) netlaydi.
 * Refund asl to'lovi FINALIZED davrdan (Yanvar), refundning O'ZI esa joriy OCHIQ
 * davrga (Iyul) tushsa — bitta refund IKKI marta ayiriladi (doktor kam to'lanadi).
 *
 * Test-masking: mavjud cli-446 T1/T3 testlari refund createdAt'ni wall-clock-hozir
 * qoldiradi — u HECH BIR test-run davriga tushmaydi, shuning uchun (2) netting hech
 * qachon otmaydi va bug MASKALANADI. Bu test refund createdAt'ni ANIQ Iyulga qo'yib
 * overlap'ni reprodutsiya qiladi (production reallik).
 *
 * Fix (Variant A, payroll.service.ts revenue-query): adjustmentli refund qatorlari
 * netting'dan `NOT EXISTS` bilan chiqariladi → clawback FAQAT adjustment orqali, ASL
 * finalized-snapshot foizida. Buggy kodda Iyul komissiyasi 0, fix'da 50,000.
 *
 * Ishga tushirish (yolg'iz — TRUNCATE poygasi):
 *   cd apps/api && bun test tests/integration/cli-479-payroll-refund-double-clawback.test.ts --env-file=../../.env
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
    .values({ phone: '+998900000479', passwordHash: 'fake', fullName: 'Owner CLI479' })
    .returning({ id: users.id });
  const [doctor] = await db
    .insert(users)
    .values({ phone: '+998900000480', passwordHash: 'fake', fullName: 'Doctor CLI479' })
    .returning({ id: users.id });
  if (!owner || !doctor) throw new Error('user insert failed');
  ownerId = owner.id;
  doctorId = doctor.id;

  const [tenant] = await db
    .insert(tenants)
    .values({ name: 'CLI-479 Clinic', slug: 'cli-479-clinic', ownerUserId: ownerId })
    .returning({ id: tenants.id });
  if (!tenant) throw new Error('tenant insert failed');
  tenantId = tenant.id;

  await db.transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));

    const [branch] = await tx
      .insert(branches)
      .values({ tenantId, name: 'CLI-479 Branch' })
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
      .values({ tenantId, fullName: 'CLI-479 Patient' })
      .returning({ id: patients.id });
    if (!patient) throw new Error('patient insert failed');
    patientId = patient.id;

    const [plan] = await tx
      .insert(treatmentPlans)
      .values({ tenantId, patientId, doctorId, title: 'CLI-479 Plan', status: 'in_progress' })
      .returning({ id: treatmentPlans.id });
    if (!plan) throw new Error('plan insert failed');
    planId = plan.id;
  });
});

afterAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
});

describe('CLI-479 — refund double-clawback (revenue-netting x adjustment)', () => {
  test("Yanvar (finalized) to'lovining refundi Iyul (ochiq) davrda: clawback FAQAT bir marta — Iyul komissiya 50,000 (bug'da 0)", async () => {
    await db.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
      const c = ctx(tx, tenantId, ownerId);

      // 1. Yanvar: plan-linked 1,000,000 to'lov → run yaratiladi va FINALIZE qilinadi
      //    (komissiya 100,000 = 1,000,000 × 10%, snapshot foizi muzlatiladi).
      const [janTx] = await tx
        .insert(cashierTransactions)
        .values({
          tenantId,
          branchId,
          patientId,
          treatmentPlanId: planId,
          receiptNumber: 'CLI479-JAN',
          totalAmount: '1000000',
          paidAmount: '1000000',
          paymentMethod: 'cash',
          type: 'payment',
          status: 'completed',
          createdAt: new Date('2026-01-10T10:00:00+05:00'),
        })
        .returning({ id: cashierTransactions.id });
      if (!janTx) throw new Error('jan tx insert failed');

      const janRun = await payrollService.createRun(c, {
        periodFrom: '2026-01-01',
        periodTo: '2026-01-31',
      });
      expect(Number(janRun.lines.find((l) => l.userId === doctorId)?.commissionAmount)).toBe(
        100000,
      );
      const janFinal = await payrollService.finalizeRun(c, janRun.id);
      expect(janFinal.run?.status).toBe('finalized');

      // 2. Iyul: yangi plan-linked 1,000,000 to'lov → Iyul xom komissiyasi 100,000.
      //    (Bu MAJBURIY: aks holda bug ham fix ham 0'ga floor bo'lib testni ajratmaydi.)
      await tx.insert(cashierTransactions).values({
        tenantId,
        branchId,
        patientId,
        treatmentPlanId: planId,
        receiptNumber: 'CLI479-JUL',
        totalAmount: '1000000',
        paidAmount: '1000000',
        paymentMethod: 'cash',
        type: 'payment',
        status: 'completed',
        createdAt: new Date('2026-07-10T10:00:00+05:00'),
      });

      // 3. Yanvar to'lovidan 500,000 refund → `recordRefundAdjustment` ASL to'lov
      //    createdAt (Yanvar, FINALIZED) bo'yicha −50,000 adjustment yozadi.
      const refundResult = await cashier.refund(c, janTx.id, 500000);
      expect(refundResult.ok).toBe(true);
      const refundTxId = refundResult.ok ? refundResult.refund.id : '';

      const adjRows = await tx
        .select()
        .from(payrollAdjustments)
        .where(eq(payrollAdjustments.doctorId, doctorId));
      expect(adjRows).toHaveLength(1);
      expect(Number(adjRows[0]?.amount)).toBe(-50000);
      expect(adjRows[0]?.appliedToRunId).toBeNull();

      // 4. KRITIK (test-masking oldini olish): refund qatorining createdAt'ini ANIQ
      //    Iyulga qo'yamiz — refund "hozir" bo'ladi, asl to'lov o'tmishda. Shu bilan
      //    Iyul revenue-query refundni O'Z davrida netlashga urinadi (overlap seam).
      await tx
        .update(cashierTransactions)
        .set({ createdAt: new Date('2026-07-15T10:00:00+05:00') })
        .where(eq(cashierTransactions.id, refundTxId));

      // 5. Iyul run. TO'G'RI: 100,000 (Iyul xom) − 50,000 (adjustment, BIR marta) =
      //    50,000. BUG: revenue-query refundni HAM netlaydi (1,000,000 − 500,000 =
      //    500,000 → xom 50,000) + adjustment −50,000 = 0 → IKKI marta ayirilgan.
      const julyRun = await payrollService.createRun(c, {
        periodFrom: '2026-07-01',
        periodTo: '2026-07-31',
      });
      const julyCommission = Number(
        julyRun.lines.find((l) => l.userId === doctorId)?.commissionAmount,
      );
      expect(julyCommission).toBe(50000);

      // Sanity: adjustment BIR marta singdirildi va Iyul run'ga stamp qilindi.
      const [appliedAdj] = await tx
        .select()
        .from(payrollAdjustments)
        .where(eq(payrollAdjustments.doctorId, doctorId));
      expect(appliedAdj?.appliedToRunId).toBe(julyRun.id);
    });
  });
});
