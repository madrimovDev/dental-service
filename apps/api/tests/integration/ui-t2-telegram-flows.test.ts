/**
 * UI-T2 — Telegram bot oqimlari (REAL DB + RLS + haqiqiy HTTP app, cheklangan rollar).
 *
 *   cd apps/api && bun test tests/integration/ui-t2-telegram-flows.test.ts --env-file=../../.env
 *
 * Qamrov (Review Focus A.1):
 *  1. Begona chat callback'i (boshqa bemorning yozilishi tugmasi) hech narsani o'zgartirmaydi.
 *  2. Bron so'rovini tasdiqlashda slot band bo'lsa 409, so'rov `pending` qoladi.
 *  3. Anketa javoblari FAQAT qoralama — allergiyalarga avtomatik yozilmaydi.
 *  4. Registrator faqat o'z tenantini ko'radi; Accountant 403 (real rol shablonlari, @owner EMAS).
 * + bron oqimi (filial→shifokor→kun→slot→pending), expired, decline, bemor tili,
 *   eslatma tugmalari (Telegram kanalida inline_keyboard), chek/retsept xabari.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { existsSync, rmSync } from 'node:fs';
import { ROLE_TEMPLATES } from '@dental/core';
import {
  appointments,
  bookingRequests,
  branches,
  medicalRecords,
  patients,
  permissions,
  rolePermissions,
  roles,
  tenantSettings,
  tenants,
  userAssignments,
  users,
} from '@dental/db-schema';
import type { NotificationChannel } from '@dental/notifications';
import { createNoOpChannel } from '@dental/notifications';
import { and, eq, sql } from 'drizzle-orm';
import { seedPermissions } from '../../src/db/boot-seed.ts';
import { createAdminDb, db } from '../../src/db/client.ts';
import { withTenant } from '../../src/db/scoped.ts';
import { createAuditLogger } from '../../src/lib/audit-logger.ts';
import { encryptSecret } from '../../src/lib/crypto.ts';
import { signAccess } from '../../src/lib/jwt.ts';
import { processReminderJob } from '../../src/lib/reminder-worker.ts';
import { createTelegramFlows } from '../../src/lib/telegram/flows.ts';
import { createPatientMessenger } from '../../src/lib/telegram/notify.ts';
import { reminderCallbackData } from '../../src/lib/telegram/reminder-actions.ts';
import { createAppointmentsService } from '../../src/modules/appointments/index.ts';
import { expireStaleBookingRequests } from '../../src/modules/booking-requests/index.ts';
import { createNotificationsService } from '../../src/modules/notifications/notifications.service.ts';
import { createScheduleService } from '../../src/modules/schedule/index.ts';

const secretPath = `${import.meta.dir}/.ui-t2-telegram-secret-test.txt`;
process.env.MESSAGING_SECRET_PATH = secretPath;

const { createApp } = await import('../../src/app.ts');

// ─── fetch mock (Telegram) ───────────────────────────────────────────────────
type FetchCall = { url: string; body: string };
let fetchCalls: FetchCall[] = [];
const realFetch = globalThis.fetch;

// ─── servislar (production bilan bir xil kompozitsiya, queue'siz) ───────────
const audit = createAuditLogger({ db });
const schedule = createScheduleService({ audit });
const apptService = createAppointmentsService({ audit, schedule });
const flows = createTelegramFlows({ appointments: apptService, schedule });

const CHAT_A = '5001'; // A tenant, bemor 1
const CHAT_B = '5002'; // A tenant, bemor 2 (begona chat)

let ownerId: string;
let doctorId: string;
let receptionistId: string;
let accountantId: string;
let tA: string;
let tB: string;
let branchA: string;
let branchB: string;
let patient1: string;
let patient2: string;
let patientB: string; // B tenant
let receptionistToken: string;
let accountantToken: string;

const run = <T>(fn: Parameters<typeof withTenant<T>>[1]) => withTenant(tA, fn);

const roleToken = async (userId: string, tenantId: string, templateKey: string) => {
  const tpl = ROLE_TEMPLATES.find((t) => t.templateKey === templateKey);
  if (!tpl) throw new Error(`template ${templateKey} yo'q`);
  const { token } = await signAccess({
    sub: userId,
    atid: tenantId,
    abid: null,
    perms: [...tpl.permissions] as string[],
    roleKey: templateKey,
    lang: 'uz',
  });
  return token;
};

const call = (token: string, method: string, path: string, body?: unknown) =>
  createApp().request(path, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

/** Ertangi kun (Tashkent) + soat → UTC Date. */
const tomorrowAt = (hour: number, plusDays = 1): Date => {
  const ymd = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tashkent',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + plusDays);
  return new Date(`${d.toISOString().slice(0, 10)}T${String(hour).padStart(2, '0')}:00:00+05:00`);
};

