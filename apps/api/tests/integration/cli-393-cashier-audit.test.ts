/**
 * CLI-393 — cashier.service.ts o'qish funksiyalari (list/getById/dailySummary/
 * planBalance/listPatientPlans) audit_log'ga 'viewed' yozuvi qo'shishini tasdiqlaydi.
 * REAL DB + real audit logger. Audit `after`da moliyaviy summa YO'Q (faqat count/date).
 *
 * Ishga tushirish: `cd apps/api && bun test --env-file=../../.env cli-393-cashier`
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import {
  auditLog,
  branches,
  cashierTransactions,
  patients,
  tenants,
  treatmentPlans,
  treatmentStages,
  users,
} from '@dental/db-schema';
import { and, eq, sql } from 'drizzle-orm';
import type { Context } from 'hono';
import type { DbOrTx } from '../../src/db/client.ts';
import { db } from '../../src/db/client.ts';
import { createAuditLogger } from '../../src/lib/audit-logger.ts';
import { createCashierService } from '../../src/modules/cashier/cashier.service.ts';

const audit = createAuditLogger({ db });
const service = createCashierService({ audit });

let tenantId: string;
let userId: string;
let branchId: string;
let patientId: string;
let planId: string;
let transactionId: string;

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

beforeAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);

  const [owner] = await db
    .insert(users)
    .values({ phone: '+998900000090', passwordHash: 'x', fullName: 'Doctor' })
    .returning({ id: users.id });
  if (!owner) throw new Error('owner insert failed');
  userId = owner.id;

  const [tenant] = await db
    .insert(tenants)
    .values({ name: 'Cashier Audit Clinic', slug: 'cashier-audit-clinic', ownerUserId: userId })
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
    branchId = branch.id;

    const [patient] = await tx
      .insert(patients)
      .values({ tenantId, fullName: 'Bemor' })
      .returning({ id: patients.id });
    if (!patient) throw new Error('patient insert failed');
    patientId = patient.id;

    const [plan] = await tx
      .insert(treatmentPlans)
      .values({ tenantId, patientId, doctorId: userId, title: 'Reja', status: 'accepted' })
      .returning({ id: treatmentPlans.id });
    if (!plan) throw new Error('plan insert failed');
    planId = plan.id;

    await tx.insert(treatmentStages).values({
      treatmentPlanId: planId,
      sequence: 1,
      serviceName: 'Davolash',
      cost: '200000',
      status: 'pending',
      acceptance: 'accepted',
    });

    const [transaction] = await tx
      .insert(cashierTransactions)
      .values({
        tenantId,
        branchId,
        patientId,
        treatmentPlanId: planId,
        receiptNumber: 'R-20260515-TEST0001',
        totalAmount: '100000',
        paidAmount: '100000',
        paymentMethod: 'cash',
        type: 'payment',
        status: 'completed',
        createdAt: new Date('2026-05-15T10:00:00+05:00'),
      })
      .returning({ id: cashierTransactions.id });
    if (!transaction) throw new Error('transaction insert failed');
    transactionId = transaction.id;
  });
});

afterAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
});

const selectAuditRows = (...conds: Parameters<typeof and>) =>
  db.transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
    return tx
      .select()
      .from(auditLog)
      .where(and(...conds));
  });

describe('Cashier — o‘qish audit (CLI-393)', () => {
  test('list(): action=viewed/resourceType=cashier_transaction/resourceId=patientId, summa yo‘q', async () => {
    await db.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
      await service.list(ctx(tx), { page: 1, pageSize: 20, patientId });
    });

    const rows = await selectAuditRows(
      eq(auditLog.action, 'viewed'),
      eq(auditLog.resourceType, 'cashier_transaction'),
      eq(auditLog.resourceId, patientId),
    );
    expect(rows.length).toBeGreaterThanOrEqual(1);
    expect(JSON.stringify(rows[0]?.after ?? {})).not.toContain('100000');
  });

  test('getById(): resourceId=transaction.id', async () => {
    await db.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
      await service.getById(ctx(tx), transactionId);
    });

    const rows = await selectAuditRows(
      eq(auditLog.action, 'viewed'),
      eq(auditLog.resourceType, 'cashier_transaction'),
      eq(auditLog.resourceId, transactionId),
    );
    expect(rows.length).toBeGreaterThanOrEqual(1);
  });

  test('dailySummary(): resourceId=branchId, summa yo‘q (faqat date/count)', async () => {
    await db.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
      await service.dailySummary(ctx(tx), branchId, '2026-05-15');
    });

    const rows = await selectAuditRows(
      eq(auditLog.action, 'viewed'),
      eq(auditLog.resourceType, 'cashier_transaction'),
      eq(auditLog.resourceId, branchId),
    );
    expect(rows.length).toBeGreaterThanOrEqual(1);
    expect(JSON.stringify(rows[0]?.after ?? {})).not.toContain('100000');
  });

  test('planBalance(): resourceType=treatment_plan/resourceId=planId, summa yo‘q', async () => {
    await db.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
      await service.planBalance(ctx(tx), planId);
    });

    const rows = await selectAuditRows(
      eq(auditLog.action, 'viewed'),
      eq(auditLog.resourceType, 'treatment_plan'),
      eq(auditLog.resourceId, planId),
    );
    expect(rows.length).toBeGreaterThanOrEqual(1);
    expect(JSON.stringify(rows[0]?.after ?? {})).not.toContain('200000');
  });

  test('listPatientPlans(): resourceType=treatment_plan/resourceId=patientId', async () => {
    await db.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
      await service.listPatientPlans(ctx(tx), patientId);
    });

    const rows = await selectAuditRows(
      eq(auditLog.action, 'viewed'),
      eq(auditLog.resourceType, 'treatment_plan'),
      eq(auditLog.resourceId, patientId),
    );
    expect(rows.length).toBeGreaterThanOrEqual(1);
  });
});
