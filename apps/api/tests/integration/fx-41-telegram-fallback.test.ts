/**
 * FX-41 (LA-22) — Telegram 403/blocked → SMS fallback + chat_id tozalash; telefon/token
 * o'zgarsa bog'lanish bekor; xodim «Telegramni uzish» (REAL DB, RLS app-rol).
 *
 *   cd apps/api && bun test tests/integration/fx-41-telegram-fallback.test.ts --env-file=../../.env
 */
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  appointments,
  branches,
  patients,
  recallLogs,
  recalls,
  tenantSettings,
  tenants,
  users,
} from '@dental/db-schema';
import { createNoOpChannel } from '@dental/notifications';
import { eq, sql } from 'drizzle-orm';
import type { Context } from 'hono';
import { createAdminDb, db } from '../../src/db/client.ts';
import { withTenant } from '../../src/db/scoped.ts';
import { encryptSecret } from '../../src/lib/crypto.ts';
import { processRecallScan } from '../../src/lib/recall-worker.ts';
import { processReminderJob } from '../../src/lib/reminder-worker.ts';
import { createNotificationsService } from '../../src/modules/notifications/notifications.service.ts';
import { createPatientsService } from '../../src/modules/patients/patients.service.ts';
import { createTenantSettingsService } from '../../src/modules/tenant-settings/tenant-settings.service.ts';

const secretDir = mkdtempSync(join(tmpdir(), 'fx41-'));
process.env.MESSAGING_SECRET_PATH = join(secretDir, 'secret.txt');

const admin = createAdminDb();

type FetchCall = { url: string; body: string };
let fetchCalls: FetchCall[] = [];
let telegramStatus = 403;
const realFetch = globalThis.fetch;

beforeAll(() => {
  globalThis.fetch = (async (url: unknown, init?: RequestInit) => {
    const u = String(url);
    const body = typeof init?.body === 'string' ? init.body : '';
    fetchCalls.push({ url: u, body });
    if (u.includes('api.telegram.org')) {
      return telegramStatus === 200
        ? new Response(JSON.stringify({ result: { message_id: 1 } }), { status: 200 })
        : new Response('{"ok":false}', { status: telegramStatus });
    }
    if (u.includes('/auth/login')) {
      return new Response(JSON.stringify({ data: { token: 'eskiz-tok' } }), { status: 200 });
    }
    if (u.includes('/message/sms/send')) {
      return new Response(JSON.stringify({ id: 'eskiz-msg' }), { status: 200 });
    }
    return new Response('not found', { status: 404 });
  }) as unknown as typeof fetch;
});

const svc = createNotificationsService({ sms: createNoOpChannel(() => {}) });
const noopAudit = { record: async () => {} } as never;
const patientsService = createPatientsService({ audit: noopAudit });

let ownerId: string;
let tBoth: string;
let tTgOnly: string;
let branchBoth: string;
let branchTgOnly: string;

const seedTenant = async (slug: string) => {
  const [t] = await db
    .insert(tenants)
    .values({ name: slug, slug, ownerUserId: ownerId, defaultLanguage: 'uz' })
    .returning({ id: tenants.id });
  return t!.id;
};

const smsCreds = {
  eskizEmailEnc: encryptSecret('c@eskiz.uz'),
  eskizPasswordEnc: encryptSecret('pw'),
};

let hour = 0;
const seedAppt = async (tenantId: string, branchId: string, phone: string, chat: string) =>
  withTenant(tenantId, async (tx) => {
    const [p] = await tx
      .insert(patients)
      .values({ tenantId, fullName: 'Bemor', phone, telegramChatId: chat })
      .returning({ id: patients.id });
    const h = 8 + hour++;
    const [a] = await tx
      .insert(appointments)
      .values({
        tenantId,
        branchId,
        doctorId: ownerId,
        patientId: p!.id,
        startTime: new Date(`2036-12-11T${String(h).padStart(2, '0')}:00:00+05:00`),
        endTime: new Date(`2036-12-11T${String(h).padStart(2, '0')}:30:00+05:00`),
        status: 'scheduled',
      })
      .returning({ id: appointments.id });
    return { apptId: a!.id, patientId: p!.id };
  });

const chatOf = (tenantId: string, patientId: string) =>
  withTenant(tenantId, async (tx) => {
    const [r] = await tx
      .select({ chat: patients.telegramChatId })
      .from(patients)
      .where(eq(patients.id, patientId));
    return r!.chat;
  });

const ctx = (tx: unknown, tenantId: string): Context =>
  ({
    get: (k: string) =>
      k === 'db'
        ? tx
        : k === 'activeTenantId'
          ? tenantId
          : k === 'accessClaims'
            ? { perms: ['patient.edit', 'patient.view'] }
            : k === 'user'
              ? { id: ownerId }
              : k === 'afterCommit'
                ? []
                : undefined,
  }) as unknown as Context;

beforeAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
  const [o] = await db
    .insert(users)
    .values({ phone: '+998900000041', passwordHash: 'x', fullName: 'Owner41' })
    .returning({ id: users.id });
  ownerId = o!.id;
  tBoth = await seedTenant('fx41-both');
  tTgOnly = await seedTenant('fx41-tg');
  for (const [t, set] of [
    [tBoth, { telegram: { botTokenEnc: encryptSecret('tg-both') }, sms: smsCreds }],
    [tTgOnly, { telegram: { botTokenEnc: encryptSecret('tg-only') } }],
  ] as const) {
    await withTenant(t, (tx) =>
      tx.insert(tenantSettings).values({ tenantId: t, integrationSettings: set }),
    );
  }
  branchBoth = await withTenant(tBoth, async (tx) => {
    const [b] = await tx.insert(branches).values({ tenantId: tBoth, name: 'B' }).returning({
      id: branches.id,
    });
    return b!.id;
  });
  branchTgOnly = await withTenant(tTgOnly, async (tx) => {
    const [b] = await tx.insert(branches).values({ tenantId: tTgOnly, name: 'B' }).returning({
      id: branches.id,
    });
    return b!.id;
  });
});

afterAll(async () => {
  globalThis.fetch = realFetch;
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
  await admin.client.end({ timeout: 5 });
  rmSync(secretDir, { recursive: true, force: true });
});

beforeEach(() => {
  fetchCalls = [];
  telegramStatus = 403;
});

const eskizSends = () => fetchCalls.filter((c) => c.url.includes('/message/sms/send'));

describe('FX-41 — eslatma: Telegram 403 → SMS fallback + chat tozalash', () => {
  test('403 + SMS sozlangan → SMS ketadi, telegramChatId tozalanadi', async () => {
    const { apptId, patientId } = await seedAppt(tBoth, branchBoth, '+998901000041', '4101');
    await processReminderJob(svc, { tenantId: tBoth, appointmentId: apptId });

    expect(fetchCalls.filter((c) => c.url.includes('api.telegram.org'))).toHaveLength(1);
    expect(eskizSends()).toHaveLength(1);
    expect(eskizSends()[0]!.body).toContain('998901000041');
    expect(await chatOf(tBoth, patientId)).toBeNull();
  });

  test('403 + SMS yo‘q → job yiqilmaydi, chat tozalanadi', async () => {
    const { apptId, patientId } = await seedAppt(tTgOnly, branchTgOnly, '+998901000042', '4102');
    await processReminderJob(svc, { tenantId: tTgOnly, appointmentId: apptId });
    expect(eskizSends()).toHaveLength(0);
    expect(await chatOf(tTgOnly, patientId)).toBeNull();
  });

  test('500 (vaqtinchalik) → SMS fallback, lekin chat TOZALANMAYDI', async () => {
    telegramStatus = 500;
    const { apptId, patientId } = await seedAppt(tBoth, branchBoth, '+998901000043', '4103');
    await processReminderJob(svc, { tenantId: tBoth, appointmentId: apptId });
    expect(eskizSends()).toHaveLength(1);
    expect(await chatOf(tBoth, patientId)).toBe('4103');
  });

  test('Telegram ishlasa → SMS yuborilmaydi, chat saqlanadi', async () => {
    telegramStatus = 200;
    const { apptId, patientId } = await seedAppt(tBoth, branchBoth, '+998901000044', '4104');
    await processReminderJob(svc, { tenantId: tBoth, appointmentId: apptId });
    expect(eskizSends()).toHaveLength(0);
    expect(await chatOf(tBoth, patientId)).toBe('4104');
  });
});

describe('FX-41 — recall: Telegram 403 → SMS fallback', () => {
  const now = new Date('2026-06-21T07:00:00Z');
  test('403 → SMS yuboriladi, recall contacted, chat tozalanadi', async () => {
    await admin.db.delete(recallLogs);
    await admin.db.delete(recalls);
    const { recallId, patientId } = await withTenant(tBoth, async (tx) => {
      const [p] = await tx
        .insert(patients)
        .values({ tenantId: tBoth, fullName: 'R', phone: '+998901000051', telegramChatId: '4151' })
        .returning({ id: patients.id });
      const [r] = await tx
        .insert(recalls)
        .values({
          tenantId: tBoth,
          patientId: p!.id,
          reason: 'preventive',
          status: 'pending',
          source: 'scheduler',
          dueDate: '2020-01-01',
        })
        .returning({ id: recalls.id });
      return { recallId: r!.id, patientId: p!.id };
    });
    const res = await processRecallScan({ adminDb: admin.db, withTenant, now });
    expect(res.sent).toBe(1);
    expect(eskizSends()).toHaveLength(1);
    expect(await chatOf(tBoth, patientId)).toBeNull();
    const [row] = await withTenant(tBoth, (tx) =>
      tx.select({ s: recalls.status }).from(recalls).where(eq(recalls.id, recallId)),
    );
    expect(row!.s).toBe('contacted');
  });
});