const seedRequest = (o: {
  tenantId?: string;
  branchId?: string;
  patientId?: string;
  doctorId?: string | null;
  start: Date;
  createdAt?: Date;
  rescheduleOf?: string | null;
}) =>
  withTenant(o.tenantId ?? tA, async (tx) => {
    const [r] = await tx
      .insert(bookingRequests)
      .values({
        tenantId: o.tenantId ?? tA,
        branchId: o.branchId ?? branchA,
        patientId: o.patientId ?? patient1,
        doctorId: o.doctorId === undefined ? doctorId : o.doctorId,
        requestedStart: o.start,
        createdAt: o.createdAt,
        rescheduleOfAppointmentId: o.rescheduleOf ?? null,
      })
      .returning({ id: bookingRequests.id });
    return r!.id;
  });

const reqRow = (id: string, tenantId = tA) =>
  withTenant(tenantId, async (tx) => {
    const [r] = await tx.select().from(bookingRequests).where(eq(bookingRequests.id, id));
    return r!;
  });

const seedAppointment = (patientId: string, start: Date, status = 'scheduled') =>
  run(async (tx) => {
    const [a] = await tx
      .insert(appointments)
      .values({
        tenantId: tA,
        branchId: branchA,
        doctorId,
        patientId,
        startTime: start,
        endTime: new Date(start.getTime() + 30 * 60_000),
        status: status as 'scheduled',
      })
      .returning({ id: appointments.id });
    return a!.id;
  });

const apptStatus = (id: string) =>
  run(async (tx) => {
    const [a] = await tx.select().from(appointments).where(eq(appointments.id, id));
    return a!;
  });

beforeAll(async () => {
  globalThis.fetch = (async (url: unknown, init?: RequestInit) => {
    fetchCalls.push({ url: String(url), body: typeof init?.body === 'string' ? init.body : '' });
    return new Response(JSON.stringify({ result: { message_id: 7 } }), { status: 200 });
  }) as unknown as typeof fetch;

  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
  await seedPermissions(db);

  const us = await db
    .insert(users)
    .values([
      { phone: '+998900000701', passwordHash: 'x', fullName: 'Owner T2' },
      { phone: '+998900000702', passwordHash: 'x', fullName: 'Doktor T2' },
      { phone: '+998900000703', passwordHash: 'x', fullName: 'Registrator T2' },
      { phone: '+998900000704', passwordHash: 'x', fullName: 'Buxgalter T2' },
    ])
    .returning({ id: users.id });
  ownerId = us[0]!.id;
  doctorId = us[1]!.id;
  receptionistId = us[2]!.id;
  accountantId = us[3]!.id;

  const ts = await db
    .insert(tenants)
    .values([
      { name: 'T2 Clinic A', slug: 'ui-t2-a', ownerUserId: ownerId, defaultLanguage: 'uz' },
      { name: 'T2 Clinic B', slug: 'ui-t2-b', ownerUserId: ownerId, defaultLanguage: 'uz' },
    ])
    .returning({ id: tenants.id });
  tA = ts[0]!.id;
  tB = ts[1]!.id;

  const allDays = Object.fromEntries(
    ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'].map((d) => [
      d,
      { open: '09:00', close: '18:00' },
    ]),
  );
  await withTenant(tA, async (tx) => {
    const [b] = await tx
      .insert(branches)
      .values({ tenantId: tA, name: 'Bosh filial', workHours: allDays })
      .returning({ id: branches.id });
    branchA = b!.id;

    // Doktor: `medical_record.edit` ruxsatli rol (listDoctors shu signalga tayanadi).
    const [role] = await tx
      .insert(roles)
      .values({ tenantId: tA, name: 'Doctor' })
      .returning({ id: roles.id });
    const [perm] = await db
      .select({ id: permissions.id })
      .from(permissions)
      .where(eq(permissions.code, 'medical_record.edit'));
    await tx.insert(rolePermissions).values({ roleId: role!.id, permissionId: perm!.id });
    await tx.insert(userAssignments).values({
      userId: doctorId,
      tenantId: tA,
      roleId: role!.id,
      branchId: branchA,
      isActive: true,
      acceptedAt: new Date(),
    });

    const ps = await tx
      .insert(patients)
      .values([
        {
          tenantId: tA,
          fullName: 'Bemor Bir',
          phone: '+998901000001',
          telegramChatId: CHAT_A,
        },
        {
          tenantId: tA,
          fullName: 'Bemor Ikki',
          phone: '+998901000002',
          telegramChatId: CHAT_B,
        },
      ])
      .returning({ id: patients.id });
    patient1 = ps[0]!.id;
    patient2 = ps[1]!.id;
  });
  await withTenant(tB, async (tx) => {
    const [b] = await tx
      .insert(branches)
      .values({ tenantId: tB, name: 'B filial' })
      .returning({ id: branches.id });
    branchB = b!.id;
    const [p] = await tx
      .insert(patients)
      .values({ tenantId: tB, fullName: 'B Bemor', phone: '+998901000009' })
      .returning({ id: patients.id });
    patientB = p!.id;
  });

  receptionistToken = await roleToken(receptionistId, tA, 'receptionist');
  accountantToken = await roleToken(accountantId, tA, 'accountant');
});

