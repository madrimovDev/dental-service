/**
 * Bemor balansi integration test (CLI-67) — balanceFor + list aggregate SQL'ini
 * REAL DB'da ishga tushiradi. Sof helper (patients.balance.test.ts) faqat arifmetikani
 * sinaydi; bu yerda haqiqiy join / GROUP BY / SUM(manfiy allocation) / status filtri /
 * double-count yo'qligi tekshiriladi.
 *
 * Talab: Postgres running, DATABASE_URL .env'da, migration apply qilingan.
 * Ishga tushirish: `cd apps/api && bun test --env-file=../../.env patient-balance`
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
import { createPatientsService } from '../../src/modules/patients/patients.service.ts';

// balanceFor/list faqat getDb(c) (=c.get('db')) va list'da accessClaims o'qiydi; audit chaqirilmaydi.
const noopAudit = { record: async () => {} } as unknown as AuditLogger;
const service = createPatientsService({ audit: noopAudit });

const ctx = (tx: DbOrTx): Context =>
  ({
    get: (k: string) =>
      k === 'db' ? tx : k === 'accessClaims' ? { perms: ['@owner'] } : undefined,
  }) as unknown as Context;

let tenantId: string;
let ownerId: string;
let patientId: string; // balansli bemor
let emptyPatientId: string; // reja/tranzaksiyasiz bemor

beforeAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);

  // Platform jadvallar (RLS yo'q)
  const [owner] = await db
    .insert(users)
    .values({ phone: '+998900000010', passwordHash: 'fake', fullName: 'Owner' })
    .returning({ id: users.id });
  if (!owner) throw new Error('owner insert failed');
  ownerId = owner.id;

  const [tenant] = await db
    .insert(tenants)
    .values({ name: 'Balance Clinic', slug: 'balance-clinic', ownerUserId: ownerId })
    .returning({ id: tenants.id });
  if (!tenant) throw new Error('tenant insert failed');
  tenantId = tenant.id;

  // Tenant-scoped seed — RLS context ichida
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
      .values({ tenantId, fullName: 'Balansli Bemor' })
      .returning({ id: patients.id });
    const [empty] = await tx
      .insert(patients)
      .values({ tenantId, fullName: "Bo'sh Bemor" })
      .returning({ id: patients.id });
    if (!patient || !empty) throw new Error('patient insert failed');
    patientId = patient.id;
    emptyPatientId = empty.id;

    // Accepted reja: S1 cost=100000, S2 cost=50000 → stageCostSum = 150000
    const [acceptedPlan] = await tx
      .insert(treatmentPlans)
      .values({ tenantId, patientId, doctorId: ownerId, title: 'Reja', status: 'accepted' })
      .returning({ id: treatmentPlans.id });
    if (!acceptedPlan) throw new Error('plan insert failed');

    const [s1] = await tx
      .insert(treatmentStages)
      .values({ treatmentPlanId: acceptedPlan.id, sequence: 1, serviceName: 'S1', cost: '100000' })
      .returning({ id: treatmentStages.id });
    const [s2] = await tx
      .insert(treatmentStages)
      .values({ treatmentPlanId: acceptedPlan.id, sequence: 2, serviceName: 'S2', cost: '50000' })
      .returning({ id: treatmentStages.id });
    if (!s1 || !s2) throw new Error('stage insert failed');

    // Draft reja — qarzga KIRMASLIGI kerak (stageCostSum'ga qo'shilmaydi)
    const [draftPlan] = await tx
      .insert(treatmentPlans)
      .values({ tenantId, patientId, doctorId: ownerId, title: 'Draft', status: 'draft' })
      .returning({ id: treatmentPlans.id });
    if (!draftPlan) throw new Error('draft plan insert failed');
    await tx
      .insert(treatmentStages)
      .values({ treatmentPlanId: draftPlan.id, sequence: 1, serviceName: 'D1', cost: '999999' });

    // TX1: plan-linked (P1) to'lov — S1 +40000, S2 +50000. total/paid TRAP: plan-linked
    // nonPlanBalance'da SANALMASLIGI kerak (remainder 50000 noto'g'ri qo'shilib qolmasin).
    const [tx1] = await tx
      .insert(cashierTransactions)
      .values({
        tenantId,
        branchId,
        patientId,
        treatmentPlanId: acceptedPlan.id,
        totalAmount: '90000',
        paidAmount: '40000',
        paymentMethod: 'cash',
        type: 'payment',
        status: 'completed',
      })
      .returning({ id: cashierTransactions.id });
    if (!tx1) throw new Error('tx1 insert failed');

    // TX2: plan-linked refund — S2 −50000 (negatsiya → S2 to'lovi tiklanadi)
    const [tx2] = await tx
      .insert(cashierTransactions)
      .values({
        tenantId,
        branchId,
        patientId,
        treatmentPlanId: acceptedPlan.id,
        totalAmount: '50000',
        paidAmount: '50000',
        paymentMethod: 'cash',
        type: 'refund',
        parentTransactionId: tx1.id,
        status: 'completed',
      })
      .returning({ id: cashierTransactions.id });
    if (!tx2) throw new Error('tx2 insert failed');

    await tx.insert(treatmentStagePayments).values([
      { tenantId, transactionId: tx1.id, stageId: s1.id, amount: '40000' },
      { tenantId, transactionId: tx1.id, stageId: s2.id, amount: '50000' },
      { tenantId, transactionId: tx2.id, stageId: s2.id, amount: '-50000' },
    ]);
    // allocationSum (accepted plan stages) = 40000 + 50000 − 50000 = 40000
    // planDebt = 150000 − 40000 = 110000

    // TX3: plansiz to'lov — completed, plan_id NULL, total 30000 paid 20000 → remainder 10000
    await tx.insert(cashierTransactions).values({
      tenantId,
      branchId,
      patientId,
      treatmentPlanId: null,
      totalAmount: '30000',
      paidAmount: '20000',
      paymentMethod: 'cash',
      type: 'payment',
      status: 'completed',
    });
    // nonPlanBalance = 10000  →  balance = 110000 + 10000 = 120000
  });
});

afterAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
});

describe('Bemor balansi — real DB aggregate', () => {
  test("balanceFor: plan qarzi + plansiz qoldiq, refund negatsiya, draft chiqarilgan, double-count yo'q", async () => {
    const result = await db.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
      return service.balanceFor(ctx(tx), patientId);
    });

    expect(result.planDebt).toBe(110000); // 150000 − 40000 (draft 999999 chiqarilgan)
    expect(result.nonPlanBalance).toBe(10000); // faqat plansiz TX3 (plan-linked TX1/TX2 chiqarilgan)
    expect(result.balance).toBe(120000);
  });

  test('balanceFor: reja/tranzaksiyasiz bemor → 0', async () => {
    const result = await db.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
      return service.balanceFor(ctx(tx), emptyPatientId);
    });
    expect(result).toEqual({ balance: 0, planDebt: 0, nonPlanBalance: 0 });
  });

  test('list: aggregate balanceFor bilan bir xil qiymat qaytaradi', async () => {
    const res = await db.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
      return service.list(ctx(tx), { page: 1, pageSize: 20 });
    });

    const row = res.data.find((p) => p.id === patientId);
    const emptyRow = res.data.find((p) => p.id === emptyPatientId);
    expect(row?.balance).toBe(120000);
    expect(emptyRow?.balance).toBe(0);
  });
});
