/**
 * CLI-186 (eslatma hayot-sikli + status guard) va CLI-187 (konflikt yarim-ochiq
 * interval) integratsiya testlari — real DB. Redis'siz: worker `processReminderJob`
 * va service spy-deps (`enqueueReminder`/`removeReminder`) orqali sinaladi.
 *
 * Bitta faylni alohida ishlating (TRUNCATE race — to'liq parallel suite emas):
 *   cd apps/api && bun test tests/integration/cli-186-187-appointments.test.ts --env-file=../../.env
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { appointments, branches, patients, tenants, users } from '@dental/db-schema';
import { createNoOpChannel } from '@dental/notifications';
import { sql } from 'drizzle-orm';
import type { Context } from 'hono';
import type { DbOrTx } from '../../src/db/client.ts';
import { db } from '../../src/db/client.ts';
import { processReminderJob } from '../../src/lib/reminder-worker.ts';
import { createAppointmentsService } from '../../src/modules/appointments/appointments.service.ts';
import { createNotificationsService } from '../../src/modules/notifications/notifications.service.ts';

let tenantId: string;
let ownerId: string;
let branchId: string;
let patientId: string;

// SMS yuborilganini kuzatuvchi NoOp kanal.
let smsSent: { to: string; text: string }[] = [];
const smsChannel = createNoOpChannel(() => {});
// notifyInTx → deps.sms.send chaqiradi; o'rab kuzatamiz.
const trackingSms = {
  send: async (to: string, msg: { text: string }) => {
    smsSent.push({ to, text: msg.text });
    return smsChannel.send(to, msg);
  },
};

const notifSvc = createNotificationsService({ sms: trackingSms });

const ctx = (tx: DbOrTx, tId: string): Context =>
  ({
    get: (k: string) =>
      k === 'db'
        ? tx
        : k === 'activeTenantId'
          ? tId
          : k === 'user'
            ? { id: ownerId }
            : k === 'accessClaims'
              ? { perms: ['@owner'] }
              : undefined,
  }) as unknown as Context;

const run = <T>(tId: string, fn: (c: Context) => Promise<T>) =>
  db.transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tId}'`));
    return fn(ctx(tx, tId));
  });

const noopAudit = { record: async () => {} };

beforeAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
  const [owner] = await db
    .insert(users)
    .values({ phone: '+998900000080', passwordHash: 'x', fullName: 'Doc' })
    .returning({ id: users.id });
  ownerId = owner!.id;
  const [tenant] = await db
    .insert(tenants)
    .values({ name: 'A', slug: 'a-appt', ownerUserId: ownerId, defaultLanguage: 'uz' })
    .returning({ id: tenants.id });
  tenantId = tenant!.id;

  await db.transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
    const [branch] = await tx
      .insert(branches)
      .values({ tenantId, name: 'B' })
      .returning({ id: branches.id });
    branchId = branch!.id;
    const [patient] = await tx
      .insert(patients)
      .values({ tenantId, fullName: 'Ali Valiyev', phone: '+998901112233' })
      .returning({ id: patients.id });
    patientId = patient!.id;
  });
});

afterAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
});

const day = '2026-12-01';
const seedAppt = async (
  startH: string,
  endH: string,
  status: 'scheduled' | 'cancelled' | 'no_show' = 'scheduled',
) => {
  return db.transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
    const [a] = await tx
      .insert(appointments)
      .values({
        tenantId,
        branchId,
        doctorId: ownerId,
        patientId,
        startTime: new Date(`${day}T${startH}:00+05:00`),
        endTime: new Date(`${day}T${endH}:00+05:00`),
        status,
      })
      .returning({ id: appointments.id });
    return a!.id;
  });
};

// ─── CLI-187: konflikt yarim-ochiq [start, end) ────────────────────────────────

describe('CLI-187 checkConflict yarim-ochiq interval', () => {
  const svc = createAppointmentsService({ audit: noopAudit });

  beforeAll(async () => {
    // Mavjud: 10:00–11:00 scheduled.
    await seedAppt('10:00', '11:00', 'scheduled');
  });

  test('back-to-back (yangi 11:00–12:00, oldingi 11:00 tugaydi) → KONFLIKT EMAS', async () => {
    const r = await run(tenantId, (c) =>
      svc.create(c, {
        branchId,
        patientId,
        doctorId: ownerId,
        startTime: `${day}T11:00:00+05:00`,
        endTime: `${day}T12:00:00+05:00`,
        serviceIds: [],
      }),
    );
    expect(r.ok).toBe(true);
  });

  test('haqiqiy overlap (yangi 10:30–11:30, mavjud 10:00–11:00 ichida) → KONFLIKT', async () => {
    const r = await run(tenantId, (c) =>
      svc.create(c, {
        branchId,
        patientId,
        doctorId: ownerId,
        startTime: `${day}T10:30:00+05:00`,
        endTime: `${day}T11:30:00+05:00`,
        serviceIds: [],
      }),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('conflict.doctor_busy');
  });

  test('chegara: yangi end == mavjud start (yangi 09:00–10:00, mavjud 10:00 boshlanadi) → KONFLIKT EMAS', async () => {
    const r = await run(tenantId, (c) =>
      svc.create(c, {
        branchId,
        patientId,
        doctorId: ownerId,
        startTime: `${day}T09:00:00+05:00`,
        endTime: `${day}T10:00:00+05:00`,
        serviceIds: [],
      }),
    );
    expect(r.ok).toBe(true);
  });
});

// ─── CLI-186: worker status guard ──────────────────────────────────────────────

describe('CLI-186 worker status guard', () => {
  test('scheduled → SMS yuboriladi, Tashkent local vaqt', async () => {
    smsSent = [];
    const apptId = await seedAppt('14:00', '15:00', 'scheduled');
    await processReminderJob(notifSvc, { tenantId, appointmentId: apptId });
    expect(smsSent.length).toBe(1);
    // Tashkent local 14:00 (start 14:00+05:00) — UTC ISO emas.
    expect(smsSent[0]!.text).toContain('14:00');
    expect(smsSent[0]!.text).toContain('Bemor: Ali Valiyev');
    expect(smsSent[0]!.text).not.toContain('Z');
  });

  test('cancelled → SMS YUBORILMAYDI', async () => {
    smsSent = [];
    const apptId = await seedAppt('16:00', '17:00', 'cancelled');
    await processReminderJob(notifSvc, { tenantId, appointmentId: apptId });
    expect(smsSent.length).toBe(0);
  });

  test('no_show → SMS YUBORILMAYDI', async () => {
    smsSent = [];
    const apptId = await seedAppt('17:00', '18:00', 'no_show');
    await processReminderJob(notifSvc, { tenantId, appointmentId: apptId });
    expect(smsSent.length).toBe(0);
  });

  test('ru tenant → SMS rus tilida (tenants RLS-read + lang sourcing end-to-end)', async () => {
    // Alohida tenant defaultLanguage='ru' — worker tenants'ni withTenant ichida
    // o'qiy olishini va ru render'ga yetishini tasdiqlaydi (uz fallback emas).
    smsSent = [];
    const [ru] = await db
      .insert(tenants)
      .values({ name: 'RU', slug: 'ru-appt', ownerUserId: ownerId, defaultLanguage: 'ru' })
      .returning({ id: tenants.id });
    const ruTenant = ru!.id;

    const apptId = await db.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${ruTenant}'`));
      const [branch] = await tx
        .insert(branches)
        .values({ tenantId: ruTenant, name: 'RB' })
        .returning({ id: branches.id });
      const [pt] = await tx
        .insert(patients)
        .values({ tenantId: ruTenant, fullName: 'Ivan Petrov', phone: '+998905556677' })
        .returning({ id: patients.id });
      const [a] = await tx
        .insert(appointments)
        .values({
          tenantId: ruTenant,
          branchId: branch!.id,
          doctorId: ownerId,
          patientId: pt!.id,
          startTime: new Date(`${day}T14:00:00+05:00`),
          endTime: new Date(`${day}T15:00:00+05:00`),
          status: 'scheduled',
        })
        .returning({ id: appointments.id });
      return a!.id;
    });

    await processReminderJob(notifSvc, { tenantId: ruTenant, appointmentId: apptId });
    expect(smsSent.length).toBe(1);
    expect(smsSent[0]!.text).toContain('Пациент: Ivan Petrov');
    expect(smsSent[0]!.text).toContain('Напоминание о приёме');
  });
});

// ─── CLI-186: reschedule eslatma hayot-sikli (jobId remove + re-enqueue) ────────

describe('CLI-186 reschedule eslatma hayot-sikli', () => {
  test('startTime o‘zgarsa → eski job o‘chiriladi, yangi delay bilan re-enqueue', async () => {
    const removed: string[] = [];
    const enqueued: { id: string; delay: number }[] = [];
    const svc = createAppointmentsService({
      audit: noopAudit,
      enqueueReminder: async (_t, id, delay) => {
        enqueued.push({ id, delay });
      },
      removeReminder: async (id) => {
        removed.push(id);
      },
    });

    // Kelajakdagi yozilish (lead 24h ichida emas) — re-enqueue delay > 0.
    // Har reschedule test alohida offset oynasi (cross-test slot to'qnashuvi yo'q).
    const future = new Date(Date.now() + 100 * 3600_000);
    const start = future.toISOString();
    const end = new Date(future.getTime() + 3600_000).toISOString();
    const created = await run(tenantId, (c) =>
      svc.create(c, {
        branchId,
        patientId,
        doctorId: ownerId,
        startTime: start,
        endTime: end,
        serviceIds: [],
      }),
    );
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const apptId = created.appointment.id;

    // Reschedule: +1 soatga suramiz.
    const newStart = new Date(future.getTime() + 3600_000).toISOString();
    const newEnd = new Date(future.getTime() + 2 * 3600_000).toISOString();
    const upd = await run(tenantId, (c) =>
      svc.update(c, apptId, { startTime: newStart, endTime: newEnd }),
    );
    expect(upd.ok).toBe(true);

    // Eski job o'chirildi va yangi delay bilan qayta qo'shildi.
    expect(removed).toContain(apptId);
    expect(enqueued.some((e) => e.id === apptId && e.delay > 0)).toBe(true);
  });

  test('o‘tgan vaqtga reschedule → faqat remove, re-enqueue YO‘Q (delay null)', async () => {
    const removed: string[] = [];
    const enqueued: string[] = [];
    const svc = createAppointmentsService({
      audit: noopAudit,
      enqueueReminder: async (_t, id) => {
        enqueued.push(id);
      },
      removeReminder: async (id) => {
        removed.push(id);
      },
    });

    const future = new Date(Date.now() + 200 * 3600_000);
    const created = await run(tenantId, (c) =>
      svc.create(c, {
        branchId,
        patientId,
        doctorId: ownerId,
        startTime: future.toISOString(),
        endTime: new Date(future.getTime() + 3600_000).toISOString(),
        serviceIds: [],
      }),
    );
    if (!created.ok) throw new Error(`create failed: ${created.code}`);
    const apptId = created.appointment.id;
    // create ham enqueue qiladi — hisobni tozalaymiz.
    enqueued.length = 0;

    // 1 soatdan keyinga reschedule (lead 24h ichida) → delay null.
    const near = new Date(Date.now() + 3600_000);
    const upd = await run(tenantId, (c) =>
      svc.update(c, apptId, {
        startTime: near.toISOString(),
        endTime: new Date(near.getTime() + 3600_000).toISOString(),
      }),
    );
    expect(upd.ok).toBe(true);
    expect(removed).toContain(apptId);
    expect(enqueued).not.toContain(apptId);
  });

  test('doctor-only o‘zgarish (startTime YO‘Q) → eslatma hayot-sikli ishga tushmaydi', async () => {
    const removed: string[] = [];
    const svc = createAppointmentsService({
      audit: noopAudit,
      enqueueReminder: async () => {},
      removeReminder: async (id) => {
        removed.push(id);
      },
    });
    const future = new Date(Date.now() + 300 * 3600_000);
    const created = await run(tenantId, (c) =>
      svc.create(c, {
        branchId,
        patientId,
        doctorId: ownerId,
        startTime: future.toISOString(),
        endTime: new Date(future.getTime() + 3600_000).toISOString(),
        serviceIds: [],
      }),
    );
    if (!created.ok) return;
    const apptId = created.appointment.id;
    await run(tenantId, (c) => svc.update(c, apptId, { notes: 'shunchaki izoh' }));
    expect(removed).not.toContain(apptId);
  });
});
