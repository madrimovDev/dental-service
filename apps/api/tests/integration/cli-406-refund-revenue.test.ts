/**
 * CLI-406 — to'liq refund daromaddan IKKI marta ayirilmasin.
 *
 * Ilgari to'liq-refund asl tx'ni `voided` qilardi (completed-filtrdan chiqar)
 * VA manfiy `type='refund'` qatori qo'shardi (signed SUM negatsiya) → daromad
 * reversal IKKI marta. Fix: asl HECH QACHON void qilinmaydi → refund qatori
 * yagona iz → to'liq refundda revenue net = 0.
 *
 * Payroll (`createRun`) AYNAN bir xil `signedPaidAmount` + `status='completed'`
 * formulasini ishlatadi (payroll.service.ts:63-72) — shuning uchun revenue
 * net-zero mexanizmni to'liq isbotlaydi; alohida payroll setup takrorlanmaydi.
 *
 * Harness: cli-244 uslubi (ctx/withTx, real DB, RLS SET LOCAL).
 * Ishga tushirish: `cd apps/api && bun test --env-file=../../.env cli-406-refund-revenue`
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import {
  branches,
  cashierTransactions,
  patients,
  tenants,
  treatmentPlans,
  treatmentStagePayments,
  treatmentStages,
  users,
} from '@dental/db-schema';
import { eq, sql } from 'drizzle-orm';
import type { Context } from 'hono';
import type { DbOrTx } from '../../src/db/client.ts';
import { db } from '../../src/db/client.ts';
import type { AuditLogger } from '../../src/lib/audit-logger.ts';
import { createCashierService } from '../../src/modules/cashier/cashier.service.ts';
import { createReportsService } from '../../src/modules/reports/reports.service.ts';

const noopAudit = { record: async () => {} } as unknown as AuditLogger;
const cashier = createCashierService({ audit: noopAudit });
const reports = createReportsService({ audit: noopAudit });

// Barcha test tranzaksiyalarini qamrab oladigan keng oraliq (createdAt = now()).
const RANGE = { from: '2020-01-01', to: '2099-12-31' };

let tenantId: string;
let userId: string;
let branchId: string;
let patientId: string;

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
              ? { id: userId }
              : undefined,
    req: { header: () => undefined },
  }) as unknown as Context;

const withTx = <T>(fn: (tx: DbOrTx) => Promise<T>): Promise<T> =>
  db.transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
    return fn(tx);
  });

const revenueTotal = () => withTx((tx) => reports.revenue(ctx(tx), RANGE)).then((r) => r.total);

/** Plan-linked payment yaratadi (bitta stage, to'liq allocation) → tx id qaytaradi. */
async function makePlanPayment(amount: number): Promise<string> {
  return withTx(async (tx) => {
    const [plan] = await tx
      .insert(treatmentPlans)
      .values({ tenantId, patientId, doctorId: userId, title: 'Reja', status: 'accepted' })
      .returning({ id: treatmentPlans.id });
    if (!plan) throw new Error('plan insert failed');
    const [stage] = await tx
      .insert(treatmentStages)
      .values({
        treatmentPlanId: plan.id,
        sequence: 1,
        serviceName: 'S1',
        cost: String(amount),
        acceptance: 'accepted',
      })
      .returning({ id: treatmentStages.id });
    if (!stage) throw new Error('stage insert failed');
    const [tx1] = await tx
      .insert(cashierTransactions)
      .values({
        tenantId,
        branchId,
        patientId,
        treatmentPlanId: plan.id,
        receiptNumber: `R-${plan.id.slice(0, 8)}`,
        totalAmount: String(amount),
        paidAmount: String(amount),
        paymentMethod: 'cash',
        type: 'payment',
        status: 'completed',
      })
      .returning({ id: cashierTransactions.id });
    if (!tx1) throw new Error('payment insert failed');
    await tx
      .insert(treatmentStagePayments)
      .values({ tenantId, transactionId: tx1.id, stageId: stage.id, amount: String(amount) });
    return tx1.id;
  });
}

const statusOf = (id: string) =>
  withTx((tx) =>
    tx
      .select({ s: cashierTransactions.status })
      .from(cashierTransactions)
      .where(eq(cashierTransactions.id, id)),
  ).then((r) => r[0]?.s);

beforeAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
  const [owner] = await db
    .insert(users)
    .values({ phone: '+998900000406', passwordHash: 'fake', fullName: 'Owner' })
    .returning({ id: users.id });
  if (!owner) throw new Error('owner insert failed');
  userId = owner.id;
  const [tenant] = await db
    .insert(tenants)
    .values({ name: 'CLI406 Clinic', slug: 'cli406-clinic', ownerUserId: userId })
    .returning({ id: tenants.id });
  if (!tenant) throw new Error('tenant insert failed');
  tenantId = tenant.id;
  await withTx(async (tx) => {
    const [branch] = await tx
      .insert(branches)
      .values({ tenantId, name: 'Main' })
      .returning({ id: branches.id });
    const [p] = await tx
      .insert(patients)
      .values({ tenantId, fullName: 'Bemor' })
      .returning({ id: patients.id });
    if (!branch || !p) throw new Error('branch/patient insert failed');
    branchId = branch.id;
    patientId = p.id;
  });
});

afterAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
});

describe("CLI-406 — to'liq refund daromadni ikki marta ayirmaydi", () => {
  test("E1: to'liq refund → revenue net = 0, asl completed qoladi", async () => {
    const id = await makePlanPayment(1_000_000);
    expect(await revenueTotal()).toBe(1_000_000); // refunddan oldin
    const res = await withTx((tx) => cashier.refund(ctx(tx), id));
    expect(res.ok).toBe(true);
    expect(await revenueTotal()).toBe(0); // void bug'ida -1_000_000 bo'lardi
    expect(await statusOf(id)).toBe('completed'); // void EMAS
  });

  test('E2: qisman 400k keyin qolgan 600k → oraliqda 600k, yakunda 0', async () => {
    const id = await makePlanPayment(1_000_000);
    const base = await revenueTotal();
    await withTx((tx) => cashier.refund(ctx(tx), id, 400_000));
    expect(await revenueTotal()).toBe(base - 400_000);
    await withTx((tx) => cashier.refund(ctx(tx), id, 600_000));
    expect(await revenueTotal()).toBe(base - 1_000_000);
    expect(await statusOf(id)).toBe('completed');
  });

  test("E3: to'liq refunddan keyin yana refund → over_refund (void'siz ham)", async () => {
    const id = await makePlanPayment(500_000);
    await withTx((tx) => cashier.refund(ctx(tx), id));
    const res = await withTx((tx) => cashier.refund(ctx(tx), id, 10_000));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe('over_refund');
  });
});
