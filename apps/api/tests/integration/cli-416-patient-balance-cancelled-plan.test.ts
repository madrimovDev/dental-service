/**
 * CLI-416 — bemor balansi debt-status'da bo'lmagan planga to'lovni TASHLAMASIN.
 *
 * Allocation-SUM plan-status bo'yicha filtrlanardi → cancelled planga to'langan
 * pul bemor balansidan yo'qolardi (lekin per-plan balans uni kredit ko'rsatardi).
 * Fix: allocation SUM FILTRLANMAYDI (C4). cost tomoni plan-status semantikasini saqlaydi.
 *
 * Ishga tushirish: `cd apps/api && bun test --env-file=../../.env cli-416-patient-balance-cancelled-plan`
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
import { createPatientsService } from '../../src/modules/patients/patients.service.ts';

const noopAudit = { record: async () => {} } as unknown as AuditLogger;
const patientsSvc = createPatientsService({ audit: noopAudit });

let tenantId: string;
let userId: string;
let patientId: string;
let planId: string;

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

const planDebt = () =>
  withTx((tx) => patientsSvc.balanceFor(ctx(tx), patientId)).then((b) => b.planDebt);

beforeAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
  const [owner] = await db
    .insert(users)
    .values({ phone: '+998900000416', passwordHash: 'fake', fullName: 'Owner' })
    .returning({ id: users.id });
  if (!owner) throw new Error('owner insert failed');
  userId = owner.id;
  const [tenant] = await db
    .insert(tenants)
    .values({ name: 'CLI416 Clinic', slug: 'cli416b-clinic', ownerUserId: userId })
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
    patientId = p.id;
    const [plan] = await tx
      .insert(treatmentPlans)
      .values({ tenantId, patientId, doctorId: userId, title: 'Reja', status: 'accepted' })
      .returning({ id: treatmentPlans.id });
    if (!plan) throw new Error('plan insert failed');
    planId = plan.id;
    const [stage] = await tx
      .insert(treatmentStages)
      .values({
        treatmentPlanId: plan.id,
        sequence: 1,
        serviceName: 'S1',
        cost: '500000',
        acceptance: 'accepted',
      })
      .returning({ id: treatmentStages.id });
    if (!stage) throw new Error('stage insert failed');
    const [tx1] = await tx
      .insert(cashierTransactions)
      .values({
        tenantId,
        branchId: branch.id,
        patientId,
        treatmentPlanId: plan.id,
        receiptNumber: 'R-416',
        totalAmount: '500000',
        paidAmount: '500000',
        paymentMethod: 'cash',
        type: 'payment',
        status: 'completed',
      })
      .returning({ id: cashierTransactions.id });
    if (!tx1) throw new Error('payment insert failed');
    await tx
      .insert(treatmentStagePayments)
      .values({ tenantId, transactionId: tx1.id, stageId: stage.id, amount: '500000' });
  });
});

afterAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
});

describe("CLI-416 — cancelled plan to'lovi kredit sifatida saqlanadi", () => {
  test("accepted plan to'liq to'langan → planDebt = 0", async () => {
    expect(await planDebt()).toBe(0);
  });

  test("plan cancelled bo'lgach → planDebt = -500000 (kredit, yo'qolmaydi)", async () => {
    await withTx((tx) =>
      tx.update(treatmentPlans).set({ status: 'cancelled' }).where(eq(treatmentPlans.id, planId)),
    );
    // cost tomoni cancelled'ni chiqaradi (0), allocation SUM filtrlanmaydi (500000).
    expect(await planDebt()).toBe(-500_000);
  });
});