afterAll(async () => {
  globalThis.fetch = realFetch;
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
  if (existsSync(secretPath)) rmSync(secretPath);
});

beforeEach(() => {
  fetchCalls = [];
});

// ═════════════════════════════════════════════════════════════════════════════
describe('UI-T2 — bron oqimi (bot ichidagi suhbat)', () => {
  test('filial → shifokor → kun → slot → pending so‘rov (haqiqiy availability, P10 fallback)', async () => {
    await run(async (tx) => {
      // Bitta filial → darhol shifokor tanlash.
      const r1 = await flows.onCommand(tx, { tenantId: tA, chatId: CHAT_A, command: 'book' });
      expect(r1.text).toContain('Shifokor');
      const docBtn = r1.buttons?.flat().find((b) => b.text === 'Doktor T2');
      expect(docBtn).toBeDefined();

      const r2 = await flows.onCallback(tx, {
        tenantId: tA,
        chatId: CHAT_A,
        data: docBtn!.data,
      });
      expect(r2.reply?.buttons?.flat().length).toBeGreaterThan(5); // 7 kun + nav

      // Kun #2 (indeks 2) — kelajakdagi kun, o'tgan slotlar yo'q.
      const r3 = await flows.onCallback(tx, { tenantId: tA, chatId: CHAT_A, data: 'bk:t:2' });
      const slotBtns = r3.reply?.buttons?.flat().filter((b) => b.data.startsWith('bk:s:')) ?? [];
      expect(slotBtns.length).toBeGreaterThan(0);

      const r4 = await flows.onCallback(tx, { tenantId: tA, chatId: CHAT_A, data: 'bk:s:0' });
      expect(r4.reply?.text).toContain('So‘rov yuborildi');
    });

    const rows = await run((tx) =>
      tx.select().from(bookingRequests).where(eq(bookingRequests.patientId, patient1)),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.status).toBe('pending');
    expect(rows[0]!.doctorId).toBe(doctorId);
    expect(rows[0]!.branchId).toBe(branchA);
    // 09:00 Tashkent (filial ish soati) — birinchi bo'sh slot.
    expect(rows[0]!.requestedStart.toISOString().slice(11, 16)).toBe('04:00');

    // Ikkinchi urinish — allaqachon ko'rib chiqilmoqda.
    await run(async (tx) => {
      const again = await flows.onCommand(tx, { tenantId: tA, chatId: CHAT_A, command: 'book' });
      expect(again.text).toContain('ko‘rib chiqilmoqda');
    });
    await run((tx) => tx.delete(bookingRequests).where(eq(bookingRequests.patientId, patient1)));
  });

  test('bog‘lanmagan chat → «Avval raqamingizni ulashing», so‘rov yaratilmaydi', async () => {
    await run(async (tx) => {
      const r = await flows.onCommand(tx, { tenantId: tA, chatId: '9999', command: 'book' });
      expect(r.text).toContain('ulashing');
      const cb = await flows.onCallback(tx, { tenantId: tA, chatId: '9999', data: 'bk:s:0' });
      expect(cb.reply).toBeNull();
    });
  });

  test('bemor tili: /lang → ru, keyingi xabarlar ruscha (preferred_language)', async () => {
    await run(async (tx) => {
      const r = await flows.onCallback(tx, { tenantId: tA, chatId: CHAT_B, data: 'lg:ru' });
      expect(r.reply?.text).toContain('Язык');
      const menu = await flows.onCommand(tx, { tenantId: tA, chatId: CHAT_B, command: 'menu' });
      expect(menu.keyboard?.flat()).toContain('📅 Записаться');
    });
    const p = await run(async (tx) => {
      const [x] = await tx.select().from(patients).where(eq(patients.id, patient2));
      return x!;
    });
    expect(p.preferredLanguage).toBe('ru');
    await run((tx) =>
      tx.update(patients).set({ preferredLanguage: null }).where(eq(patients.id, patient2)),
    );
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe('UI-T2 — registrator tasdiqlashi (HTTP, real Receptionist/Accountant rollari)', () => {
  test('confirm → 200, appointment yaratiladi, so‘rov confirmed', async () => {
    const id = await seedRequest({ start: tomorrowAt(10, 2) });
    const res = await call(receptionistToken, 'POST', `/api/booking-requests/${id}/confirm`, {});
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { status: string; appointmentId: string } };
    expect(body.data.status).toBe('confirmed');

    const r = await reqRow(id);
    expect(r.status).toBe('confirmed');
    expect(r.decidedBy).toBe(receptionistId);
    expect(r.appointmentId).toBe(body.data.appointmentId);
    const a = await apptStatus(body.data.appointmentId);
    expect(a.patientId).toBe(patient1);
    expect(a.doctorId).toBe(doctorId);
    expect(a.status).toBe('scheduled');

    // Qayta confirm → 409 (allaqachon hal qilingan).
    const again = await call(receptionistToken, 'POST', `/api/booking-requests/${id}/confirm`, {});
    expect(again.status).toBe(409);
  });

  test('slot band bo‘lib qolgan → 409, so‘rov `pending` QOLADI, appointment yaratilmaydi', async () => {
    const start = tomorrowAt(11, 2);
    const id = await seedRequest({ start });
    // Boshqa bemor shu doktorning shu slotini egallab oldi.
    await seedAppointment(patient2, start);

    const res = await call(receptionistToken, 'POST', `/api/booking-requests/${id}/confirm`, {});
    expect(res.status).toBe(409);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('conflict.doctor_busy');

    const r = await reqRow(id);
    expect(r.status).toBe('pending');
    expect(r.appointmentId).toBeNull();
    const cnt = await run((tx) =>
      tx.select().from(appointments).where(eq(appointments.patientId, patient1)),
    );
    expect(cnt.filter((a) => a.startTime.getTime() === start.getTime())).toHaveLength(0);
  });

  test('doktorsiz so‘rov: doctorId berilmasa 400, berilsa tasdiqlanadi', async () => {
    const id = await seedRequest({ start: tomorrowAt(12, 2), doctorId: null });
    const bad = await call(receptionistToken, 'POST', `/api/booking-requests/${id}/confirm`, {});
    expect(bad.status).toBe(400);
    expect((await reqRow(id)).status).toBe('pending');
    const ok = await call(receptionistToken, 'POST', `/api/booking-requests/${id}/confirm`, {
      doctorId,
    });
    expect(ok.status).toBe(200);
  });

  test('«Boshqa vaqt» so‘rovi tasdiqlanganda eski yozilish bekor qilinadi', async () => {
    const old = await seedAppointment(patient1, tomorrowAt(14, 3));
    const id = await seedRequest({ start: tomorrowAt(15, 3), rescheduleOf: old });
    const res = await call(receptionistToken, 'POST', `/api/booking-requests/${id}/confirm`, {});
    expect(res.status).toBe(200);
    const o = await apptStatus(old);
    expect(o.status).toBe('cancelled');
    expect(o.cancellationReason).toBe('rescheduled_via_telegram');
  });

  test('decline sabab bilan → 200; sababsiz 400; hal qilingan qayta rad → 409', async () => {
    const id = await seedRequest({ start: tomorrowAt(16, 2) });
    expect(
      (await call(receptionistToken, 'POST', `/api/booking-requests/${id}/decline`, {})).status,
    ).toBe(400);
    const res = await call(receptionistToken, 'POST', `/api/booking-requests/${id}/decline`, {
      reason: 'Shifokor yo‘q',
    });
    expect(res.status).toBe(200);
    const r = await reqRow(id);
    expect(r.status).toBe('declined');
    expect(r.declineReason).toBe('Shifokor yo‘q');
    expect(
      (
        await call(receptionistToken, 'POST', `/api/booking-requests/${id}/decline`, {
          reason: 'x',
        })
      ).status,
    ).toBe(409);
  });

  test('RO‘YXAT: registrator faqat o‘z tenantini ko‘radi; Accountant 403 (real rol)', async () => {
    const mineId = await seedRequest({ start: tomorrowAt(17, 4) });
    const theirsId = await seedRequest({
      tenantId: tB,
      branchId: branchB,
      patientId: patientB,
      doctorId: null,
      start: tomorrowAt(10, 4),
    });

    const res = await call(receptionistToken, 'GET', '/api/booking-requests?status=pending');
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      data: { items: { id: string; patientName: string }[]; pendingCount: number };
    };
    const ids = body.data.items.map((i) => i.id);
    expect(ids).toContain(mineId);
    expect(ids).not.toContain(theirsId);
    expect(body.data.pendingCount).toBeGreaterThanOrEqual(1);
    expect(body.data.items.find((i) => i.id === mineId)?.patientName).toBe('Bemor Bir');

    // Begona tenant so‘rovini tasdiqlash/rad etish — RLS: topilmaydi (404), o‘zgarmaydi.
    const x = await call(receptionistToken, 'POST', `/api/booking-requests/${theirsId}/confirm`, {
      doctorId,
    });
    expect(x.status).toBe(404);
    expect((await reqRow(theirsId, tB)).status).toBe('pending');

    // Accountant: appointment.view/create yo'q → 403 (list + confirm + decline).
    expect((await call(accountantToken, 'GET', '/api/booking-requests')).status).toBe(403);
    expect(
      (await call(accountantToken, 'POST', `/api/booking-requests/${mineId}/confirm`, {})).status,
    ).toBe(403);
    expect(
      (
        await call(accountantToken, 'POST', `/api/booking-requests/${mineId}/decline`, {
          reason: 'x',
        })
      ).status,
    ).toBe(403);
    expect((await reqRow(mineId)).status).toBe('pending');
  });

  test('24 soatdan eski pending → expired (list lazy + expireStale + confirm 409)', async () => {
    const old = new Date(Date.now() - 25 * 3_600_000);
    const staleConfirm = await seedRequest({ start: tomorrowAt(10, 5), createdAt: old });
    const staleList = await seedRequest({ start: tomorrowAt(11, 5), createdAt: old });
    const staleTimer = await seedRequest({
      tenantId: tB,
      branchId: branchB,
      patientId: patientB,
      doctorId: null,
      start: tomorrowAt(12, 5),
      createdAt: old,
    });
    const fresh = await seedRequest({ start: tomorrowAt(13, 5) });

    // confirm eskirgan so'rovda → 409 + expired
    const c = await call(
      receptionistToken,
      'POST',
      `/api/booking-requests/${staleConfirm}/confirm`,
      {},
    );
    expect(c.status).toBe(409);
    expect(((await c.json()) as { error: { code: string } }).error.code).toBe(
      'booking_request.expired',
    );
    expect((await reqRow(staleConfirm)).status).toBe('expired');

    // list lazy-expiry
    const l = await call(receptionistToken, 'GET', '/api/booking-requests?status=pending');
    const ids = ((await l.json()) as { data: { items: { id: string }[] } }).data.items.map(
      (i) => i.id,
    );
    expect(ids).not.toContain(staleList);
    expect(ids).toContain(fresh);
    expect((await reqRow(staleList)).status).toBe('expired');

    // taymer yo'li (admin/cross-tenant) — B tenant so'rovini ham yopadi.
    // Taymer admin (RLS-bypass) ulanish bilan ishlaydi — ilova roli (RLS) tenantsiz 0 qator ko'radi.
    const admin = createAdminDb();
    try {
      const n = await expireStaleBookingRequests(admin.db);
      expect(n).toBeGreaterThanOrEqual(1);
    } finally {
      await admin.client.end({ timeout: 5 });
    }
    expect((await reqRow(staleTimer, tB)).status).toBe('expired');
    expect((await reqRow(fresh)).status).toBe('pending');
  });

  test('bemorga qaror xabari: tasdiq/rad bemor tilida, FAQAT bog‘langan + token sozlangan bemorga', async () => {
    await withTenant(tA, (tx) =>
      tx
        .insert(tenantSettings)
        .values({
          tenantId: tA,
          integrationSettings: { telegram: { botTokenEnc: encryptSecret('t2-token') } },
        })
        .onConflictDoNothing(),
    );
    await run((tx) =>
      tx.update(patients).set({ preferredLanguage: 'ru' }).where(eq(patients.id, patient2)),
    );
    const messenger = createPatientMessenger();
    await messenger.sendBookingDecision({
      tenantId: tA,
      patientId: patient2,
      decision: 'declined',
      start: tomorrowAt(10),
      reason: 'нет врача',
    });
    const tg = fetchCalls.filter((c) => c.url.includes('api.telegram.org'));
    expect(tg).toHaveLength(1);
    expect(tg[0]!.url).toContain('t2-token');
    expect(tg[0]!.body).toContain(`"chat_id":"${CHAT_B}"`);
    expect(tg[0]!.body).toContain('отклонена');

    // Bog'lanmagan bemor (B tenant) — hech narsa yuborilmaydi.
    fetchCalls = [];
    await createPatientMessenger().sendBookingDecision({
      tenantId: tB,
      patientId: patientB,
      decision: 'confirmed',
      start: tomorrowAt(10),
    });
    expect(fetchCalls).toHaveLength(0);
    await run((tx) =>
      tx.update(patients).set({ preferredLanguage: null }).where(eq(patients.id, patient2)),
    );
  });

  test('chek va retsept xabari (PII minimal) — spy kanal, real DB', async () => {
    const sent: string[] = [];
    const spy: NotificationChannel = {
      send: async (_to, m) => {
        sent.push(m.text);
        return { ok: true };
      },
    };
    const messenger = createPatientMessenger({
      resolveChannel: () => ({ channel: spy, to: CHAT_A, source: 'telegram' }),
    });
    await messenger.sendReceipt({
      tenantId: tA,
      patientId: patient1,
      amount: 250000,
      at: new Date('2026-12-10T05:00:00Z'),
      receiptNumber: 'R-1',
    });
    await messenger.sendPrescription({
      tenantId: tA,
      patientId: patient1,
      issuedAt: new Date('2026-12-10T05:00:00Z'),
      items: [
        { medicationName: 'Ibuprofen', dosage: '400 mg', frequency: '3 mahal', durationDays: 5 },
      ],
    });
    expect(sent[0]).toContain('250');
    expect(sent[0]).toContain('R-1');
    expect(sent[0]).not.toContain('Bemor Bir'); // PII yo'q (ism ham yo'q)
    expect(sent[1]).toContain('Ibuprofen');
    expect(sent[1]).toContain('3 mahal');
    expect(sent[1]).toContain('5 kun');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe('UI-T2 — eslatma tugmalari (egalik tekshiruvi)', () => {
  test('Kelaman: egasi → confirmed; ikkinchi bosish → «Allaqachon qayd etildi»', async () => {
    const id = await seedAppointment(patient1, tomorrowAt(10, 6));
    await run(async (tx) => {
      const r = await flows.onCallback(tx, {
        tenantId: tA,
        chatId: CHAT_A,
        data: reminderCallbackData('ok', id),
      });
      expect(r.reply?.text).toContain('Rahmat');
    });
    expect((await apptStatus(id)).status).toBe('confirmed');
    await run(async (tx) => {
      const r2 = await flows.onCallback(tx, {
        tenantId: tA,
        chatId: CHAT_A,
        data: reminderCallbackData('ok', id),
      });
      expect(r2.reply).toBeNull();
      expect(r2.toast).toContain('Allaqachon');
    });
  });

  test('BEGONA CHAT callback’i (boshqa bemorning yozilishi) hech narsani o‘zgartirmaydi', async () => {
    const id = await seedAppointment(patient1, tomorrowAt(11, 6));
    await run(async (tx) => {
      for (const action of ['ok', 'no', 're'] as const) {
        const r = await flows.onCallback(tx, {
          tenantId: tA,
          chatId: CHAT_B, // patient2 chat'i, yozilish patient1'niki
          data: reminderCallbackData(action, id),
        });
        expect(r.reply).toBeNull();
        expect(r.toast).toContain('mavjud emas');
      }
      // Umuman bog'lanmagan chat ham.
      const r = await flows.onCallback(tx, {
        tenantId: tA,
        chatId: '31337',
        data: reminderCallbackData('no', id),
      });
      expect(r.reply).toBeNull();
    });
    const a = await apptStatus(id);
    expect(a.status).toBe('scheduled');
    expect(a.cancellationReason).toBeNull();
    // Begona chat orqali bron so'rovi ham yaratilmagan («Boshqa vaqt»).
    const reqs = await run((tx) =>
      tx.select().from(bookingRequests).where(eq(bookingRequests.rescheduleOfAppointmentId, id)),
    );
    expect(reqs).toHaveLength(0);
  });

  test('Bekor: egasi → cancelled (sabab patient_telegram)', async () => {
    const id = await seedAppointment(patient1, tomorrowAt(12, 6));
    await run(async (tx) => {
      const r = await flows.onCallback(tx, {
        tenantId: tA,
        chatId: CHAT_A,
        data: reminderCallbackData('no', id),
      });
      expect(r.reply?.text).toContain('bekor');
    });
    const a = await apptStatus(id);
    expect(a.status).toBe('cancelled');
    expect(a.cancellationReason).toBe('patient_telegram');
  });

  test('Boshqa vaqt: egasi → bron oqimi boshlanadi; so‘rov eski yozilishga bog‘lanadi', async () => {
    const id = await seedAppointment(patient1, tomorrowAt(13, 6));
    // Oldingi testlardan qolgan ochiq so'rovlar oqimni bloklamasin.
    await run((tx) => tx.delete(bookingRequests).where(eq(bookingRequests.patientId, patient1)));
    await run(async (tx) => {
      const r = await flows.onCallback(tx, {
        tenantId: tA,
        chatId: CHAT_A,
        data: reminderCallbackData('re', id),
      });
      expect(r.reply?.text).toContain('Shifokor'); // bitta filial → shifokor bosqichi
      const doc = r.reply?.buttons?.flat().find((b) => b.text === 'Doktor T2');
      await flows.onCallback(tx, { tenantId: tA, chatId: CHAT_A, data: doc!.data });
      await flows.onCallback(tx, { tenantId: tA, chatId: CHAT_A, data: 'bk:t:3' });
      const done = await flows.onCallback(tx, { tenantId: tA, chatId: CHAT_A, data: 'bk:s:1' });
      expect(done.reply?.text).toContain('Boshqa vaqt');
    });
    // Eski yozilish hali tegilmagan — registrator tasdiqlaguncha.
    expect((await apptStatus(id)).status).toBe('scheduled');
    const reqs = await run((tx) =>
      tx.select().from(bookingRequests).where(eq(bookingRequests.rescheduleOfAppointmentId, id)),
    );
    expect(reqs).toHaveLength(1);
    expect(reqs[0]!.status).toBe('pending');
    await run((tx) => tx.delete(bookingRequests).where(eq(bookingRequests.patientId, patient1)));
  });

  test('24 soatlik eslatma Telegram kanalida inline tugmalar bilan ketadi (real worker kodi)', async () => {
    const id = await seedAppointment(patient1, tomorrowAt(15, 7));
    await withTenant(tA, (tx) =>
      tx
        .update(tenantSettings)
        .set({ integrationSettings: { telegram: { botTokenEnc: encryptSecret('t2-token') } } })
        .where(eq(tenantSettings.tenantId, tA)),
    );
    const svc = createNotificationsService({ sms: createNoOpChannel(() => {}) });
    await processReminderJob(svc, { tenantId: tA, appointmentId: id });
    const tg = fetchCalls.filter((c) => c.url.includes('api.telegram.org'));
    expect(tg).toHaveLength(1);
    const payload = JSON.parse(tg[0]!.body) as {
      reply_markup: { inline_keyboard: { text: string; callback_data: string }[][] };
    };
    const row = payload.reply_markup.inline_keyboard[0]!;
    expect(row.map((b) => b.text)).toEqual(['✅ Kelaman', '🕒 Boshqa vaqt', '❌ Bekor']);
    expect(row.map((b) => b.callback_data)).toEqual([`rm:ok:${id}`, `rm:re:${id}`, `rm:no:${id}`]);
    expect(row.every((b) => b.callback_data.length <= 64)).toBe(true);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe('UI-T2 — anketa (qoralama, allergiyalarga avtomatik yozilmaydi)', () => {
  test('5 savol → questionnaire_answers + questionnaire_at; allergies/chronic/medications TEGILMAYDI', async () => {
    // Shifokor allaqachon tasdiqlagan tibbiy yozuv.
    await run((tx) =>
      tx
        .insert(medicalRecords)
        .values({
          tenantId: tA,
          patientId: patient1,
          allergies: [{ type: 'medication', substance: 'Penitsillin', severity: 'severe' }],
          chronicConditions: ['diabetes'],
          currentMedications: ['metformin'],
        })
        .onConflictDoNothing(),
    );

    await run(async (tx) => {
      const intro = await flows.onCommand(tx, { tenantId: tA, chatId: CHAT_A, command: 'anketa' });
      expect(intro.text).toContain('Allergiyangiz');
      const answers = ['yo‘q', 'gipertoniya', 'aspirin', '', 'yo‘q'];
      // 4-savol (homiladorlik) ixtiyoriy — o'tkazib yuboriladi.
      await flows.onText(tx, { tenantId: tA, chatId: CHAT_A, text: answers[0]! });
      await flows.onText(tx, { tenantId: tA, chatId: CHAT_A, text: answers[1]! });
      await flows.onText(tx, { tenantId: tA, chatId: CHAT_A, text: answers[2]! });
      const skip = await flows.onCallback(tx, { tenantId: tA, chatId: CHAT_A, data: 'qs:skip' });
      expect(skip.reply?.text).toContain('og‘riqsizlantirish');
      const done = await flows.onText(tx, { tenantId: tA, chatId: CHAT_A, text: answers[4]! });
      expect(done.text).toContain('shifokorga');
    });

    const rec = await run(async (tx) => {
      const [r] = await tx
        .select()
        .from(medicalRecords)
        .where(eq(medicalRecords.patientId, patient1));
      return r!;
    });
    expect(rec.questionnaireAnswers).toEqual({
      allergies: 'yo‘q',
      chronic: 'gipertoniya',
      medications: 'aspirin',
      anesthesia: 'yo‘q',
    });
    expect(rec.questionnaireAt).not.toBeNull();
    // Klinik maydonlar o'zgarmagan (qoralama — shifokor tasdiqlaydi).
    expect(rec.allergies).toEqual([
      { type: 'medication', substance: 'Penitsillin', severity: 'severe' },
    ]);
    expect(rec.chronicConditions).toEqual(['diabetes']);
    expect(rec.currentMedications).toEqual(['metformin']);
    expect(rec.confirmedAt).toBeNull();
  });

  test('yangi bemorda tibbiy yozuv bo‘lmasa — faqat qoralama bilan yaratiladi, allergies null', async () => {
    await run(async (tx) => {
      await flows.onCommand(tx, { tenantId: tA, chatId: CHAT_B, command: 'anketa' });
      for (const t of ['penitsillin allergiyasi', 'yo‘q', 'yo‘q']) {
        await flows.onText(tx, { tenantId: tA, chatId: CHAT_B, text: t });
      }
      await flows.onCallback(tx, { tenantId: tA, chatId: CHAT_B, data: 'qs:skip' });
      await flows.onText(tx, { tenantId: tA, chatId: CHAT_B, text: 'yo‘q' });
    });
    const rec = await run(async (tx) => {
      const [r] = await tx
        .select()
        .from(medicalRecords)
        .where(and(eq(medicalRecords.patientId, patient2)));
      return r!;
    });
    expect(rec.questionnaireAnswers?.allergies).toBe('penitsillin allergiyasi');
    expect(rec.allergies).toBeNull(); // AVTOMATIK yozilmaydi
  });
});
