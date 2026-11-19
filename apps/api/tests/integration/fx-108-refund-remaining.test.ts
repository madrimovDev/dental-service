/**
 * FX-108 (LB-17): refund dialogi/jadvali server qaytaradigan qoldiqni ko'rsatishi uchun
 * tranzaksiya DTO'si `refundedAmount` (shu parentning refund qatorlari yig'indisi) ni qaytaradi.
 * Qisman to'langan sotuvda (total 500000, paid 200000) qoldiq = paid - refunded, total EMAS.
 * Ishga tushirish: `cd apps/api && bun test --env-file=../../.env fx-108-refund-remaining`
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import {
  branches,
  cashierTransactions,
  patients,
  tenants,
  treatmentPlans,
  treatmentStages,
  users,
} from '@dental/db-schema';
import { sql } from 'drizzle-orm';
import type { Context } from 'hono';
import type { DbOrTx } from '../../src/db/client.ts';
import { db } from '../../src/db/client.ts';
import type { AuditLogger } from '../../src/lib/audit-logger.ts';
import { toCashierTransactionDto } from '../../src/modules/cashier/cashier.mapper.ts';
import { createCashierService } from '../../src/modules/cashier/cashier.service.ts';

const noopAudit = { record: async () => {} } as unknown as AuditLogger;
const cashier = createCashierService({ audit: noopAudit });

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

const withTx = <T>(fn: (tx: DbOrTx) => Promise<T>): Promise<T> =>
  db.transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
    return fn(tx);
  });

let partialTxId: string;
let planTxId: string;

beforeAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
  const [owner] = await db
    .insert(users)
    .values({ phone: '+998900000108', passwordHash: 'fake', fullName: 'Owner' })
    .returning({ id: users.id });
  if (!owner) throw new Error('owner');
  userId = owner.id;
  const [tenant] = await db
    .insert(tenants)
    .values({ name: 'FX108', slug: 'fx-108', ownerUserId: userId })
    .returning({ id: tenants.id });
  if (!tenant) throw new Error('tenant');
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
    if (!branch || !p) throw new Error('branch/patient');
    // Qisman to'langan erkin POS sotuvi: jami 500000, to'langan 200000.
    const [partial] = await tx
      .insert(cashierTransactions)
      .values({
        tenantId,
        branchId: branch.id,
        patientId: p.id,
        receiptNumber: 'R-PARTIAL',
        totalAmount: '500000',
        paidAmount: '200000',
        paymentMethod: 'cash',
        type: 'payment',
        status: 'completed',
      })
      .returning({ id: cashierTransactions.id });
    const [plan] = await tx
      .insert(treatmentPlans)
      .values({ tenantId, patientId: p.id, doctorId: userId, title: 'Reja', status: 'accepted' })
      .returning({ id: treatmentPlans.id });
    if (!partial || !plan) throw new Error('partial/plan');
    await tx.insert(treatmentStages).values({
      treatmentPlanId: plan.id,
      sequence: 1,
      serviceName: 'S1',
      cost: '100000',
      acceptance: 'accepted',
    });
    const [planTx] = await tx
      .insert(cashierTransactions)
      .values({
        tenantId,
        branchId: branch.id,
        patientId: p.id,
        treatmentPlanId: plan.id,
        receiptNumber: 'R-PLAN',
        totalAmount: '100000',
        paidAmount: '100000',
        paymentMethod: 'cash',
        type: 'payment',
        status: 'completed',
      })
      .returning({ id: cashierTransactions.id });
    if (!planTx) throw new Error('planTx');
    partialTxId = partial.id;
    planTxId = planTx.id;
  });
});

afterAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
});

const listDtos = () =>
  withTx(async (tx) => {
    const r = await cashier.list(ctx(tx), { page: 1, pageSize: 50 });
    return r.data.map(toCashierTransactionDto);
  });

describe('FX-108: DTO refundedAmount', () => {
  test('refund bo‘lmaganda refundedAmount = 0', async () => {
    const dtos = await listDtos();
    const d = dtos.find((x) => x.id === partialTxId);
    expect(d?.refundedAmount).toBe('0');
  });

  test('qisman to‘langan sotuv: refund paid(200000)ni qaytaradi, total(500000)ni EMAS; refundedAmount shuni aks ettiradi', async () => {
    const res = await withTx((tx) => cashier.refund(ctx(tx), partialTxId));
    expect(res.ok).toBe(true);
    if (res.ok) expect(Number(res.refund.paidAmount)).toBe(200000);
    const d = (await listDtos()).find((x) => x.id === partialTxId);
    expect(d?.refundedAmount).toBe('200000');
    // qoldiq = paid - refunded = 0
    expect(Number(d?.paidAmount) - Number(d?.refundedAmount)).toBe(0);
  });

  test('ketma-ket qisman refundlar (plan): refundedAmount kumulyativ', async () => {
    await withTx((tx) => cashier.refund(ctx(tx), planTxId, 30000));
    await withTx((tx) => cashier.refund(ctx(tx), planTxId, 20000));
    const dtos = await listDtos();
    expect(dtos.find((x) => x.id === planTxId)?.refundedAmount).toBe('50000');
    // refund qatorining o‘zi uchun 0
    const refundRows = dtos.filter((x) => x.parentTransactionId === planTxId);
    expect(refundRows.length).toBe(2);
    for (const r of refundRows) expect(r.refundedAmount).toBe('0');
  });

  test('getById ham refundedAmount ni beradi', async () => {
    const row = await withTx((tx) => cashier.getById(ctx(tx), planTxId));
    expect(row?.refundedAmount).toBe('50000');
  });
});
