/**
 * L2 (davolash-oqimi audit) — queue ↔ appointments sync seam. Real DB + RLS.
 *
 *   CLI-480 — queue `in_progress→missed` sync endi appt'ni `no_show` qiladi
 *             (ilgari `in_progress→no_show` matritsada yo'q edi → jim yiqilib
 *             appt abadiy `in_progress` bo'lib qolardi).
 *   CLI-482 — teskari sync: appt cancel/complete → bog'langan ochiq queue
 *             ticket yopiladi (arvoh ticket qolmaydi).
 *   CLI-483 — no-show sweep check-in'siz (ticket'siz) o'tmish appt'larni ham
 *             `no_show` qiladi.
 *   CLI-486 — cancelled→scheduled reaktivatsiyada recall qayta `scheduled`ga
 *             o'tadi (closeOpenOnRebook endi update() reaktivatsiya yo'lida ham).
 *
 * Bitta faylni ALOHIDA ishlating (TRUNCATE race):
 *   cd apps/api && bun test tests/integration/cli-480-482-483-486-queue-appt-sync.test.ts --env-file=../../.env
 */
import { beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import {
  appointments,
  branches,
  patientNoShowStrikes,
  patients,
  queueTickets,
  recalls,
  tenants,
  users,
} from '@dental/db-schema';
import { eq, sql } from 'drizzle-orm';
import type { Context } from 'hono';
import type { DbOrTx } from '../../src/db/client.ts';
import { db } from '../../src/db/client.ts';
import { createAppointmentsService } from '../../src/modules/appointments/appointments.service.ts';
import { createNoShowStrikesService } from '../../src/modules/no-show-strikes/no-show-strikes.service.ts';
import { createQueueService, type QueueService } from '../../src/modules/queue/queue.service.ts';
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
const noShowStrike = createNoShowStrikesService({ audit: noopAudit });
// Aylanma bog'liqlik (app.ts bilan bir xil deferred-ref pattern): appts teskari
// sync uchun queue'ga, queue forward sync uchun appts'ga muhtoj. Hook faqat
// runtime'da (assignment'dan keyin) chaqiriladi.
let queue: QueueService;
const appts = createAppointmentsService({
  audit: noopAudit,
  recall,
  noShowStrike,
  queue: {
    closeLinkedOpenTicket: (c, appointmentId, ticketStatus) =>
      queue.closeLinkedOpenTicket(c, appointmentId, ticketStatus),
  },
});
queue = createQueueService({ audit: noopAudit, appointments: appts });

beforeAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
  const [owner] = await db
    .insert(users)
    .values({ phone: '+998900000480', passwordHash: 'x', fullName: 'Owner' })
    .returning({ id: users.id });
  ownerId = owner!.id;
  const [tenant] = await db
    .insert(tenants)
    .values({ name: 'Q', slug: 'q-l2-sync', ownerUserId: ownerId, defaultLanguage: 'uz' })
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
      .values({ tenantId, fullName: 'Ali Valiyev', phone: '+998901112280' })
      .returning({ id: patients.id });
    patientId = p!.id;
  });
});

beforeEach(async () => {
  await db.transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
    await tx.delete(patientNoShowStrikes);
    await tx.delete(recalls);
    await tx.execute(sql`DELETE FROM queue_tickets`);
    await tx.delete(appointments);
  });
});

// A2 (CLI-438): dinamik kelajak sana — create() o'tmishga bron qilishni rad etadi.
const day = (() => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + 3);
  return d.toISOString().slice(0, 10);
})();

const book = async (startH: string) => {
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
  return created.appointment.id;
};

const checkIn = (apptId: string) =>
  run(tenantId, (c) => queue.create(c, { branchId, patientId, appointmentId: apptId }));

const apptStatus = (id: string) =>
  db.transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
    const [r] = await tx
      .select({ status: appointments.status })
      .from(appointments)
      .where(eq(appointments.id, id));
    return r?.status;
  });

const ticketStatus = (id: string) =>
  db.transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
    const [r] = await tx
      .select({ status: queueTickets.status })
      .from(queueTickets)
      .where(eq(queueTickets.id, id));
    return r?.status;
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

