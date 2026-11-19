/**
 * FX-58 — bot «Bekor» tugmasi erta check-in qilingan (ochiq navbat chiptali) yozilishni
 * bekor qilmaydi: bot service'ida queue reverse-sync yo'q, shuning uchun chipta arvoh
 * bo'lib qolardi. Ochiq (waiting/in_progress) chipta bor → `already`, hech narsa o'zgarmaydi.
 * Chipta yo'q yoki terminal (done/missed) → odatdagidek bekor qilinadi. REAL DB + RLS.
 *
 *   cd apps/api && bun test --env-file=../../.env --timeout 30000 tests/integration/fx-58-bot-cancel-open-ticket.test.ts
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { appointments, branches, patients, queueTickets, tenants, users } from '@dental/db-schema';
import { eq, sql } from 'drizzle-orm';
import type { DbOrTx } from '../../src/db/client.ts';
import { db } from '../../src/db/client.ts';
import { handleReminderAction } from '../../src/lib/telegram/reminder-actions.ts';
import { createAppointmentsService } from '../../src/modules/appointments/appointments.service.ts';
import { createScheduleService } from '../../src/modules/schedule/schedule.service.ts';

let tenantId: string;
let doctorId: string;
let branchId: string;
let patientId: string;
const CHAT = '777058';

const run = <T>(fn: (tx: DbOrTx) => Promise<T>) =>
  db.transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
    return fn(tx);
  });

const noopAudit = { record: async () => {} };
const schedule = createScheduleService({ audit: noopAudit });
// Production bot kompozitsiyasi: queue reverse-sync ULANMAGAN.
const svc = createAppointmentsService({ audit: noopAudit, schedule });

// Kelajakdagi (Dushanba) kun.
const DAY = '2026-12-21';
const at = (h: string) => new Date(`${DAY}T${h}:00+05:00`);

const seedAppt = (startH: string) =>
  run(async (tx) => {
    const [a] = await tx
      .insert(appointments)
      .values({
        tenantId,
        branchId,
        patientId,
        doctorId,
        startTime: at(startH),
        endTime: new Date(at(startH).getTime() + 30 * 60_000),
        serviceIds: [],
        status: 'scheduled',
      })
      .returning();
    return a!;
  });

let queueNo = 0;
const seedTicket = (appointmentId: string, status: 'waiting' | 'in_progress' | 'done' | 'missed') =>
  run(async (tx) => {
    queueNo += 1;
    const [tk] = await tx
      .insert(queueTickets)
      .values({
        tenantId,
        branchId,
        patientId,
        doctorId,
        appointmentId,
        queueNumber: queueNo,
        status,
      })
      .returning();
    return tk!;
  });

const apptStatus = (id: string) =>
  run(async (tx) => {
    const [a] = await tx.select().from(appointments).where(eq(appointments.id, id));
    return a!.status;
  });
const ticketStatus = (id: string) =>
  run(async (tx) => {
    const [t] = await tx.select().from(queueTickets).where(eq(queueTickets.id, id));
    return t!.status;
  });

const press = (action: 'ok' | 'no' | 're', appointmentId: string) =>
  run((tx) =>
    handleReminderAction(
      tx,
      { appointments: svc },
      { tenantId, chatId: CHAT, action, appointmentId },
    ),
  );

beforeAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
  const [u] = await db
    .insert(users)
    .values({ phone: '+998900000058', passwordHash: 'x', fullName: 'Dr FX58' })
    .returning({ id: users.id });
  doctorId = u!.id;
  const [t] = await db
    .insert(tenants)
    .values({ name: 'T58', slug: 'fx58', ownerUserId: doctorId })
    .returning({ id: tenants.id });
  tenantId = t!.id;
  await run(async (tx) => {
    const [b] = await tx
      .insert(branches)
      .values({
        tenantId,
        name: 'B',
        workHours: Object.fromEntries(
          ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map((d) => [
            d,
            { open: '09:00', close: '18:00' },
          ]),
        ),
      })
      .returning({ id: branches.id });
    branchId = b!.id;
    const [p] = await tx
      .insert(patients)
      .values({ tenantId, fullName: 'P58', phone: '+998903580001', telegramChatId: CHAT })
      .returning({ id: patients.id });
    patientId = p!.id;
  });
});

afterAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
});

describe('FX-58 — bot «Bekor» ochiq navbat chiptasi bor yozilishni bekor qilmaydi', () => {
  test('waiting chipta → already; yozilish ham, chipta ham o`zgarmaydi', async () => {
    const a = await seedAppt('10:00');
    const tk = await seedTicket(a.id, 'waiting');
    const r = await press('no', a.id);
    expect(r.outcome).toBe('already');
    expect(await apptStatus(a.id)).toBe('scheduled');
    expect(await ticketStatus(tk.id)).toBe('waiting');
  });

  test('in_progress chipta → already', async () => {
    const a = await seedAppt('11:00');
    const tk = await seedTicket(a.id, 'in_progress');
    const r = await press('no', a.id);
    expect(r.outcome).toBe('already');
    expect(await apptStatus(a.id)).toBe('scheduled');
    expect(await ticketStatus(tk.id)).toBe('in_progress');
  });

  test('chipta yo`q → cancelled (regressiya)', async () => {
    const a = await seedAppt('12:00');
    const r = await press('no', a.id);
    expect(r.outcome).toBe('cancelled');
    expect(await apptStatus(a.id)).toBe('cancelled');
  });

  test('terminal (missed) chipta → cancelled (ochiq chipta emas)', async () => {
    const a = await seedAppt('13:00');
    await seedTicket(a.id, 'missed');
    const r = await press('no', a.id);
    expect(r.outcome).toBe('cancelled');
  });
});
