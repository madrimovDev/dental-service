/**
 * CLI-465 — appointment eslatmasi telefon yo'qligida jim fail bo'ladi.
 * `reminder-worker.ts::processReminderJob` bemor telefoni yo'q bo'lganda SMS'ni
 * jim (kuzatilmagan) o'tkazib yuborardi. `recall-worker.ts`dagi
 * `outcome:'no_phone'` pattern'iga mos — `notifications` jadvali (reminder
 * worker uchun mavjud persistence, migration shart emas) alohida `type` bilan
 * kuzatiladigan yozuv qoldirishi kerak.
 *
 * Bitta faylni ALOHIDA ishlating (TRUNCATE race):
 *   cd apps/api && bun test tests/integration/reminder-no-phone.test.ts --env-file=../../.env
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import {
  appointments,
  branches,
  notifications,
  patientEmergencyContacts,
  patients,
  tenants,
  users,
} from '@dental/db-schema';
import { createNoOpChannel } from '@dental/notifications';
import { eq, sql } from 'drizzle-orm';
import { db } from '../../src/db/client.ts';
import { processReminderJob } from '../../src/lib/reminder-worker.ts';
import { createNotificationsService } from '../../src/modules/notifications/notifications.service.ts';

let tenantId: string;
let ownerId: string;
let branchId: string;
let noPhonePatientId: string;

let smsSent: { to: string; text: string }[] = [];
const smsChannel = createNoOpChannel(() => {});
const trackingSms = {
  send: async (to: string, msg: { text: string }) => {
    smsSent.push({ to, text: msg.text });
    return smsChannel.send(to, msg);
  },
};
const notifSvc = createNotificationsService({ sms: trackingSms });

beforeAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
  const [owner] = await db
    .insert(users)
    .values({ phone: '+998900000465', passwordHash: 'x', fullName: 'Doc' })
    .returning({ id: users.id });
  ownerId = owner!.id;
  const [tenant] = await db
    .insert(tenants)
    .values({ name: 'NoPhone', slug: 'no-phone-465', ownerUserId: ownerId, defaultLanguage: 'uz' })
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
      .values({ tenantId, fullName: 'Telefonsiz Bemor', phone: null })
      .returning({ id: patients.id });
    noPhonePatientId = patient!.id;
  });
});

afterAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
});

const day = '2026-12-05';
const seedAppt = async () => {
  return db.transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
    const [a] = await tx
      .insert(appointments)
      .values({
        tenantId,
        branchId,
        doctorId: ownerId,
        patientId: noPhonePatientId,
        startTime: new Date(`${day}T09:00:00+05:00`),
        endTime: new Date(`${day}T10:00:00+05:00`),
        status: 'scheduled',
      })
      .returning({ id: appointments.id });
    return a!.id;
  });
};

describe('CLI-465 reminder no-phone tracking', () => {
  test('bemor telefoni yo‘q → SMS urinilmaydi + kuzatiladigan notification yoziladi', async () => {
    smsSent = [];
    const apptId = await seedAppt();
    await processReminderJob(notifSvc, { tenantId, appointmentId: apptId });

    expect(smsSent.length).toBe(0);

    const rows = await db.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
      return tx
        .select({ type: notifications.type, userId: notifications.userId })
        .from(notifications)
        .where(eq(notifications.userId, ownerId));
    });

    const noPhoneRows = rows.filter((r) => r.type === 'appointment_reminder_no_phone');
    expect(noPhoneRows.length).toBe(1);
  });

  // CLI-474 (L8): rozilik + favqulodda aloqa bo'lsa telefonsiz bemor SMS'i
  // favqulodda raqamga fallback qiladi.
  test('telefon yo‘q + rozilik + favqulodda aloqa → favqulodda raqamga SMS', async () => {
    smsSent = [];
    const apptId = await db.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
      const [p] = await tx
        .insert(patients)
        .values({
          tenantId,
          fullName: 'Rozi Bemor',
          phone: null,
          allowEmergencyRecall: true,
        })
        .returning({ id: patients.id });
      await tx.insert(patientEmergencyContacts).values({
        tenantId,
        patientId: p!.id,
        name: 'Ona',
        phone: '+998907779988',
        isPrimary: true,
      });
      const [a] = await tx
        .insert(appointments)
        .values({
          tenantId,
          branchId,
          doctorId: ownerId,
          patientId: p!.id,
          startTime: new Date(`${day}T11:00:00+05:00`),
          endTime: new Date(`${day}T12:00:00+05:00`),
          status: 'scheduled',
        })
        .returning({ id: appointments.id });
      return a!.id;
    });

    await processReminderJob(notifSvc, { tenantId, appointmentId: apptId });

    expect(smsSent).toHaveLength(1);
    expect(smsSent[0]!.to).toBe('+998907779988');
  });
});
