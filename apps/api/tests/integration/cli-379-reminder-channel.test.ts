/**
 * CLI-379/400 (Finding 2, Task 7 review) — reminder worker per-tenant kanal
 * tanlovi (Telegram > Eskiz SMS > NoOp) real DB integratsiya testi.
 *
 * `cli-379-per-tenant-channel.test.ts` faqat `processRecallScan`ni sinaydi.
 * `reminder-worker.ts::processReminderJob` — o'zining ALOHIDA rewired
 * `resolveTenantChannel` chaqiruviga ega (recall-worker'dan mustaqil kod
 * yo'li) va hech qanday qamrovga ega emas edi. Bu fayl shu bo'shliqni yopadi:
 *   (a) Telegram sozlangan + bemor `telegramChatId` bor → Telegram tanlanadi
 *       (token + chat_id haqiqiy fetch chaqiruvida ko'rinadi).
 *   (b) faqat Eskiz SMS sozlangan, chat_id yo'q → Eskiz tanlanadi (login +
 *       send chaqiruvida telefon ko'rinadi).
 *   (c) hech narsa sozlanmagan → ishlab chiqarish `startReminderWorker`
 *       ishlatadigan HAQIQIY `createNoOpChannel()` (spy EMAS) orqali o'tadi —
 *       tashqi fetch chaqirilmaydi va job CRASH bo'lmaydi.
 *
 * `resolveTenantChannel(...).source` 'none' bo'lmasa `processReminderJob`
 * `notifyInTx`ga `channel: resolved.channel`ni EXPLICIT beradi — demak (a) va
 * (b) uchun ham `svc`ga berilgan `deps.sms` (real NoOp) hech qachon
 * chaqirilmaydi; faqat 'none' holatida (c) `deps.sms` ishlatiladi. Shuning
 * uchun HAMMA 3 holat ham "test-seam spy" o'rniga PRODUCTION `NoOpChannel` +
 * mocklangan global `fetch` bilan haydaladi (Finding 2'ning aynan talabi).
 *
 * Determinism: `MESSAGING_SECRET_PATH` pattern — `cli-379-per-tenant-channel.test.ts`
 * bilan bir xil.
 *
 * Bitta faylni ALOHIDA ishlating (TRUNCATE race):
 *   cd apps/api && bun test tests/integration/cli-379-reminder-channel.test.ts --env-file=<path>
 */
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { existsSync, rmSync } from 'node:fs';
import {
  appointments,
  branches,
  notifications,
  patients,
  tenantSettings,
  tenants,
  users,
} from '@dental/db-schema';
import { createNoOpChannel } from '@dental/notifications';
import { eq, sql } from 'drizzle-orm';
import { db } from '../../src/db/client.ts';
import { withTenant } from '../../src/db/scoped.ts';
import { encryptSecret } from '../../src/lib/crypto.ts';
import { processReminderJob } from '../../src/lib/reminder-worker.ts';
import { createNotificationsService } from '../../src/modules/notifications/notifications.service.ts';

const secretPath = `${import.meta.dir}/.cli-379-reminder-channel-secret-test.txt`;
process.env.MESSAGING_SECRET_PATH = secretPath;

// Global fetch mock — Telegram/Eskiz kanallar haqiqiy fetch() chaqiradi; bu
// yerda tarmoqqa chiqmasdan javob qaytariladi + har chaqiruv kuzatiladi.
type FetchCall = { url: string; body: string };
let fetchCalls: FetchCall[] = [];
const realFetch = globalThis.fetch;

beforeAll(() => {
  globalThis.fetch = (async (url: unknown, init?: RequestInit) => {
    const u = String(url);
    const body = typeof init?.body === 'string' ? init.body : '';
    fetchCalls.push({ url: u, body });
    if (u.includes('api.telegram.org')) {
      return new Response(JSON.stringify({ result: { message_id: 42 } }), { status: 200 });
    }
    if (u.includes('/auth/login')) {
      return new Response(JSON.stringify({ data: { token: 'eskiz-tok' } }), { status: 200 });
    }
    if (u.includes('/message/sms/send')) {
      return new Response(JSON.stringify({ id: 'eskiz-msg-2' }), { status: 200 });
    }
    return new Response('not found', { status: 404 });
  }) as unknown as typeof fetch;
});

