/**
 * CLI-425 — queue done→completed shared path fires preventive recall. Real DB + RLS.
 *
 * Bitta faylni ALOHIDA ishlating (TRUNCATE race):
 *   cd apps/api && bun test tests/integration/queue-recall.test.ts --env-file=../../.env
 */
import { beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { appointments, branches, patients, recalls, tenants, users } from '@dental/db-schema';
import { sql } from 'drizzle-orm';
import type { Context } from 'hono';
import type { DbOrTx } from '../../src/db/client.ts';
import { db } from '../../src/db/client.ts';
import { createAppointmentsService } from '../../src/modules/appointments/appointments.service.ts';
import { createQueueService } from '../../src/modules/queue/queue.service.ts';
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
const queue = createQueueService({ audit: noopAudit, appointments: appts });

beforeAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
  const [owner] = await db
    .insert(users)
    .values({ phone: '+998900000425', passwordHash: 'x', fullName: 'Owner' })
    .returning({ id: users.id });
  ownerId = owner!.id;
  const [tenant] = await db
    .insert(tenants)
    .values({ name: 'Q', slug: 'q-recall', ownerUserId: ownerId, defaultLanguage: 'uz' })
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
      .values({ tenantId, fullName: 'Ali Valiyev', phone: '+998901112266' })
      .returning({ id: patients.id });
    patientId = p!.id;
  });
});

beforeEach(async () => {
  await db.transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
    await tx.delete(recalls);
    await tx.execute(sql`DELETE FROM queue_tickets`);
    await tx.delete(appointments);
  });
});

const countPreventive = () =>
  db.transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
    const rows = await tx
      .select({ id: recalls.id })
      .from(recalls)
      .where(sql`${recalls.patientId} = ${patientId} AND ${recalls.reason} = 'preventive'`);
    return rows.length;
  });

const day = '2026-07-06';
const bookAndCheckIn = async (startH: string) => {
  const created = await run(tenantId, (c) =>
    appts.create(c, {
      branchId,
      patientId,
      doctorId: ownerId,
      startTime: `${day}T${startH}:00+05:00`,
      endTime: `${day}T${Number(startH) + 1}:00:00+05:00`,
      serviceIds: [],
    }),
  );
  if (!created.ok || !created.appointment) throw new Error('booking failed');
  const ticket = await run(tenantId, (c) =>
    queue.create(c, { branchId, patientId, appointmentId: created.appointment!.id }),
  );
  return { apptId: created.appointment.id, ticketId: ticket.id };
};

describe('CLI-425 queue done → preventive recall', () => {
  test('check-in → done → 1 preventive recall created', async () => {
    const { ticketId } = await bookAndCheckIn('09');
    await run(tenantId, (c) => queue.updateStatus(c, ticketId, { status: 'done' }));
    expect(await countPreventive()).toBe(1);
  });

  test('idempotent done twice → still exactly 1 recall', async () => {
    const { ticketId } = await bookAndCheckIn('10');
    await run(tenantId, (c) => queue.updateStatus(c, ticketId, { status: 'done' }));
    await run(tenantId, (c) => queue.updateStatus(c, ticketId, { status: 'done' }));
    expect(await countPreventive()).toBe(1);
  });

  test('walk-in ticket (no appointment) done → no recall, no error', async () => {
    const ticket = await run(tenantId, (c) => queue.create(c, { branchId, patientId }));
    await run(tenantId, (c) => queue.updateStatus(c, ticket.id, { status: 'done' }));
    expect(await countPreventive()).toBe(0);
  });
});
