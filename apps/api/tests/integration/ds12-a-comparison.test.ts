import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import {
  appointments,
  branches,
  cashierTransactions,
  patients,
  tenants,
  users,
} from '@dental/db-schema';
import { sql } from 'drizzle-orm';
import type { Context } from 'hono';
import type { DbOrTx } from '../../src/db/client.ts';
import { db } from '../../src/db/client.ts';
import { createReportsService } from '../../src/modules/reports/reports.service.ts';

const service = createReportsService();
const ctx = (tx: DbOrTx): Context =>
  ({
    get: (k: string) =>
      k === 'db' ? tx : k === 'accessClaims' ? { perms: ['@owner'] } : undefined,
  }) as unknown as Context;

const RANGE = { from: '2026-06-01', to: '2026-06-30' };

let tenantId: string;
let ownerId: string;
let branchId: string;

beforeAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);

  const [owner] = await db
    .insert(users)
    .values({ phone: '+998900000099', passwordHash: 'x', fullName: 'CompDoc' })
    .returning({ id: users.id });
  ownerId = owner!.id;

  const [tenant] = await db
    .insert(tenants)
    .values({ name: 'CompClinic', slug: 'comp-clinic', ownerUserId: ownerId })
    .returning({ id: tenants.id });
  tenantId = tenant!.id;

  await db.transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));

    const [branch] = await tx
      .insert(branches)
      .values({ tenantId, name: 'CompB', workHours: null })
      .returning({ id: branches.id });
    branchId = branch!.id;

    const [patient] = await tx
      .insert(patients)
      .values({ tenantId, fullName: 'CompP' })
      .returning({ id: patients.id });
    const patientId = patient!.id;

    // Joriy oy (2026-06-15): 130000 daromad
    await tx.insert(cashierTransactions).values({
      tenantId,
      branchId,
      patientId,
      totalAmount: '130000',
      paidAmount: '130000',
      paymentMethod: 'cash',
      type: 'payment',
      status: 'completed',
      createdAt: new Date('2026-06-15T10:00:00+05:00'),
    });

    // Oldingi oy (2026-05-15): 100000 daromad
    // prevFrom = shiftDays('2026-05-31', -29) = 2026-05-02; 05-15 ichida → OK
    await tx.insert(cashierTransactions).values({
      tenantId,
      branchId,
      patientId,
      totalAmount: '100000',
      paidAmount: '100000',
      paymentMethod: 'cash',
      type: 'payment',
      status: 'completed',
      createdAt: new Date('2026-05-15T10:00:00+05:00'),
    });

    // YoY (2025-06-15): ma'lumot yo'q → yoy null kutiladi

    // Joriy oy appointment (2026-06-15): faqat 1 ta
    await tx.insert(appointments).values({
      tenantId,
      branchId,
      doctorId: ownerId,
      patientId,
      startTime: new Date('2026-06-15T09:00:00+05:00'),
      endTime: new Date('2026-06-15T10:00:00+05:00'),
      status: 'completed',
    });

    // Oldingi oyda appointment YO'Q → appointment comparison.previous null kutiladi
  });
});

afterAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
});

const run = <T>(fn: (c: Context) => Promise<T>) =>
  db.transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
    return fn(ctx(tx));
  });

describe('ds12-a: revenue comparison', () => {
  test("previous to'la → deltaPct; yoy bo'sh → null", async () => {
    const r = await run((c) => service.revenue(c, RANGE));
    expect(r.comparison.previous).not.toBeNull();
    expect(r.comparison.previous?.total).toBe(100000); // 2026-05 oldingi 30 kun
    expect(r.comparison.previous?.deltaPct).toBeCloseTo(30, 1); // (130000-100000)/100000
    expect(r.comparison.yoy).toBeNull(); // 2025-06 da data yo'q
  });
});

describe('ds12-a: appointment comparison', () => {
  test("previous bo'sh → null (oldingi oyda qabul yo'q)", async () => {
    const r = await run((c) => service.appointmentStats(c, RANGE));
    expect(r.comparison.previous).toBeNull(); // 2026-05 da appt yo'q
  });
});
