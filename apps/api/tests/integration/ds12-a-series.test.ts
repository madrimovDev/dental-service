import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { appointments, branches, patients, tenants, users } from '@dental/db-schema';
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
    .values({ phone: '+998900000098', passwordHash: 'x', fullName: 'SeriesDoc' })
    .returning({ id: users.id });
  ownerId = owner!.id;

  const [tenant] = await db
    .insert(tenants)
    .values({ name: 'SeriesClinic', slug: 'series-clinic', ownerUserId: ownerId })
    .returning({ id: tenants.id });
  tenantId = tenant!.id;

  await db.transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));

    const [branch] = await tx
      .insert(branches)
      .values({ tenantId, name: 'SeriesB', workHours: null })
      .returning({ id: branches.id });
    branchId = branch!.id;

    const [patient] = await tx
      .insert(patients)
      .values({ tenantId, fullName: 'SeriesP' })
      .returning({ id: patients.id });
    const patientId = patient!.id;

    // 2026-06-01 da 3 ta qabul: completed, no_show, cancelled
    const day = '2026-06-01';
    await tx.insert(appointments).values([
      {
        tenantId,
        branchId,
        doctorId: ownerId,
        patientId,
        startTime: new Date(`${day}T09:00:00+05:00`),
        endTime: new Date(`${day}T10:00:00+05:00`),
        status: 'completed',
      },
      {
        tenantId,
        branchId,
        doctorId: ownerId,
        patientId,
        startTime: new Date(`${day}T10:00:00+05:00`),
        endTime: new Date(`${day}T11:00:00+05:00`),
        status: 'no_show',
      },
      {
        tenantId,
        branchId,
        doctorId: ownerId,
        patientId,
        startTime: new Date(`${day}T11:00:00+05:00`),
        endTime: new Date(`${day}T12:00:00+05:00`),
        status: 'cancelled',
      },
    ]);
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

describe('ds12-a: appointmentStats byPeriod', () => {
  test('appointmentStats.byPeriod: kunlik count', async () => {
    const r = await run((c) => service.appointmentStats(c, RANGE));
    // 2026-06-01 da 3 qabul → shu kun count=3
    expect(r.byPeriod.find((p) => p.date === '2026-06-01')?.count).toBe(3);
  });

  test("byPeriod massiv qaytadi (bo'sh bo'lishi mumkin)", async () => {
    const r = await run((c) => service.appointmentStats(c, RANGE));
    expect(Array.isArray(r.byPeriod)).toBe(true);
  });
});