describe('FX-41 — bog‘lanishni bekor qilish', () => {
  test('bemor telefoni o‘zgarsa telegramChatId tozalanadi; telefonsiz boshqa maydon o‘zgarsa saqlanadi', async () => {
    const { patientId } = await seedAppt(tBoth, branchBoth, '+998901000061', '4161');
    await withTenant(tBoth, async (tx) => {
      await patientsService.update(ctx(tx, tBoth), patientId, { notes: 'x' });
    });
    expect(await chatOf(tBoth, patientId)).toBe('4161');
    await withTenant(tBoth, async (tx) => {
      await patientsService.update(ctx(tx, tBoth), patientId, { phone: '+998901000062' });
    });
    expect(await chatOf(tBoth, patientId)).toBeNull();
  });

  test('bot tokeni almashtirilsa tenant bemorlarining chat bog‘lanishi bekor; o‘sha token qayta saqlansa — saqlanadi', async () => {
    const { patientId } = await seedAppt(tTgOnly, branchTgOnly, '+998901000063', '4163');
    const settings = createTenantSettingsService({ audit: noopAudit });
    await withTenant(tTgOnly, async (tx) => {
      await settings.update(ctx(tx, tTgOnly), { telegram: { botToken: 'tg-only' } });
    });
    expect(await chatOf(tTgOnly, patientId)).toBe('4163');
    await withTenant(tTgOnly, async (tx) => {
      await settings.update(ctx(tx, tTgOnly), { telegram: { botToken: '1:new-token' } });
    });
    expect(await chatOf(tTgOnly, patientId)).toBeNull();
  });

  test('review: o‘sha bot (id bir xil) tokeni yangi sir bilan almashsa yoki Telegram o‘chirilib qayta yoqilsa — bog‘lanish saqlanadi; boshqa bot id — tozalanadi', async () => {
    const settings = createTenantSettingsService({ audit: noopAudit });
    await withTenant(tTgOnly, async (tx) => {
      await settings.update(ctx(tx, tTgOnly), { telegram: { botToken: '777:old-secret' } });
    });
    const { patientId } = await seedAppt(tTgOnly, branchTgOnly, '+998901000065', '4165');

    // BotFather /revoke — bot id (':' oldidan) o'zgarmaydi, faqat sir.
    await withTenant(tTgOnly, async (tx) => {
      await settings.update(ctx(tx, tTgOnly), { telegram: { botToken: '777:new-secret' } });
    });
    expect(await chatOf(tTgOnly, patientId)).toBe('4165');

    // O'chirish — bog'lanishlar tegilmaydi (403/onBlocked yo'li bemor bo'yicha tozalaydi).
    await withTenant(tTgOnly, async (tx) => {
      await settings.update(ctx(tx, tTgOnly), { telegram: null });
    });
    expect(await chatOf(tTgOnly, patientId)).toBe('4165');

    // Xuddi shu bot bilan qayta yoqish — saqlanadi.
    await withTenant(tTgOnly, async (tx) => {
      await settings.update(ctx(tx, tTgOnly), { telegram: { botToken: '777:new-secret' } });
    });
    expect(await chatOf(tTgOnly, patientId)).toBe('4165');

    // Boshqa bot (id farqli) — tozalanadi.
    await withTenant(tTgOnly, async (tx) => {
      await settings.update(ctx(tx, tTgOnly), { telegram: { botToken: '888:other-bot' } });
    });
    expect(await chatOf(tTgOnly, patientId)).toBeNull();
  });

  test('xodim «Telegramni uzish»: chat tozalanadi + audit; begona tenant bemori 404', async () => {
    const { patientId } = await seedAppt(tBoth, branchBoth, '+998901000064', '4164');
    const audits: unknown[] = [];
    const svc2 = createPatientsService({
      audit: { record: async (_c: unknown, e: unknown) => void audits.push(e) } as never,
    });
    const r = await withTenant(tBoth, (tx) => svc2.unlinkTelegram(ctx(tx, tBoth), patientId));
    expect(r).not.toBeNull();
    expect(await chatOf(tBoth, patientId)).toBeNull();
    expect(audits).toHaveLength(1);
    // RLS: boshqa tenant kontekstidan topilmaydi
    const other = await withTenant(tTgOnly, (tx) =>
      svc2.unlinkTelegram(ctx(tx, tTgOnly), patientId),
    );
    expect(other).toBeNull();
  });
});
