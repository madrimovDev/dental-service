/**
 * C6 (CLI-223) — plan estimate REAL DB. Tasdiqlaydi: estimate breakdown C4 qarz
 * predikatiga MOS (debtEligible = accepted ∧ non-skipped ∧ plan debt-status) va
 * totallar (proposed/accepted/paid/balance) cashier planBalance bilan izchil.
 *
 * Ishga tushirish (yolg'iz — TRUNCATE poygasi):
 *   cd apps/api && bun test tests/integration/cli-223-plan-estimate.test.ts --env-file=../../.env
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
import { createTreatmentPlansService } from '../../src/modules/clinical/treatment-plans/treatment-plans.service.ts';

const noopAudit = { record: async () => {} } as unknown as AuditLogger;
const service = createTreatmentPlansService({ audit: noopAudit });

const ctx = (tx: DbOrTx): Context =>
  ({
    get: (k: string) =>
      k === 'db' ? tx : k === 'accessClaims' ? { perms: ['@owner'] } : undefined,
  }) as unknown as Context;

let tenantId: string;
let ownerId: string;
let acceptedPlanId: string;
let presentedPlanId: string;

beforeAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);

  const [owner] = await db
    .insert(users)
    .values({ phone: '+998900000050', passwordHash: 'fake', fullName: 'Owner' })
    .returning({ id: users.id });
  if (!owner) throw new Error('owner insert failed');
  ownerId = owner.id;

  const [tenant] = await db
    .insert(tenants)
    .values({ name: 'Estimate Clinic', slug: 'estimate-clinic', ownerUserId: ownerId })
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
      .values({ tenantId, fullName: 'Estimate Bemor' })
      .returning({ id: patients.id });
    if (!patient) throw new Error('patient insert failed');
    const patientId = patient.id;

    // Accepted reja: A=accepted 200000 (qarz), P=proposed 50000, R=rejected 70000+paid, S=skipped 90000+paid
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

    // Presented reja: accepted bosqich bilan ham qarz YO'Q (plan-status konjunkti).
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

describe('C6 — plan estimate breakdown', () => {
  test('accepted reja: totallar C4 predikatiga mos; debtEligible per-stage', async () => {
    const est = await db.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
      return service.estimate(ctx(tx), acceptedPlanId);
    });
    if (!est) throw new Error('estimate null');

    expect(est.status).toBe('accepted');
    expect(est.totalProposed).toBe(50000); // P
    expect(est.totalAccepted).toBe(200000); // C4 debt-eligible = faqat A
    expect(est.totalCost).toBe(410000); // 200+50+70+90 (xom)
    expect(est.totalPaid).toBe(220000); // barcha allocation
    expect(est.balance).toBe(-20000); // 200000 − 220000 = kredit

    const byName = (n: string) => est.stages.find((x) => x.serviceName === n);
    expect(byName('A')?.debtEligible).toBe(true);
    expect(byName('P')?.debtEligible).toBe(false);
    expect(byName('R')?.debtEligible).toBe(false);
    expect(byName('S')?.debtEligible).toBe(false);
    expect(byName('R')?.paid).toBe(70000); // allocation per-stage saqlanadi (kredit)
  });

  test('presented reja: hech bir bosqich debtEligible emas (plan-status)', async () => {
    const est = await db.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
      return service.estimate(ctx(tx), presentedPlanId);
    });
    if (!est) throw new Error('estimate null');
    expect(est.totalAccepted).toBe(0);
    expect(est.stages[0]?.debtEligible).toBe(false);
  });
});
