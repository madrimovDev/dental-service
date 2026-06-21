/**
 * Cashier planBalance — C4 (CLI-221) acceptance/plan-status predikati REAL DB'da.
 * Tasdiqlaydi: cashier `planBalance` debt cost === patient predikati bilan bir xil
 * (ikkalasi ham bir xil 3-konjunkt: planStatus ∈ debt, acceptance='accepted',
 * status != 'skipped'). Allocation HECH QACHON filtrlanmaydi → reject/skip-after-pay = kredit.
 *
 * Ishga tushirish (yolg'iz — TRUNCATE poygasi):
 *   cd apps/api && bun test tests/integration/cashier-plan-balance.test.ts --env-file=../../.env
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

const ctx = (tx: DbOrTx): Context =>
  ({
    get: (k: string) =>
      k === 'db' ? tx : k === 'accessClaims' ? { perms: ['@owner'] } : undefined,
  }) as unknown as Context;

let tenantId: string;
let ownerId: string;
let patientId: string;
let acceptedPlanId: string;
let presentedPlanId: string;

beforeAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);

  const [owner] = await db
    .insert(users)
    .values({ phone: '+998900000030', passwordHash: 'fake', fullName: 'Owner' })
    .returning({ id: users.id });
  if (!owner) throw new Error('owner insert failed');
  ownerId = owner.id;

  const [tenant] = await db
    .insert(tenants)
    .values({ name: 'Plan Balance Clinic', slug: 'plan-balance-clinic', ownerUserId: ownerId })
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
    const branchId = branch.id;

    const [patient] = await tx
      .insert(patients)
      .values({ tenantId, fullName: 'Plan Bemor' })
      .returning({ id: patients.id });
    if (!patient) throw new Error('patient insert failed');
    patientId = patient.id;

    // Accepted reja: A=accepted/pending (qarz), P=proposed (yo'q), R=rejected+to'langan (kredit),
    //               S=skipped+to'langan (kredit).
    const [accepted] = await tx
      .insert(treatmentPlans)
      .values({ tenantId, patientId, doctorId: ownerId, title: 'Accepted', status: 'accepted' })
      .returning({ id: treatmentPlans.id });
    if (!accepted) throw new Error('accepted plan insert failed');
    acceptedPlanId = accepted.id;

    const [a] = await tx
      .insert(treatmentStages)
      .values({
        treatmentPlanId: accepted.id,
        sequence: 1,
        serviceName: 'A',
        cost: '200000',
        status: 'pending',
        acceptance: 'accepted',
      })
      .returning({ id: treatmentStages.id });
    await tx.insert(treatmentStages).values({
      treatmentPlanId: accepted.id,
      sequence: 2,
      serviceName: 'P',
      cost: '50000',
      status: 'pending',
      acceptance: 'proposed',
    });
    const [r] = await tx
      .insert(treatmentStages)
      .values({
        treatmentPlanId: accepted.id,
        sequence: 3,
        serviceName: 'R',
        cost: '70000',
        status: 'pending',
        acceptance: 'rejected',
      })
      .returning({ id: treatmentStages.id });
    const [s] = await tx
      .insert(treatmentStages)
      .values({
        treatmentPlanId: accepted.id,
        sequence: 4,
        serviceName: 'S',
        cost: '90000',
        status: 'skipped',
        acceptance: 'accepted',
      })
      .returning({ id: treatmentStages.id });
    if (!a || !r || !s) throw new Error('accepted stage insert failed');

    // To'lovlar: A +60000 (qisman), R +70000 (rad-keyin), S +90000 (skip-keyin)
    const [txp] = await tx
      .insert(cashierTransactions)
      .values({
        tenantId,
        branchId,
        patientId,
        treatmentPlanId: accepted.id,
        totalAmount: '220000',
        paidAmount: '220000',
        paymentMethod: 'cash',
        type: 'payment',
        status: 'completed',
      })
      .returning({ id: cashierTransactions.id });
    if (!txp) throw new Error('tx insert failed');
    await tx.insert(treatmentStagePayments).values([
      { tenantId, transactionId: txp.id, stageId: a.id, amount: '60000' },
      { tenantId, transactionId: txp.id, stageId: r.id, amount: '70000' },
      { tenantId, transactionId: txp.id, stageId: s.id, amount: '90000' },
    ]);
    // debt cost = A 200000 (P/R/S chiqarildi); paid = 60000+70000+90000 = 220000
    // balance = 200000 − 220000 = −20000 (kredit)

    // Presented reja: hatto accepted bosqich bilan ham qarz YO'Q (plan status konjunkti).
    const [presented] = await tx
      .insert(treatmentPlans)
      .values({ tenantId, patientId, doctorId: ownerId, title: 'Presented', status: 'presented' })
      .returning({ id: treatmentPlans.id });
    if (!presented) throw new Error('presented plan insert failed');
    presentedPlanId = presented.id;
    await tx.insert(treatmentStages).values({
      treatmentPlanId: presented.id,
      sequence: 1,
      serviceName: 'PA',
      cost: '500000',
      status: 'pending',
      acceptance: 'accepted',
    });
  });
});

afterAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
});

describe('cashier planBalance — C4 acceptance/plan-status predikati', () => {
  test('accepted reja: faqat accepted+non-skipped cost; reject/skip-after-pay → kredit', async () => {
    const r = await db.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
      return cashier.planBalance(ctx(tx), acceptedPlanId);
    });
    expect(r.totalCost).toBe(200000); // faqat A (P proposed, R rejected, S skipped chiqarildi)
    expect(r.totalPaid).toBe(220000); // BARCHA allocation saqlandi (filtrlanmaydi)
    expect(r.balance).toBe(-20000); // kredit

    const flag = (name: string) => r.stages.find((x) => x.serviceName === name)?.excludedFromDebt;
    expect(flag('A')).toBe(false);
    expect(flag('P')).toBe(true);
    expect(flag('R')).toBe(true);
    expect(flag('S')).toBe(true);
  });

  test("presented reja: accepted bosqich bo'lsa ham qarz cost 0 (plan-status konjunkti)", async () => {
    const r = await db.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
      return cashier.planBalance(ctx(tx), presentedPlanId);
    });
    expect(r.totalCost).toBe(0);
    expect(r.stages[0]?.excludedFromDebt).toBe(true);
  });

  test("cashier == patient: bemorning umumiy planDebt cashier cost yig'indisi bilan mos", async () => {
    const { patientBalance, cashierPlanCostSum } = await db.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
      const pb = await patientsSvc.balanceFor(ctx(tx), patientId);
      // Bemorning barcha rejalari cashier planBalance cost yig'indisi (presented=0, accepted=200000).
      const acc = await cashier.planBalance(ctx(tx), acceptedPlanId);
      const pres = await cashier.planBalance(ctx(tx), presentedPlanId);
      return {
        patientBalance: pb,
        cashierPlanCostSum: acc.totalCost + pres.totalCost,
      };
    });
    // patient stageCostSum (SQL aggregate) === cashier debt cost yig'indisi (pure fn) = 200000.
    // planDebt = 200000 − allocationSum(220000) = −20000.
    expect(cashierPlanCostSum).toBe(200000);
    expect(patientBalance.planDebt).toBe(-20000);
    expect(patientBalance.balance).toBe(-20000);
  });
});