const recallStatus = (id: string) =>
  db.transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
    const [r] = await tx.select({ status: recalls.status }).from(recalls).where(eq(recalls.id, id));
    return r?.status;
  });

function daysFromDay(n: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

describe('CLI-480 queue in_progress→missed syncs appt to no_show', () => {
  test('called-in then missed → appt no_show + strike + recall reopened', async () => {
    const rId = await seedRecall(daysFromDay(2)); // rebook-relevant → scheduled on booking
    const apptId = await book('09');
    expect(await recallStatus(rId)).toBe('scheduled');

    const ticket = await checkIn(apptId);
    await run(tenantId, (c) => queue.updateStatus(c, ticket.id, { status: 'in_progress' }));
    expect(await apptStatus(apptId)).toBe('in_progress');

    await run(tenantId, (c) => queue.updateStatus(c, ticket.id, { status: 'missed' }));

    // CLI-480: appt endi jim `in_progress`da qolmaydi — `no_show`ga o'tadi.
    expect(await apptStatus(apptId)).toBe('no_show');
    // no-show strike yoziladi (CLI-474 hook), recall pending'ga qaytadi (CLI-426).
    const strikes = await run(tenantId, (c) => noShowStrike.activeCount(c, patientId));
    expect(strikes).toBe(1);
    expect(await recallStatus(rId)).toBe('pending');
  });
});

describe('CLI-482 reverse sync: appt close → linked open ticket closed', () => {
  test('appt completed via calendar → linked waiting ticket becomes done', async () => {
    const apptId = await book('10');
    const ticket = await checkIn(apptId); // waiting, never touched via queue
    // scheduled→in_progress→completed (matritsa faqat in_progress→completed).
    await run(tenantId, (c) => appts.update(c, apptId, { status: 'in_progress' }));
    await run(tenantId, (c) => appts.update(c, apptId, { status: 'completed' }));
    expect(await ticketStatus(ticket.id)).toBe('done');
  });

  test('appt cancelled via calendar → linked waiting ticket becomes missed', async () => {
    const apptId = await book('11');
    const ticket = await checkIn(apptId);
    await run(tenantId, (c) => appts.update(c, apptId, { status: 'cancelled' }));
    expect(await ticketStatus(ticket.id)).toBe('missed');
  });
});

describe('CLI-483 no-show sweep covers ticketless past appointments', () => {
  test('past scheduled appt with no queue ticket → no_show after sweep', async () => {
    // O'tmish appt'ni TO'G'RIDAN-TO'G'RI insert qilamiz — create() o'tmishni rad etadi.
    const past = new Date();
    past.setUTCDate(past.getUTCDate() - 1);
    const pastEnd = new Date(past.getTime() + 60 * 60 * 1000);
    const [pastAppt] = await db.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
      return tx
        .insert(appointments)
        .values({
          tenantId,
          branchId,
          patientId,
          doctorId: ownerId,
          startTime: past,
          endTime: pastEnd,
          serviceIds: [],
          status: 'scheduled',
        })
        .returning({ id: appointments.id });
    });

    // Bugungi (kelajak vaqtli) appt — sweep TEGMASLIGI kerak (kun tugamagan).
    const todayAppt = await book('14');

    const swept = await run(tenantId, (c) => queue.sweepNoShows(c, branchId));

    expect(await apptStatus(pastAppt!.id)).toBe('no_show');
    expect(await apptStatus(todayAppt)).toBe('scheduled');
    expect(swept).toBeGreaterThanOrEqual(1);
  });
});

describe('CLI-486 reactivation re-links recall', () => {
  test('create → cancel → reactivate(scheduled) → recall scheduled again', async () => {
    const rId = await seedRecall(daysFromDay(2));
    const apptId = await book('12');
    expect(await recallStatus(rId)).toBe('scheduled'); // rebook on create

    await run(tenantId, (c) => appts.update(c, apptId, { status: 'cancelled' }));
    expect(await recallStatus(rId)).toBe('pending'); // reopen on cancel

    // CLI-486: reaktivatsiya (cancelled→scheduled) → closeOpenOnRebook qayta otadi.
    await run(tenantId, (c) => appts.update(c, apptId, { status: 'scheduled' }));
    expect(await recallStatus(rId)).toBe('scheduled');
  });
});
