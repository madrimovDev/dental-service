/**
 * FX-83 — (a) bemor Telegram orqali bekor qilganda xodimga (appointment.cancel egalari +
 * shifokor) bildirishnoma; begona filial/tenant xodimi olmaydi. (b) muvaffaqiyatsiz
 * (failed) eslatma job'i keyingi enqueue'da qayta qo'yiladi (BullMQ dedupe uni yutmasin).
 * REAL DB + RLS + real Redis/BullMQ (Queue + Worker), cheklangan rol (@owner EMAS).
 *
 *   cd apps/api && bun test --env-file=../../.env --timeout 30000 tests/integration/fx-83-bot-cancel-notify-reminder-retry.test.ts
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { randomUUID } from 'node:crypto';
import {
  appointments,
  branches,
  notifications,
  patients,
  permissions,
  rolePermissions,
  roles,
  tenants,
  userAssignments,
  users,
} from '@dental/db-schema';
import { Queue, Worker } from 'bullmq';
import { eq, sql } from 'drizzle-orm';
import type { DbOrTx } from '../../src/db/client.ts';
import { db } from '../../src/db/client.ts';
import { reminderJobId } from '../../src/lib/reminder-job-id.ts';
import { createReminderScheduler } from '../../src/lib/reminder-scheduler.ts';
import { handleReminderAction } from '../../src/lib/telegram/reminder-actions.ts';
import { createAppointmentsService } from '../../src/modules/appointments/appointments.service.ts';
import { createScheduleService } from '../../src/modules/schedule/schedule.service.ts';

let tenantId: string;
let branchA: string;
let branchB: string;
let doctorId: string;
let regA: string; // appointment.cancel, filial A
let regB: string; // appointment.cancel, filial B (begona)
let nurseA: string; // appointment.view faqat (cancel yo'q)
let patientId: string;
const CHAT = '777083';

const run = <T>(fn: (tx: DbOrTx) => Promise<T>) =>
  db.transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
    return fn(tx);
  });

const noopAudit = { record: async () => {} };
const svc = createAppointmentsService({
  audit: noopAudit,
  schedule: createScheduleService({ audit: noopAudit }),
});

const DAY = '2026-12-21';
const at = (h: string) => new Date(`${DAY}T${h}:00+05:00`);

beforeAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
  const mk = async (phone: string) =>
    (
      await db
        .insert(users)
        .values({ phone, passwordHash: 'x', fullName: phone })
        .returning({ id: users.id })
    )[0]!.id;
  const owner = await mk('+998900008301');
  doctorId = await mk('+998900008302');
  regA = await mk('+998900008303');
  regB = await mk('+998900008304');
  nurseA = await mk('+998900008305');

  for (const code of ['appointment.view', 'appointment.cancel']) {
    await db.insert(permissions).values({ code, category: 'appointment' }).onConflictDoNothing();
  }
  const permId = async (code: string) =>
    (
      await db.select({ id: permissions.id }).from(permissions).where(eq(permissions.code, code))
    )[0]!.id;

  tenantId = (
    await db
      .insert(tenants)
      .values({ name: 'FX83', slug: 'fx-83', ownerUserId: owner })
      .returning({ id: tenants.id })
  )[0]!.id;

  await run(async (tx) => {
    const wh = { mon: { open: '09:00', close: '18:00' } };
    const [a, b] = await tx
      .insert(branches)
      .values([
        { tenantId, name: 'A', workHours: wh },
        { tenantId, name: 'B', workHours: wh },
      ])
      .returning({ id: branches.id });
    branchA = a!.id;
    branchB = b!.id;
    const [regRole] = await tx
      .insert(roles)
      .values({ tenantId, name: 'Registrator' })
      .returning({ id: roles.id });
    await tx.insert(rolePermissions).values([
      { roleId: regRole!.id, permissionId: await permId('appointment.view') },
      { roleId: regRole!.id, permissionId: await permId('appointment.cancel') },
    ]);
    const [nurseRole] = await tx
      .insert(roles)
      .values({ tenantId, name: 'Hamshira' })
      .returning({ id: roles.id });
    await tx
      .insert(rolePermissions)
      .values([{ roleId: nurseRole!.id, permissionId: await permId('appointment.view') }]);
    await tx.insert(userAssignments).values([
      { tenantId, userId: regA, roleId: regRole!.id, branchId: branchA },
      { tenantId, userId: regB, roleId: regRole!.id, branchId: branchB },
      { tenantId, userId: nurseA, roleId: nurseRole!.id, branchId: branchA },
    ]);
    const [p] = await tx
      .insert(patients)
      .values({ tenantId, fullName: 'Bemor83', phone: '+998903830001', telegramChatId: CHAT })
      .returning({ id: patients.id });
    patientId = p!.id;
  });
});

afterAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
});

const notifiedUsers = () =>
  run(async (tx) => {
    const rows = await tx
      .select({ userId: notifications.userId })
      .from(notifications)
      .where(eq(notifications.type, 'appointment_cancelled_by_patient'));
    return rows.map((r) => r.userId);
  });

describe('FX-83(a) — bemor Telegram orqali bekor qilganda xodimga bildirishnoma', () => {
  test('filial xodimi (appointment.cancel) + shifokor oladi; begona filial va view-only olmaydi', async () => {
    const a = await run(async (tx) => {
      const [r] = await tx
        .insert(appointments)
        .values({
          tenantId,
          branchId: branchA,
          patientId,
          doctorId,
          startTime: at('10:00'),
          endTime: at('10:30'),
          serviceIds: [],
          status: 'scheduled',
        })
        .returning();
      return r!;
    });
    const r = await run((tx) =>
      handleReminderAction(
        tx,
        { appointments: svc },
        { tenantId, chatId: CHAT, action: 'no', appointmentId: a.id },
      ),
    );
    expect(r.outcome).toBe('cancelled');
    const got = await notifiedUsers();
    expect(got).toContain(regA);
    expect(got).toContain(doctorId);
    expect(got).not.toContain(regB);
    expect(got).not.toContain(nurseA);
  });
});

describe('FX-83(b) — failed eslatma job qayta qo`yiladi (real BullMQ)', () => {
  const name = `reminders-fx83-${randomUUID()}`;
  const connection = { url: process.env.REDIS_URL };
  const queue = new Queue(name, { connection });
  const scheduler = createReminderScheduler(queue);
  let worker: Worker | undefined;

  afterAll(async () => {
    await worker?.close();
    await queue.obliterate({ force: true }).catch(() => {});
    await queue.close();
  });

  test('failed job mavjud bo`lsa enqueueReminder uni almashtirib, delayed holatga qaytaradi', async () => {
    const apptId = randomUUID();
    const jobId = reminderJobId(apptId);
    worker = new Worker(
      name,
      async () => {
        throw new Error('boom');
      },
      { connection },
    );
    await queue.add(
      'appointment-reminder',
      { tenantId, appointmentId: apptId },
      {
        jobId,
        removeOnFail: 100,
      },
    );
    // failed bo'lishini kutamiz
    for (let i = 0; i < 50; i += 1) {
      const j = await queue.getJob(jobId);
      if (j && (await j.getState()) === 'failed') break;
      await new Promise((r) => setTimeout(r, 100));
    }
    await worker.close();
    worker = undefined;
    expect(await (await queue.getJob(jobId))?.getState()).toBe('failed');

    await scheduler.enqueueReminder(tenantId, apptId, 3_600_000);

    expect(await (await queue.getJob(jobId))?.getState()).toBe('delayed');
  });
});
