/**
 * FX-105 (LB-14): obunasi (SaaS) muddat + imtiyozdan o'tib `expired` bo'lgan tenant
 * uchun HTTP'dan tashqari kirish nuqtalari ham to'xtaydi — 24 soatlik eslatma job'i,
 * kunlik recall skani va Telegram bot oqimlari. Faol tenant xulqi o'zgarmaydi.
 *
 * Real DB: `tenant_settings.subscription_expires_at` (RLS bilan o'qiladi), haqiqiy
 * `processReminderJob` / `processRecallScan` (admin conn) va bot gate'i.
 *
 * Bitta faylni ALOHIDA ishlating (TRUNCATE race):
 *   cd apps/api && bun test tests/integration/fx-105-expired-tenant-no-messaging.test.ts --env-file=../../.env
 */
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import {
  appointments,
  branches,
  notifications,
  patients,
  recallLogs,
  recalls,
  tenantSettings,
  tenants,
  users,
} from '@dental/db-schema';
import { createNoOpChannel } from '@dental/notifications';
import { eq, sql } from 'drizzle-orm';
import { createAdminDb, db } from '../../src/db/client.ts';
import { withTenant } from '../../src/db/scoped.ts';
import { processRecallScan } from '../../src/lib/recall-worker.ts';
import { processReminderJob } from '../../src/lib/reminder-worker.ts';
import { invalidateSubscriptionCache } from '../../src/lib/subscription.ts';
import { createBotSubscriptionGate } from '../../src/lib/telegram/subscription-gate.ts';
import { createNotificationsService } from '../../src/modules/notifications/notifications.service.ts';

const DAY = 86_400_000;
const admin = createAdminDb();

let smsSent: { to: string; text: string }[] = [];
const noop = createNoOpChannel(() => {});
const trackingSms = {
  send: async (to: string, msg: { text: string }) => {
    smsSent.push({ to, text: msg.text });
    return noop.send(to, msg);
  },
};
const recallSms = {
  send: async (to: string, msg: { text: string }) => {
    smsSent.push({ to, text: msg.text });
    return { ok: true as const, providerId: 'mock-105' };
  },
};
const notifSvc = createNotificationsService({ sms: trackingSms });

let ownerId: string;
let tExpired: string;
let tActive: string;
let tUnknown: string;
const savedDesktop = process.env.DENTAL_LOCAL_DESKTOP;

const seedTenant = async (slug: string, expiresAt: Date | null) => {
  const [t] = await db
    .insert(tenants)
    .values({ name: slug, slug, ownerUserId: ownerId, defaultLanguage: 'uz' })
    .returning({ id: tenants.id });
  const tenantId = t!.id;
  await withTenant(tenantId, async (tx) => {
    await tx.insert(tenantSettings).values({ tenantId, subscriptionExpiresAt: expiresAt });
    await tx.insert(branches).values({ tenantId, name: 'B' });
  });
  return tenantId;
};

const seedPatient = (tenantId: string, phone: string) =>
  withTenant(tenantId, async (tx) => {
    const [p] = await tx
      .insert(patients)
      .values({ tenantId, fullName: 'Bemor', phone })
      .returning({ id: patients.id });
    return p!.id;
  });

const seedAppt = (tenantId: string, phone: string) =>
  withTenant(tenantId, async (tx) => {
    const [b] = await tx.select({ id: branches.id }).from(branches).limit(1);
    const [p] = await tx
      .insert(patients)
      .values({ tenantId, fullName: 'Bemor', phone })
      .returning({ id: patients.id });
    const day = '2026-12-05';
    const [a] = await tx
      .insert(appointments)
      .values({
        tenantId,
        branchId: b!.id,
        doctorId: ownerId,
        patientId: p!.id,
        startTime: new Date(`${day}T09:00:00+05:00`),
        endTime: new Date(`${day}T10:00:00+05:00`),
        status: 'scheduled',
      })
      .returning({ id: appointments.id });
    return a!.id;
  });

const seedRecall = async (tenantId: string, phone: string) => {
  const patientId = await seedPatient(tenantId, phone);
  return withTenant(tenantId, async (tx) => {
    const [r] = await tx
      .insert(recalls)
      .values({
        tenantId,
        patientId,
        reason: 'preventive',
        status: 'pending',
        source: 'scheduler',
        dueDate: '2020-01-01',
      })
      .returning({ id: recalls.id });
    return r!.id;
  });
};

const reminderNotifs = (tenantId: string) =>
  withTenant(tenantId, (tx) =>
    tx
      .select({ type: notifications.type })
      .from(notifications)
      .where(eq(notifications.userId, ownerId)),
  );

beforeAll(async () => {
  delete process.env.DENTAL_LOCAL_DESKTOP; // SaaS rejimi
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
  const [owner] = await db
    .insert(users)
    .values({ phone: '+998900000105', passwordHash: 'x', fullName: 'Doc' })
    .returning({ id: users.id });
  ownerId = owner!.id;
  // Muddat + 7 kun imtiyoz o'tgan → expired.
  tExpired = await seedTenant('fx105-expired', new Date(Date.now() - 30 * DAY));
  tActive = await seedTenant('fx105-active', new Date(Date.now() + 30 * DAY));
  // Muddat noma'lum (Supervisor ro'yxatga olmagan) → `none`: hech qachon bloklanmaydi.
  tUnknown = await seedTenant('fx105-unknown', null);
});

