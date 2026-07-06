/**
 * CLI-426 — recall rebook relevance + reopen on cancel/no_show. Real DB + RLS.
 *
 * Bitta faylni ALOHIDA ishlating (TRUNCATE race):
 *   cd apps/api && bun test tests/integration/recall-rebook.test.ts --env-file=../../.env
 */
import { beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { branches, patients, recalls, tenants, users } from '@dental/db-schema';
import { eq, sql } from 'drizzle-orm';
import type { Context } from 'hono';
import type { DbOrTx } from '../../src/db/client.ts';
import { db } from '../../src/db/client.ts';
import { createAppointmentsService } from '../../src/modules/appointments/appointments.service.ts';
import { createRecallsService } from '../../src/modules/recalls/recalls.service.ts';

let tenantId: string;
let ownerId: string;
let patientId: string;
let branchId: string;

const ctx = (tx: DbOrTx, tId: string): Context =>
  ({
    get: (k: string) =>
      k === 'db' ? tx : k === 'activeTenantId' ? tId : k === 'user' ? { id: ownerId } : undefined,
  }) as unknown as Context;

const run = <T>(tId: string, fn: (c: Context) => Promise<T>) =>
  db.transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tId}'`));
    return fn(ctx(tx, tId));
  });

const noopAudit = { record: async () => {} };
const recall = createRecallsService({ audit: noopAudit });
const appts = createAppointmentsService({ audit: noopAudit, recall });

beforeAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
  const [owner] = await db
    .insert(users)
    .values({ phone: '+998900000426', passwordHash: 'x', fullName: 'Owner' })
    .returning({ id: users.id });
  ownerId = owner!.id;
  const [tenant] = await db
    .insert(tenants)
    .values({ name: 'R', slug: 'r-rebook', ownerUserId: ownerId, defaultLanguage: 'uz' })
    .returning({ id: tenants.id });
  tenantId = tenant!.id;

  await db.transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
    const [b] = await tx
      .insert(branches)
      .values({ tenantId, name: 'B' })
      .returning({ id: branches.id });
    branchId = b!.id;
    const [p] = await tx
      .insert(patients)
      .values({ tenantId, fullName: 'Ali Valiyev', phone: '+998901112255' })
      .returning({ id: patients.id });
    patientId = p!.id;
  });
});

beforeEach(async () => {
  await db.transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
    await tx.delete(recalls);
  });
});

const seedRecall = (dueDate: string) =>
  db.transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
    const [r] = await tx
      .insert(recalls)
      .values({
        tenantId,
        patientId,
        reason: 'preventive',
        status: 'pending',
        source: 'appointment',
        dueDate,
      })
      .returning({ id: recalls.id });
    return r!.id;
  });

const readStatus = (id: string) =>
  db.transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
    const [r] = await tx
      .select({ status: recalls.status, link: recalls.scheduledAppointmentId })
      .from(recalls)
      .where(eq(recalls.id, id));
    return r;
  });

const day = '2026-07-06';
const book = (startH: string) =>
  run(tenantId, (c) =>
    appts.create(c, {
      branchId,
      patientId,
      doctorId: ownerId,
      startTime: `${day}T${startH}:00+05:00`,
      endTime: `${day}T${startH.replace(/^(\d\d)/, (h) => String(Number(h) + 1).padStart(2, '0'))}:00+05:00`,
      serviceIds: [],
    }),
  );

describe('CLI-426 rebook relevance', () => {
  test('long-future preventive (due +4mo) stays pending on today booking', async () => {
    const rId = await seedRecall('2026-11-06');
    await book('09');
    const r = await readStatus(rId);
    expect(r?.status).toBe('pending');
    expect(r?.link).toBeNull();
  });

  test('recall due in 10 days → scheduled + linked on booking', async () => {
    const rId = await seedRecall('2026-07-16');
    const created = await book('10');
    expect(created.ok).toBe(true);
    const r = await readStatus(rId);
    expect(r?.status).toBe('scheduled');
    expect(r?.link).not.toBeNull();
  });
});

describe('CLI-426 reopen on cancel/no_show', () => {
  test('cancel reopens the recall to pending, clears link', async () => {
    const rId = await seedRecall('2026-07-08');
    const created = await book('11');
    expect(created.ok).toBe(true);
    if (!created.ok || !created.appointment) return;
    expect((await readStatus(rId))?.status).toBe('scheduled');

    await run(tenantId, (c) => appts.update(c, created.appointment!.id, { status: 'cancelled' }));
    const r = await readStatus(rId);
    expect(r?.status).toBe('pending');
    expect(r?.link).toBeNull();
  });

  test('no_show reopens the recall to pending', async () => {
    const rId = await seedRecall('2026-07-08');
    const created = await book('12');
    if (!created.ok || !created.appointment) return;
    await run(tenantId, (c) => appts.update(c, created.appointment!.id, { status: 'no_show' }));
    expect((await readStatus(rId))?.status).toBe('pending');
  });
});
