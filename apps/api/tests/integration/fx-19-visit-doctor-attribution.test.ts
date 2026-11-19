/**
 * FX-19 (LA-29, D-3, D-13) — vizit orqali POS to'lovi vizit doktoriga bog'lanadi:
 * doktor = COALESCE(treatment_plans.doctor_id, visit_notes.doctor_id). Payroll createRun,
 * reports (revenue.byDoctor, ownerToday.doctors) va refund hook'ida bir xil manba.
 * Komissiya bazasi = paidAmount (o'zgarmaydi).
 *
 *   cd apps/api && bun test tests/integration/fx-19-visit-doctor-attribution.test.ts --env-file=../../.env --timeout 30000
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
  visitNotes,
} from '@dental/db-schema';
import { eq, sql } from 'drizzle-orm';
import type { Context } from 'hono';
import type { DbOrTx } from '../../src/db/client.ts';
import { db } from '../../src/db/client.ts';
import type { AuditLogger } from '../../src/lib/audit-logger.ts';
import { createCashierService } from '../../src/modules/cashier/cashier.service.ts';
import { createPayrollService } from '../../src/modules/payroll/payroll.service.ts';
import { createReportsService } from '../../src/modules/reports/reports.service.ts';

const noopAudit = { record: async () => {} } as unknown as AuditLogger;
const payrollService = createPayrollService({ audit: noopAudit });
const cashier = createCashierService({ audit: noopAudit, payrollAdjustment: payrollService });
const reports = createReportsService({ audit: noopAudit });

let tenantId: string;
let ownerId: string;
let planDoctorId: string;
let visitDoctorId: string;
let branchId: string;
let patientId: string;
let planId: string;
let visitId: string;
let visitTxId: string;
let planTxId: string;

const ctx = (tx: DbOrTx): Context =>
  ({
    get: (k: string) =>
      k === 'db'
        ? tx
        : k === 'activeTenantId'
          ? tenantId
          : k === 'user'
            ? { id: ownerId }
            : k === 'accessClaims'
              ? { perms: ['@owner'] }
              : undefined,
    req: { header: () => undefined },
  }) as unknown as Context;

const withTx = <T>(fn: (tx: DbOrTx) => Promise<T>) =>
  db.transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
    return fn(tx);
  });

beforeAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
  const mk = async (phone: string, name: string) => {
    const [u] = await db
      .insert(users)
      .values({ phone, passwordHash: 'fake', fullName: name })
      .returning({ id: users.id });
    if (!u) throw new Error('user insert failed');
    return u.id;
  };
  ownerId = await mk('+998900000191', 'Owner FX19');
  planDoctorId = await mk('+998900000192', 'PlanDoctor FX19');
  visitDoctorId = await mk('+998900000193', 'VisitDoctor FX19');
  const [tenant] = await db
    .insert(tenants)
    .values({ name: 'FX-19 Clinic', slug: 'fx-19-clinic', ownerUserId: ownerId })
    .returning({ id: tenants.id });
  if (!tenant) throw new Error('tenant insert failed');
  tenantId = tenant.id;

  await withTx(async (tx) => {
    const [branch] = await tx
      .insert(branches)
      .values({ tenantId, name: 'FX-19 Branch' })
      .returning({ id: branches.id });
    if (!branch) throw new Error('branch insert failed');
    branchId = branch.id;
    for (const uid of [planDoctorId, visitDoctorId]) {
      await tx.insert(staffProfiles).values({
        tenantId,
        userId: uid,
        employmentStatus: 'active',
        baseSalary: '0',
        commissionPercent: '30',
      });
    }
    const [patient] = await tx
      .insert(patients)
      .values({ tenantId, fullName: 'FX-19 Patient' })
      .returning({ id: patients.id });
    if (!patient) throw new Error('patient insert failed');
    patientId = patient.id;
    const [plan] = await tx
      .insert(treatmentPlans)
      .values({ tenantId, patientId, doctorId: planDoctorId, title: 'P', status: 'in_progress' })
      .returning({ id: treatmentPlans.id });
    if (!plan) throw new Error('plan insert failed');
    planId = plan.id;
    const [visit] = await tx
      .insert(visitNotes)
      .values({ tenantId, patientId, doctorId: visitDoctorId, signedAt: new Date() })
      .returning({ id: visitNotes.id });
    if (!visit) throw new Error('visit insert failed');
    visitId = visit.id;

    const base = {
      tenantId,
      branchId,
      patientId,
      paymentMethod: 'cash' as const,
      type: 'payment' as const,
      status: 'completed' as const,
      createdAt: new Date('2026-05-10T10:00:00+05:00'),
    };
    const [vt] = await tx
      .insert(cashierTransactions)
      .values({
        ...base,
        visitNoteId: visitId,
        receiptNumber: 'FX19-V1',
        totalAmount: '1000000',
        paidAmount: '1000000',
      })
      .returning({ id: cashierTransactions.id });
    const [pt] = await tx
      .insert(cashierTransactions)
      .values({
        ...base,
        treatmentPlanId: planId,
        receiptNumber: 'FX19-P1',
        totalAmount: '500000',
        paidAmount: '500000',
      })
      .returning({ id: cashierTransactions.id });
    if (!vt || !pt) throw new Error('tx insert failed');
    visitTxId = vt.id;
    planTxId = pt.id;
  });
});

afterAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
});

describe('FX-19 — vizit to‘lovi doktorga bog‘lanadi', () => {
  test('reports revenue.byDoctor: vizit tushumi vizit doktorida, plan tushumi plan doktorida, null yo‘q', async () => {
    const r = await withTx((tx) =>
      reports.revenue(ctx(tx), { from: '2026-05-01', to: '2026-05-31' }),
    );
    const byId = new Map(r.byDoctor.map((d) => [d.doctorId, d.total]));
    expect(byId.get(visitDoctorId)).toBe(1_000_000);
    expect(byId.get(planDoctorId)).toBe(500_000);
    expect(byId.has(null)).toBe(false);
  });

  test('payroll createRun: vizit doktori attributedRevenue=1,000,000, komissiya 300,000', async () => {
    const run = await withTx((tx) =>
      payrollService.createRun(ctx(tx), { periodFrom: '2026-05-01', periodTo: '2026-05-31' }),
    );
    const visitLine = run.lines.find((l) => l.userId === visitDoctorId);
    const planLine = run.lines.find((l) => l.userId === planDoctorId);
    expect(Number(visitLine?.attributedRevenue)).toBe(1_000_000);
    expect(Number(visitLine?.commissionAmount)).toBe(300_000);
    expect(Number(planLine?.attributedRevenue)).toBe(500_000);
    await withTx((tx) => payrollService.finalizeRun(ctx(tx), run.id));
  });

  test('vizit to‘lovi refundi: finalized davrda vizit doktoriga clawback adjustment yoziladi', async () => {
    const res = await withTx((tx) => cashier.refund(ctx(tx), visitTxId));
    expect(res.ok).toBe(true);
    const adj = await withTx((tx) =>
      tx.select().from(payrollAdjustments).where(eq(payrollAdjustments.doctorId, visitDoctorId)),
    );
    expect(adj).toHaveLength(1);
    expect(Number(adj[0]?.amount)).toBe(-300_000);
    expect(planTxId).toBeTruthy();
  });
});

describe('FX-19 — refund qatori ochiq davrda vizit doktoridan ayriladi', () => {
  test('ochiq davrda: payment + uning refundi netlanadi (vizit doktori 0)', async () => {
    const at = new Date('2026-06-10T10:00:00+05:00');
    const refundId = await withTx(async (tx) => {
      const [v] = await tx
        .insert(visitNotes)
        .values({ tenantId, patientId, doctorId: visitDoctorId, signedAt: new Date() })
        .returning({ id: visitNotes.id });
      const [t] = await tx
        .insert(cashierTransactions)
        .values({
          tenantId,
          branchId,
          patientId,
          visitNoteId: v?.id,
          receiptNumber: 'FX19-V2',
          totalAmount: '200000',
          paidAmount: '200000',
          paymentMethod: 'cash',
          type: 'payment',
          status: 'completed',
          createdAt: at,
        })
        .returning({ id: cashierTransactions.id });
      const [rf] = await tx
        .insert(cashierTransactions)
        .values({
          tenantId,
          branchId,
          patientId,
          parentTransactionId: t?.id,
          receiptNumber: 'FX19-V2-R1',
          totalAmount: '200000',
          paidAmount: '200000',
          paymentMethod: 'cash',
          type: 'refund',
          status: 'completed',
          createdAt: at,
        })
        .returning({ id: cashierTransactions.id });
      return rf?.id;
    });
    expect(refundId).toBeTruthy();
    const r = await withTx((tx) =>
      reports.revenue(ctx(tx), { from: '2026-06-01', to: '2026-06-30' }),
    );
    expect(r.total).toBe(0);
    const entry = r.byDoctor.find((d) => d.doctorId === visitDoctorId);
    expect(entry?.total ?? 0).toBe(0);
    expect(r.byDoctor.find((d) => d.doctorId === null)).toBeUndefined();
  });
});

describe('FX-19 — ownerToday.doctors', () => {
  test('bugungi vizit to‘lovi vizit doktorining revenue’sida ko‘rinadi', async () => {
    await withTx(async (tx) => {
      const [v] = await tx
        .insert(visitNotes)
        .values({ tenantId, patientId, doctorId: visitDoctorId, signedAt: new Date() })
        .returning({ id: visitNotes.id });
      await tx.insert(cashierTransactions).values({
        tenantId,
        branchId,
        patientId,
        visitNoteId: v?.id,
        receiptNumber: 'FX19-TODAY',
        totalAmount: '400000',
        paidAmount: '400000',
        paymentMethod: 'cash',
        type: 'payment',
        status: 'completed',
      });
    });
    const r = await withTx((tx) => reports.ownerToday(ctx(tx), {}));
    // Bugun: yuqoridagi vizit to'lovining refundi (−1,000,000, cashier.refund = hozir) + 400,000.
    expect(r.doctors.find((d) => d.doctorId === visitDoctorId)?.revenue).toBe(-600_000);
  });
});