afterAll(async () => {
  if (savedDesktop === undefined) delete process.env.DENTAL_LOCAL_DESKTOP;
  else process.env.DENTAL_LOCAL_DESKTOP = savedDesktop;
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
  await admin.client.end({ timeout: 5 });
});

beforeEach(() => {
  smsSent = [];
  invalidateSubscriptionCache();
});

describe('FX-105 eslatma job (processReminderJob)', () => {
  test('expired tenant: SMS yuborilmaydi, eslatma yozilmaydi', async () => {
    const apptId = await seedAppt(tExpired, '+998901050001');
    await processReminderJob(notifSvc, { tenantId: tExpired, appointmentId: apptId });
    expect(smsSent).toEqual([]);
    expect(await reminderNotifs(tExpired)).toEqual([]);
  });

  test('faol va muddati noma`lum tenant: eslatma odatdagidek yuboriladi', async () => {
    const a1 = await seedAppt(tActive, '+998901050002');
    const a2 = await seedAppt(tUnknown, '+998901050003');
    await processReminderJob(notifSvc, { tenantId: tActive, appointmentId: a1 });
    await processReminderJob(notifSvc, { tenantId: tUnknown, appointmentId: a2 });
    expect(smsSent.map((s) => s.to).sort()).toEqual(['+998901050002', '+998901050003']);
  });
});

describe('FX-105 recall skani (processRecallScan)', () => {
  // 07:00 UTC = 12:00 Toshkent — recallSendHourLocal (10) gate'idan o'tadi.
  const now = new Date('2026-06-21T07:00:00Z');

  test('expired tenant recall o`tkazib yuboriladi va pending qoladi; faol tenant yuboriladi', async () => {
    const rExpired = await seedRecall(tExpired, '+998901050011');
    const rActive = await seedRecall(tActive, '+998901050012');

    const res = await processRecallScan({ adminDb: admin.db, sms: recallSms, withTenant, now });

    expect(smsSent.map((s) => s.to)).toEqual(['+998901050012']);
    expect(res.sent).toBe(1);
    const [live] = await admin.db
      .select({ status: recalls.status, attempts: recalls.contactAttempts })
      .from(recalls)
      .where(eq(recalls.id, rExpired));
    expect(live).toEqual({ status: 'pending', attempts: 0 });
    // Blok tenant uchun hech qanday recall log (urinish) yozilmaydi.
    const logs = await admin.db
      .select({ id: recallLogs.id })
      .from(recallLogs)
      .where(eq(recallLogs.recallId, rExpired));
    expect(logs).toEqual([]);
    const [act] = await admin.db
      .select({ status: recalls.status })
      .from(recalls)
      .where(eq(recalls.id, rActive));
    expect(act?.status).toBe('contacted');
  });
});

describe('FX-105 Telegram bot gate', () => {
  const runGate = async (tenantId: string, ctx: { callbackQuery?: object }) => {
    let nextCalled = false;
    const answered: unknown[] = [];
    const fullCtx = {
      ...ctx,
      answerCbQuery: async (...args: unknown[]) => {
        answered.push(args);
        return true;
      },
    };
    await createBotSubscriptionGate(tenantId)(fullCtx, async () => {
      nextCalled = true;
    });
    return { nextCalled, answered };
  };

  test('expired tenant: oqimlar ishlamaydi (next chaqirilmaydi), matnsiz javob', async () => {
    expect((await runGate(tExpired, {})).nextCalled).toBe(false);
    const cb = await runGate(tExpired, { callbackQuery: { id: 'q1', data: 'rm:ok:x' } });
    expect(cb.nextCalled).toBe(false);
    // Tugma «aylanib» qolmasin — callback toast'siz yopiladi, hech narsa o'zgarmaydi.
    expect(cb.answered).toEqual([[]]);
  });

  test('faol va muddati noma`lum tenant: oqim davom etadi', async () => {
    expect((await runGate(tActive, {})).nextCalled).toBe(true);
    expect((await runGate(tUnknown, { callbackQuery: { id: 'q2' } })).nextCalled).toBe(true);
  });

  test('renew (muddat uzaytirildi) — kesh yangilangach bot yana javob beradi', async () => {
    expect((await runGate(tExpired, {})).nextCalled).toBe(false);
    await withTenant(tExpired, (tx) =>
      tx.update(tenantSettings).set({ subscriptionExpiresAt: new Date(Date.now() + 30 * DAY) }),
    );
    invalidateSubscriptionCache(tExpired);
    expect((await runGate(tExpired, {})).nextCalled).toBe(true);
    await withTenant(tExpired, (tx) =>
      tx.update(tenantSettings).set({ subscriptionExpiresAt: new Date(Date.now() - 30 * DAY) }),
    );
  });
});
