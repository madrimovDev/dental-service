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

  test('T1: Yanvar tranzaksiyasi (finalized davr) 500,000ga refund qilinsa — payroll_adjustment yaratiladi (-50,000)', async () => {
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
