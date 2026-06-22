/**
 * V2-4 (Qisman refund, CLI-244) — TDD balans-darajali test.
 * Advisor qarori: partial refund FAQAT plan-linked (non-plan = full-only, semantik noaniqlik).
 * Mexanizm: kompensatsiya refund txn + proporsional negative allocation; cumulative guard
 * Σ refunds ≤ paidAmount; original faqat cumulative=full bo'lganda void.
 *
 * Balans-darajali (row-existence emas): har refund'dan keyin balanceFor().planDebt tekshiriladi.
 * Ishga tushirish: `cd apps/api && bun test --env-file=../../.env cli-244-partial-refund`
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
import { createPatientsService } from '../../src/modules/patients/patients.service.ts';

const noopAudit = { record: async () => {} } as unknown as AuditLogger;
const cashier = createCashierService({ audit: noopAudit });
const patientsSvc = createPatientsService({ audit: noopAudit });

let tenantId: string;
let userId: string;
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

let patientId: string;
let planTxId: string;
let nonPlanTxId: string;

const planDebt = (tx: DbOrTx) => patientsSvc.balanceFor(ctx(tx), patientId).then((b) => b.planDebt);

beforeAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);

  const [owner] = await db
    .insert(users)
    .values({ phone: '+998900000024', passwordHash: 'fake', fullName: 'Owner' })
    .returning({ id: users.id });
  if (!owner) throw new Error('owner insert failed');
  userId = owner.id;

  const [tenant] = await db
    .insert(tenants)
    .values({ name: 'Refund Clinic', slug: 'refund-clinic', ownerUserId: userId })
    .returning({ id: tenants.id });
  if (!tenant) throw new Error('tenant insert failed');
  tenantId = tenant.id;

  await db.transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
    const [branch] = await tx
      .insert(branches)
      .values({ tenantId, name: 'Main' })
      .returning({ id: branches.id });
    const [p] = await tx
      .insert(patients)
      .values({ tenantId, fullName: 'Bemor' })
      .returning({ id: patients.id });
    if (!branch || !p) throw new Error('branch/patient insert failed');
    patientId = p.id;

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
        cost: '100000',
        acceptance: 'accepted',
      })
      .returning({ id: treatmentStages.id });
    if (!stage) throw new Error('stage insert failed');

    // Plan-linked to'lov 100000 → S1 +100000 (planDebt = 100000 − 100000 = 0)
    const [planTx] = await tx
      .insert(cashierTransactions)
      .values({
        tenantId,
        branchId: branch.id,
        patientId,
        treatmentPlanId: plan.id,
        receiptNumber: 'R-PLAN-1',
        totalAmount: '100000',
        paidAmount: '100000',
        paymentMethod: 'cash',
        type: 'payment',
        status: 'completed',
      })
      .returning({ id: cashierTransactions.id });
    if (!planTx) throw new Error('planTx insert failed');
    planTxId = planTx.id;
    await tx
      .insert(treatmentStagePayments)
      .values({ tenantId, transactionId: planTx.id, stageId: stage.id, amount: '100000' });

    // Non-plan to'lov (plan_id NULL)
    const [nonPlanTx] = await tx
      .insert(cashierTransactions)
      .values({
        tenantId,
        branchId: branch.id,
        patientId,
        receiptNumber: 'R-NONPLAN-1',
        totalAmount: '50000',
        paidAmount: '50000',
        paymentMethod: 'cash',
        type: 'payment',
        status: 'completed',
      })
      .returning({ id: cashierTransactions.id });
    if (!nonPlanTx) throw new Error('nonPlanTx insert failed');
    nonPlanTxId = nonPlanTx.id;
  });
});

afterAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
});

const withTx = <T>(fn: (tx: DbOrTx) => Promise<T>): Promise<T> =>
  db.transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
    return fn(tx);
  });

describe('Qisman refund — balans-darajali', () => {
  test('boshlang‘ich planDebt = 0', async () => {
    expect(await withTx(planDebt)).toBe(0);
  });

  test('plan partial refund 40000 → planDebt 40000, original void EMAS', async () => {
    const res = await withTx((tx) => cashier.refund(ctx(tx), planTxId, 40000));
    expect(res.ok).toBe(true);
    expect(await withTx(planDebt)).toBe(40000);
    const [orig] = await withTx((tx) =>
      tx.select().from(cashierTransactions).where(eq(cashierTransactions.id, planTxId)),
    );
    expect(orig?.status).toBe('completed'); // partial → void EMAS
  });

  test('over-refund guard: qolgan 60000 dan ko‘p (70000) → rad', async () => {
    const res = await withTx((tx) => cashier.refund(ctx(tx), planTxId, 70000));
    expect(res.ok).toBe(false);
  });

  test('ikkinchi partial 60000 → cumulative=full, planDebt 100000, original void', async () => {
    const res = await withTx((tx) => cashier.refund(ctx(tx), planTxId, 60000));
    expect(res.ok).toBe(true);
    expect(await withTx(planDebt)).toBe(100000);
    const [orig] = await withTx((tx) =>
      tx.select().from(cashierTransactions).where(eq(cashierTransactions.id, planTxId)),
    );
    expect(orig?.status).toBe('voided');
  });

  test('to‘liq refund qilingandan keyin yana refund → rad', async () => {
    const res = await withTx((tx) => cashier.refund(ctx(tx), planTxId, 10000));
    expect(res.ok).toBe(false);
  });

  test('non-plan partial refund → rad (semantik noaniqlik)', async () => {
    const res = await withTx((tx) => cashier.refund(ctx(tx), nonPlanTxId, 20000));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe('non_plan_partial');
  });

  test('non-plan full refund (amount yo‘q) → ishlaydi, void', async () => {
    const res = await withTx((tx) => cashier.refund(ctx(tx), nonPlanTxId));
    expect(res.ok).toBe(true);
    const [orig] = await withTx((tx) =>
      tx.select().from(cashierTransactions).where(eq(cashierTransactions.id, nonPlanTxId)),
    );
    expect(orig?.status).toBe('voided');
  });
});
