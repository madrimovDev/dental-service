/**
 * FX-36 (LA-09) — faol→faol status o'tishi (scheduled→confirmed/in_progress) jadval
 * tekshiruvini QAYTA ishga tushirmaydi (vaqt/doktor o'zgarmagan); faqat cancelled/no_show→faol
 * o'tishida qayta tekshiriladi. REAL DB + haqiqiy schedule/appointments/queue servislari.
 * `{ok:false}` natijalar bot (outcome `unavailable`) va navbatda (`appointmentSyncError`) ochiq.
 *
 *   cd apps/api && bun test --env-file=../../.env --timeout 30000 tests/integration/fx-36-active-transition.test.ts
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import {
  appointments,
  branches,
  doctorTimeOff,
  patients,
  queueTickets,
  tenants,
  users,
} from '@dental/db-schema';
import { eq, sql } from 'drizzle-orm';
import type { Context } from 'hono';
import type { DbOrTx } from '../../src/db/client.ts';
import { db } from '../../src/db/client.ts';
import { handleReminderAction } from '../../src/lib/telegram/reminder-actions.ts';
import { createAppointmentsService } from '../../src/modules/appointments/appointments.service.ts';
import { createQueueService } from '../../src/modules/queue/queue.service.ts';
import { createScheduleService } from '../../src/modules/schedule/schedule.service.ts';

let tenantId: string;
let doctorId: string;
let branchId: string;
let patientId: string;
const CHAT = '777036';

const ctx = (tx: DbOrTx, tId: string): Context =>
  ({
    get: (k: string) =>
      k === 'db'
        ? tx
        : k === 'activeTenantId'
          ? tId
          : k === 'user'
            ? { id: doctorId }
            : k === 'accessClaims'
              ? { perms: [] }
              : undefined,
  }) as unknown as Context;

const run = <T>(fn: (c: Context, tx: DbOrTx) => Promise<T>) =>
  db.transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
    return fn(ctx(tx, tenantId), tx);
  });

const noopAudit = { record: async () => {} };
const schedule = createScheduleService({ audit: noopAudit });
const svc = createAppointmentsService({ audit: noopAudit, schedule });
const queue = createQueueService({ audit: noopAudit, appointments: svc });

// Dushanba, kelajakda; shifokorga shu kunga time-off yoziladi (yozilishlardan KEYIN).
const DAY = '2026-12-14';
const at = (h: string) => new Date(`${DAY}T${h}:00+05:00`);

async function seedAppt(startH: string, endH: string, status = 'scheduled') {
  return run(async (_c, tx) => {
    const [a] = await tx
      .insert(appointments)
      .values({
        tenantId,
        branchId,
        patientId,
        doctorId,
        startTime: at(startH),
        endTime: at(endH),
        serviceIds: [],
        status: status as 'scheduled',
      })
      .returning();
    return a!;
  });
}
const statusOf = (id: string) =>
  run(async (_c, tx) => {
    const [a] = await tx.select().from(appointments).where(eq(appointments.id, id));
    return a!.status;
  });

beforeAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
  const [u] = await db
    .insert(users)
    .values({ phone: '+998900000036', passwordHash: 'x', fullName: 'Dr FX36' })
    .returning({ id: users.id });
  doctorId = u!.id;
  const [t] = await db
    .insert(tenants)
    .values({ name: 'T36', slug: 'fx36', ownerUserId: doctorId })
    .returning({ id: tenants.id });
  tenantId = t!.id;
  await run(async (_c, tx) => {
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
      .values({ tenantId, fullName: 'P36', phone: '+998903360001', telegramChatId: CHAT })
      .returning({ id: patients.id });
    patientId = p!.id;
  });
});

afterAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
});

/** Mavjud yozilishlar tegilmay, shifokorga butun kunga time-off kiritiladi. */
async function addTimeOff() {
  await run(async (_c, tx) => {
    await tx.insert(doctorTimeOff).values({
      tenantId,
      doctorId,
      branchId,
      type: 'other',
      startAt: at('00:00'),
      endAt: new Date(at('00:00').getTime() + 24 * 3600 * 1000),
    });
  });
}

