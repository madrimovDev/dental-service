/**
 * Cashier list date-range guard (CLI-152) — REAL DB.
 * Bugun yaratilgan tranzaksiya `from=to=today` (date-only) filtri bilan ro'yxatda
 * KO'RINISHI kerak. Avval `between(createdAt, new Date(to))` `to` ni UTC yarim tunга
 * aylantirib, o'sha kuni yaratilgan tranzaksiyalarni chiqarib tashlardi → "Bugungi
 * operatsiyalar" doim bo'sh. Fix: Asia/Tashkent kun chegarasi (dailySummary bilan izchil).
 *
 * Ishga tushirish: `cd apps/api && bun test --env-file=../../.env cashier-list-daterange`
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { branches, cashierTransactions, patients, tenants, users } from '@dental/db-schema';
import { sql } from 'drizzle-orm';
import type { Context } from 'hono';
import type { DbOrTx } from '../../src/db/client.ts';
import { db } from '../../src/db/client.ts';
import type { AuditLogger } from '../../src/lib/audit-logger.ts';
import { createCashierService } from '../../src/modules/cashier/cashier.service.ts';

const noopAudit = { record: async () => {} } as unknown as AuditLogger;
const service = createCashierService({ audit: noopAudit });

const ctx = (tx: DbOrTx): Context =>
  ({
    get: (k: string) =>
      k === 'db' ? tx : k === 'accessClaims' ? { perms: ['@owner'] } : undefined,
  }) as unknown as Context;

/** Asia/Tashkent (UTC+5) kalendar sanasi — `new Date()` UTC yarim tun chalkashligisiz. */
const tashkentToday = (): string => {
  const now = new Date();
  const tashkent = new Date(now.getTime() + 5 * 60 * 60 * 1000);
  return tashkent.toISOString().slice(0, 10);
};

let tenantId: string;
let ownerId: string;
let branchId: string;
let patientId: string;

beforeAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);

  const [owner] = await db
    .insert(users)
    .values({ phone: '+998900000020', passwordHash: 'fake', fullName: 'Owner' })
    .returning({ id: users.id });
  if (!owner) throw new Error('owner insert failed');
  ownerId = owner.id;

  const [tenant] = await db
    .insert(tenants)
    .values({ name: 'Cashier Clinic', slug: 'cashier-clinic', ownerUserId: ownerId })
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

    // createdAt = DB default now() → bugungi (Tashkent) tranzaksiya.
    await tx.insert(cashierTransactions).values({
      tenantId,
      branchId,
      patientId,
      totalAmount: '250000',
      paidAmount: '250000',
      paymentMethod: 'cash',
      type: 'payment',
      status: 'completed',
    });
  });
});

afterAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
});

describe("Cashier list — bugungi sana oralig'i (CLI-152)", () => {
  test("from=to=today: bugun yaratilgan tranzaksiya ro'yxatda ko'rinadi", async () => {
    const today = tashkentToday();
    const res = await db.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
      return service.list(ctx(tx), {
        page: 1,
        pageSize: 100,
        branchId,
        from: today,
        to: today,
      });
    });

    expect(res.meta.total).toBe(1);
    expect(res.data[0]?.patientId).toBe(patientId);
    expect(res.data[0]?.paidAmount).toBe('250000.00');
  });
});