afterAll(() => {
  globalThis.fetch = realFetch;
});

// PRODUCTION notifications service — `startReminderWorker` bilan bir xil
// (`createNoOpChannel()`, spy EMAS). Telegram/Eskiz holatlarida bu hech
// qachon chaqirilmaydi (`resolved.channel` explicit beriladi); faqat
// unconfigured holatida haqiqatan ishlatiladi.
const svc = createNotificationsService({ sms: createNoOpChannel(() => {}) });

let ownerId: string;
let tTelegram: string;
let tSms: string;
let tNone: string;
let branchTelegram: string;
let branchSms: string;
let branchNone: string;

const seedTenant = async (slug: string, name: string) => {
  const [t] = await db
    .insert(tenants)
    .values({ name, slug, ownerUserId: ownerId, defaultLanguage: 'uz' })
    .returning({ id: tenants.id });
  return t!.id;
};

const day = '2026-12-10';

/**
 * Bemor + navbat yozuvi (yozilish) — reminder job'i shu yozilishga bog'liq.
 * `appointments_no_doctor_overlap` (CLI-408) — GiST EXCLUDE `doctor_id` bo'yicha,
 * TENANT-SCOPE EMAS (users platform darajasida, RFC-0001 §3.1) — bir xil
 * `ownerId` uchun uchala tenant'ning navbatlari bir-biriga ustma-ust tushmasligi
 * shart, shuning uchun `hourOffset` bilan har chaqiruv alohida vaqt oynasi oladi.
 */
const seedAppointment = async (
  tenantId: string,
  branchId: string,
  opts: { phone: string | null; telegramChatId?: string | null; hourOffset: number },
) =>
  withTenant(tenantId, async (tx) => {
    const [p] = await tx
      .insert(patients)
      .values({
        tenantId,
        fullName: 'Bemor',
        phone: opts.phone,
        telegramChatId: opts.telegramChatId ?? null,
      })
      .returning({ id: patients.id });
    const startHour = 9 + opts.hourOffset;
    const [a] = await tx
      .insert(appointments)
      .values({
        tenantId,
        branchId,
        doctorId: ownerId,
        patientId: p!.id,
        startTime: new Date(`${day}T${String(startHour).padStart(2, '0')}:00:00+05:00`),
        endTime: new Date(`${day}T${String(startHour + 1).padStart(2, '0')}:00:00+05:00`),
        status: 'scheduled',
      })
      .returning({ id: appointments.id });
    return a!.id;
  });

beforeAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
  const [owner] = await db
    .insert(users)
    .values({ phone: '+998900000400', passwordHash: 'x', fullName: 'Owner400' })
    .returning({ id: users.id });
  ownerId = owner!.id;

  tTelegram = await seedTenant('cli400-tg', 'Reminder Telegram Clinic');
  tSms = await seedTenant('cli400-sms', 'Reminder SMS Clinic');
  tNone = await seedTenant('cli400-none', 'Reminder Unconfigured Clinic');

  branchTelegram = await withTenant(tTelegram, async (tx) => {
    const [b] = await tx.insert(branches).values({ tenantId: tTelegram, name: 'B' }).returning({
      id: branches.id,
    });
    return b!.id;
  });
  branchSms = await withTenant(tSms, async (tx) => {
    const [b] = await tx.insert(branches).values({ tenantId: tSms, name: 'B' }).returning({
      id: branches.id,
    });
    return b!.id;
  });
  branchNone = await withTenant(tNone, async (tx) => {
    const [b] = await tx.insert(branches).values({ tenantId: tNone, name: 'B' }).returning({
      id: branches.id,
    });
    return b!.id;
  });

  // tTelegram — Telegram bot token sozlangan (encrypt-on-write, CLI-379/400).
  await withTenant(tTelegram, (tx) =>
    tx.insert(tenantSettings).values({
      tenantId: tTelegram,
      integrationSettings: { telegram: { botTokenEnc: encryptSecret('reminder-tg-token') } },
    }),
  );
  // tSms — faqat Eskiz SMS sozlangan (telegram yo'q).
  await withTenant(tSms, (tx) =>
    tx.insert(tenantSettings).values({
      tenantId: tSms,
      integrationSettings: {
        sms: {
          eskizEmailEnc: encryptSecret('reminder-clinic@eskiz.uz'),
          eskizPasswordEnc: encryptSecret('R3mind3r!'),
        },
      },
    }),
  );
  // tNone — tenant_settings row umuman yo'q (integrationSettings null).
});

afterAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
  if (existsSync(secretPath)) rmSync(secretPath);
});

beforeEach(() => {
  fetchCalls = [];
});

describe('CLI-379/400 per-tenant channel resolution (reminder worker)', () => {
  test('Telegram sozlangan + bemor chat_id bor → Telegram tanlanadi (Eskiz chaqirilmaydi)', async () => {
    const apptId = await seedAppointment(tTelegram, branchTelegram, {
      phone: '+998901110011',
      telegramChatId: '888111',
      hourOffset: 0,
    });

    await processReminderJob(svc, { tenantId: tTelegram, appointmentId: apptId });

    const tgCalls = fetchCalls.filter((c) => c.url.includes('api.telegram.org'));
    expect(tgCalls).toHaveLength(1);
    expect(tgCalls[0]!.url).toContain('reminder-tg-token');
    expect(tgCalls[0]!.body).toContain('"chat_id":"888111"');
    // Selection sinovi — boshqa kanalga chiqilmagan.
    expect(fetchCalls.some((c) => c.url.includes('notify.eskiz.uz'))).toBe(false);

    const rows = await withTenant(tTelegram, (tx) =>
      tx
        .select({ type: notifications.type })
        .from(notifications)
        .where(eq(notifications.userId, ownerId)),
    );
    expect(rows.some((r) => r.type === 'appointment_reminder')).toBe(true);
  });

  test('faqat SMS(Eskiz) sozlangan, chat_id yo‘q → Eskiz tanlanadi (Telegram chaqirilmaydi)', async () => {
    const apptId = await seedAppointment(tSms, branchSms, {
      phone: '+998902220022',
      hourOffset: 1,
    });

    await processReminderJob(svc, { tenantId: tSms, appointmentId: apptId });

    expect(fetchCalls.some((c) => c.url.includes('api.telegram.org'))).toBe(false);
    const eskizCalls = fetchCalls.filter((c) => c.url.includes('notify.eskiz.uz'));
    expect(eskizCalls.some((c) => c.url.includes('/auth/login'))).toBe(true);
    const sendCall = eskizCalls.find((c) => c.url.includes('/message/sms/send'));
    expect(sendCall).toBeDefined();
    expect(sendCall!.body).toContain('998902220022');

    const rows = await withTenant(tSms, (tx) =>
      tx
        .select({ type: notifications.type })
        .from(notifications)
        .where(eq(notifications.userId, ownerId)),
    );
    expect(rows.some((r) => r.type === 'appointment_reminder')).toBe(true);
  });

  test('hech narsa sozlanmagan → HAQIQIY NoOpChannel (svc.deps.sms) — tashqi fetch chaqirilmaydi, job crash bo‘lmaydi', async () => {
    const apptId = await seedAppointment(tNone, branchNone, {
      phone: '+998903330033',
      hourOffset: 2,
    });

    // `processReminderJob` throw qilmasligining o'zi — real NoOp yo'li ishlashini
    // isbotlaydi (production `startReminderWorker` aynan shu `svc`ni ishlatadi,
    // faqat NoOp kanal bilan — hech qanday spy/test-seam yo'q).
    await processReminderJob(svc, { tenantId: tNone, appointmentId: apptId });

    expect(fetchCalls).toHaveLength(0);

    const rows = await withTenant(tNone, (tx) =>
      tx
        .select({ type: notifications.type })
        .from(notifications)
        .where(eq(notifications.userId, ownerId)),
    );
    // Telefon bor edi → smsTo berilgan → NoOp "ok:true" qaytaradi →
    // 'appointment_reminder' (no_phone EMAS) yozuv yoziladi.
    expect(rows.some((r) => r.type === 'appointment_reminder')).toBe(true);
  });
});