describe('FX-36 — faol→faol o`tishda jadval qayta tekshirilmaydi', () => {
  let apptA: string;
  let apptB: string;
  let apptC: string;
  let apptD: string;

  beforeAll(async () => {
    apptA = (await seedAppt('10:00', '10:30')).id; // service: scheduled→confirmed
    apptB = (await seedAppt('11:00', '11:30')).id; // service: scheduled→in_progress
    apptC = (await seedAppt('12:00', '12:30')).id; // bot Kelaman
    apptD = (await seedAppt('13:00', '13:30', 'cancelled')).id; // regressiya: cancelled→scheduled
    await addTimeOff();
  });

  test('scheduled→confirmed (time-off kiritilgandan keyin) → ok', async () => {
    const r = await run((c) => svc.update(c, apptA, { status: 'confirmed' }));
    expect(r.ok).toBe(true);
    expect(await statusOf(apptA)).toBe('confirmed');
  });

  test('scheduled→in_progress va in_progress→completed → ok', async () => {
    const r1 = await run((c) => svc.update(c, apptB, { status: 'in_progress' }));
    expect(r1.ok).toBe(true);
    const r2 = await run((c) => svc.update(c, apptB, { status: 'completed' }));
    expect(r2.ok).toBe(true);
    expect(await statusOf(apptB)).toBe('completed');
  });

  test('regressiya: cancelled→scheduled time-off slotiga HALI rad etiladi', async () => {
    const r = await run((c) => svc.update(c, apptD, { status: 'scheduled' }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('schedule.doctor_on_time_off');
    expect(await statusOf(apptD)).toBe('cancelled');
  });

  test('regressiya: vaqt o`zgartirish time-off kunida HALI rad etiladi', async () => {
    const r = await run((c) =>
      svc.update(c, apptC, {
        startTime: at('14:00').toISOString(),
        endTime: at('14:30').toISOString(),
      }),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('schedule.doctor_on_time_off');
  });

  test('bot «Kelaman» → confirmed (jimgina «already» emas)', async () => {
    const r = await run((_c, tx) =>
      handleReminderAction(
        tx,
        { appointments: svc },
        { tenantId, chatId: CHAT, action: 'ok', appointmentId: apptC },
      ),
    );
    expect(r.outcome).toBe('confirmed');
    expect(await statusOf(apptC)).toBe('confirmed');
  });
});

describe('FX-36 — {ok:false} natijalar ochiq', () => {
  test('bot: tasdiqlash {ok:false} (cancelled slot band) → outcome `unavailable`, `already` EMAS', async () => {
    // Boshqa bemor shu doktor/vaqtda faol yozilish egallagan → confirm emas, lekin
    // 'scheduled' holatidagi yozilishni confirm qilishda konflikt chiqmaydi; shuning uchun
    // update'ni majburan {ok:false} qaytaradigan servis bilan tekshiramiz.
    const appt = await seedAppt('15:00', '15:30');
    const failing = {
      update: async () => ({ ok: false as const, code: 'schedule.doctor_on_time_off' }),
    };
    const r = await run((_c, tx) =>
      handleReminderAction(
        tx,
        { appointments: failing as never },
        { tenantId, chatId: CHAT, action: 'ok', appointmentId: appt.id },
      ),
    );
    expect(r.outcome).toBe('unavailable');
  });

  test('navbat: bog`langan yozilish time-off kunida — waiting→in_progress→done sinxronlanadi', async () => {
    const appt = await seedAppt('16:00', '16:30');
    const ticket = await run(async (_c, tx) => {
      const [tk] = await tx
        .insert(queueTickets)
        .values({
          tenantId,
          branchId,
          patientId,
          doctorId,
          appointmentId: appt.id,
          queueNumber: 1,
        })
        .returning();
      return tk!;
    });
    const r1 = await run((c) =>
      queue.updateStatusDetailed(c, ticket.id, { status: 'in_progress' }),
    );
    expect(r1?.appointmentSyncError).toBeNull();
    expect(await statusOf(appt.id)).toBe('in_progress');
    const r2 = await run((c) => queue.updateStatusDetailed(c, ticket.id, { status: 'done' }));
    expect(r2?.appointmentSyncError).toBeNull();
    expect(await statusOf(appt.id)).toBe('completed');
  });

  test('navbat: in_progress sinxroni {ok:false} bo`lsa syncError oraliq natijadan ham ochiladi', async () => {
    const appt = await seedAppt('17:00', '17:30');
    const ticket = await run(async (_c, tx) => {
      const [tk] = await tx
        .insert(queueTickets)
        .values({
          tenantId,
          branchId,
          patientId,
          doctorId,
          appointmentId: appt.id,
          queueNumber: 2,
        })
        .returning();
      return tk!;
    });
    // Appointments servisi in_progress'ni rad etadi ({ok:false}); done'da ham xato yutilmaydi.
    const rejecting = {
      update: async () => ({ ok: false as const, code: 'conflict.doctor_busy' }),
    };
    const q2 = createQueueService({ audit: noopAudit, appointments: rejecting as never });
    const r = await run((c) => q2.updateStatusDetailed(c, ticket.id, { status: 'done' }));
    expect(r?.appointmentSyncError).toBe('conflict.doctor_busy');
  });
});
