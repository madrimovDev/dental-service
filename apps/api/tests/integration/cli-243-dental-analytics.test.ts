/**
 * V2-3 (Dental analitika, CLI-243) — dentalAnalytics integration.
 * Nazoratli sanalar: retention (yangi vs qaytgan), recall-efficacy, procedure-mix,
 * no-show. REAL DB (RLS).
 *
 * Ishga tushirish: `cd apps/api && bun test --env-file=../../.env cli-243-dental-analytics`
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import {
  appointments,
  branches,
  cashierTransactionItems,
  cashierTransactions,
  patients,
  recalls,
  tenants,
  users,
} from '@dental/db-schema';
import { sql } from 'drizzle-orm';
import type { Context } from 'hono';
import type { DbOrTx } from '../../src/db/client.ts';
import { db } from '../../src/db/client.ts';
import type { AuditLogger } from '../../src/lib/audit-logger.ts';
import { createReportsService } from '../../src/modules/reports/reports.service.ts';

const noopAudit = { record: async () => {} } as unknown as AuditLogger;
const service = createReportsService({ audit: noopAudit });
let tenantId: string;
const ctx = (tx: DbOrTx): Context =>
  ({ get: (k: string) => (k === 'db' ? tx : undefined) }) as unknown as Context;

const RANGE = { from: '2026-03-01', to: '2026-03-31' };

const run = <T>(fn: (c: Context) => Promise<T>): Promise<T> =>
  db.transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
    return fn(ctx(tx));
  });

beforeAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
  const [owner] = await db
    .insert(users)
    .values({ phone: '+998900000028', passwordHash: 'x', fullName: 'Doc' })
    .returning({ id: users.id });
  if (!owner) throw new Error('owner');
  const [tenant] = await db
    .insert(tenants)
    .values({ name: 'Analytics Clinic', slug: 'analytics-clinic', ownerUserId: owner.id })
    .returning({ id: tenants.id });
  if (!tenant) throw new Error('tenant');
  tenantId = tenant.id;

  await db.transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
    const [branch] = await tx
      .insert(branches)
      .values({ tenantId, name: 'Main' })
      .returning({ id: branches.id });
    if (!branch) throw new Error('branch');

    // Yangi bemor (oraliqda yaratilgan)
    const [pNew] = await tx
      .insert(patients)
      .values({ tenantId, fullName: 'Yangi', createdAt: new Date('2026-03-15T10:00:00+05:00') })
      .returning({ id: patients.id });
    // Qaytgan bemor (oraliqdan oldin yaratilgan) + oraliqda yozilgan
    const [pOld] = await tx
      .insert(patients)
      .values({ tenantId, fullName: 'Qaytgan', createdAt: new Date('2026-01-01T10:00:00+05:00') })
      .returning({ id: patients.id });
    if (!pNew || !pOld) throw new Error('patients');

    await tx.insert(appointments).values([
      {
        tenantId,
        branchId: branch.id,
        patientId: pOld.id,
        doctorId: owner.id,
        startTime: new Date('2026-03-10T09:00:00+05:00'),
        endTime: new Date('2026-03-10T10:00:00+05:00'),
        status: 'completed',
      },
      {
        tenantId,
        branchId: branch.id,
        patientId: pNew.id,
        doctorId: owner.id,
        startTime: new Date('2026-03-11T09:00:00+05:00'),
        endTime: new Date('2026-03-11T10:00:00+05:00'),
        status: 'no_show',
      },
    ]);

    // Procedure-mix — kassa item
    const [txn] = await tx
      .insert(cashierTransactions)
      .values({
        tenantId,
        branchId: branch.id,
        patientId: pOld.id,
        receiptNumber: 'AN-1',
        totalAmount: '200000',
        paidAmount: '200000',
        paymentMethod: 'cash',
        type: 'payment',
        status: 'completed',
        createdAt: new Date('2026-03-12T10:00:00+05:00'),
      })
      .returning({ id: cashierTransactions.id });
    if (!txn) throw new Error('txn');
    await tx.insert(cashierTransactionItems).values({
      transactionId: txn.id,
      serviceName: 'Plomba',
      quantity: 2,
      unitPrice: '100000',
      subtotal: '200000',
    });

    // Recalls — 4 ta, statuslar: pending, contacted, scheduled, completed → converted=2
    await tx.insert(recalls).values(
      (['pending', 'contacted', 'scheduled', 'completed'] as const).map((status) => ({
        tenantId,
        patientId: pOld.id,
        reason: 'preventive' as const,
        source: 'manual' as const,
        status,
        dueDate: '2026-03-20',
        createdAt: new Date('2026-03-05T10:00:00+05:00'),
      })),
    );
  });
});

afterAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
});

describe('dentalAnalytics — real DB', () => {
  test('procedure-mix: Plomba 2 dona, revenue 200000', async () => {
    const r = await run((c) => service.dentalAnalytics(c, RANGE));
    const plomba = r.procedureMix.find((p) => p.serviceName === 'Plomba');
    expect(plomba?.count).toBe(2);
    expect(plomba?.revenue).toBe(200000);
  });

  test('retention: 1 yangi + 1 qaytgan → rate 0.5', async () => {
    const r = await run((c) => service.dentalAnalytics(c, RANGE));
    expect(r.retention.newPatients).toBe(1);
    expect(r.retention.returningPatients).toBe(1);
    expect(r.retention.retentionRate).toBe(0.5);
  });

  test('recall-efficacy: 4 total, 2 converted → 0.5', async () => {
    const r = await run((c) => service.dentalAnalytics(c, RANGE));
    expect(r.recallEfficacy.total).toBe(4);
    expect(r.recallEfficacy.converted).toBe(2);
    expect(r.recallEfficacy.efficacy).toBe(0.5);
  });

  test('no-show: kamida bitta kunda no_show bor', async () => {
    const r = await run((c) => service.dentalAnalytics(c, RANGE));
    const totalNoShow = r.noShowByWeekday.reduce((s, w) => s + w.noShow, 0);
    expect(totalNoShow).toBe(1);
  });
});
