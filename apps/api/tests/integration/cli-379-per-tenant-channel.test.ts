/**
 * CLI-379/400 — recall worker per-tenant kanal tanlovi (Telegram > Eskiz SMS > NoOp)
 * real DB integratsiya testi. `resolveTenantChannel` (apps/api/src/lib/tenant-channel.ts)
 * `tenant_settings.integration_settings` (CLI-379/400 encrypt-on-write) + bemor
 * `telegram_chat_id` (Task 2) asosida `processRecallScan` ichida har recall uchun
 * ALOHIDA kanal tanlaydi — avvalgi bitta module-level `deps.sms` o'rniga.
 *
 * Determinism: `MESSAGING_SECRET_PATH` pattern — `cli-379-tenant-settings-creds.test.ts`
 * bilan bir xil (env.MESSAGING_SECRET import-vaqtidagi qotib qolishidan qochish uchun,
 * batafsil izoh o'sha faylda).
 *
 * Telegram/Eskiz kanallar HAQIQIY `fetch()` chaqiradi (packages/notifications); bu
 * yerda global `fetch` mock qilinadi (`telegram.test.ts` patterni) — tarmoqqa chiqilmaydi.
 * `RecallScanDeps.sms` — faqat "hech qanday tenant credential sozlanmagan" holat uchun
 * test/legacy fallback spy (`resolveTenantChannel`ning o'zi bunday fallback'ni bilmaydi,
 * sof funksiya — `source:'none'` qaytaradi, worker keyin `deps.sms`ga tushadi).
 *
 * Bitta faylni ALOHIDA ishlating (TRUNCATE race):
 *   cd apps/api && bun test tests/integration/cli-379-per-tenant-channel.test.ts --env-file=<path>
 */
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { existsSync, rmSync } from 'node:fs';
import { patients, recallLogs, recalls, tenantSettings, tenants, users } from '@dental/db-schema';
import { eq, sql } from 'drizzle-orm';
import { createAdminDb, db } from '../../src/db/client.ts';
import { withTenant } from '../../src/db/scoped.ts';
import { encryptSecret } from '../../src/lib/crypto.ts';
import { processRecallScan } from '../../src/lib/recall-worker.ts';

const secretPath = `${import.meta.dir}/.cli-379-per-tenant-channel-secret-test.txt`;
process.env.MESSAGING_SECRET_PATH = secretPath;

const admin = createAdminDb();

// Global fetch mock — Telegram/Eskiz kanallar haqiqiy fetch() chaqiradi; bu yerda
// tarmoqqa chiqmasdan javob qaytariladi + har chaqiruv kuzatiladi (url + body).
type FetchCall = { url: string; body: string };
let fetchCalls: FetchCall[] = [];
const realFetch = globalThis.fetch;

beforeAll(() => {
  globalThis.fetch = (async (url: unknown, init?: RequestInit) => {
    const u = String(url);
    const body = typeof init?.body === 'string' ? init.body : '';
    fetchCalls.push({ url: u, body });
    if (u.includes('api.telegram.org')) {
      return new Response(JSON.stringify({ result: { message_id: 99 } }), { status: 200 });
    }
    if (u.includes('/auth/login')) {
      return new Response(JSON.stringify({ data: { token: 'eskiz-tok' } }), { status: 200 });
    }
    if (u.includes('/message/sms/send')) {
      return new Response(JSON.stringify({ id: 'eskiz-msg-1' }), { status: 200 });
    }
    return new Response('not found', { status: 404 });
  }) as unknown as typeof fetch;
});

afterAll(() => {
  globalThis.fetch = realFetch;
});

// Tracking spy — faqat "tenant hech narsa sozlamagan" (NoOp) holatda ishlatiladi.
let spySent: { to: string; text: string }[] = [];
const spySms = {
  send: async (to: string, msg: { text: string }) => {
    spySent.push({ to, text: msg.text });
    return { ok: true as const, providerId: 'spy-1' };
  },
};

let ownerId: string;
let tTelegram: string;
let tSms: string;
let tNone: string;

const seedTenant = async (slug: string, name: string) => {
  const [t] = await db
    .insert(tenants)
    .values({ name, slug, ownerUserId: ownerId, defaultLanguage: 'uz' })
    .returning({ id: tenants.id });
  return t!.id;
};

const seedRecall = async (
  tenantId: string,
  opts: { phone: string; telegramChatId?: string | null },
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
    const [r] = await tx
      .insert(recalls)
      .values({
        tenantId,
        patientId: p!.id,
        reason: 'preventive',
        status: 'pending',
        source: 'scheduler',
        dueDate: '2020-01-01', // o'tmish — har doim due.
      })
      .returning({ id: recalls.id });
    return r!.id;
  });

// Fixed `now` = 07:00 UTC = 12:00 Asia/Tashkent — recallSendHourLocal (default 10)
// gate'idan o'tadi (recall-worker.test.ts bilan bir xil pattern).
const now = new Date('2026-06-21T07:00:00Z');

beforeAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
  const [owner] = await db
    .insert(users)
    .values({ phone: '+998900000379', passwordHash: 'x', fullName: 'Owner379' })
    .returning({ id: users.id });
  ownerId = owner!.id;
  tTelegram = await seedTenant('cli379-tg', 'Telegram Clinic');
  tSms = await seedTenant('cli379-sms', 'SMS Clinic');
  tNone = await seedTenant('cli379-none', 'Unconfigured Clinic');

  // tTelegram — Telegram bot token sozlangan (encrypt-on-write, CLI-379/400).
  await withTenant(tTelegram, (tx) =>
    tx.insert(tenantSettings).values({
      tenantId: tTelegram,
      integrationSettings: { telegram: { botTokenEnc: encryptSecret('tg-real-token') } },
    }),
  );
  // tSms — faqat Eskiz SMS sozlangan (telegram yo'q).
  await withTenant(tSms, (tx) =>
    tx.insert(tenantSettings).values({
      tenantId: tSms,
      integrationSettings: {
        sms: {
          eskizEmailEnc: encryptSecret('clinic@eskiz.uz'),
          eskizPasswordEnc: encryptSecret('S3cr3t'),
        },
      },
    }),
  );
  // tNone — tenant_settings row umuman yo'q (integrationSettings null, real creds sozlanmagan).
});

afterAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
  await admin.client.end({ timeout: 5 });
  if (existsSync(secretPath)) rmSync(secretPath);
});

beforeEach(async () => {
  fetchCalls = [];
  spySent = [];
  // Recall'larni barcha tenant'lardan tozalaymiz (admin conn — RLS bypass).
  await admin.db.delete(recallLogs);
  await admin.db.delete(recalls);
});

describe('CLI-379/400 per-tenant channel resolution (recall worker)', () => {
  test('Telegram sozlangan + bemor chat_id bor → Telegram tanlanadi (SMS/spy ishlatilmaydi)', async () => {
    const rId = await seedRecall(tTelegram, { phone: '+998901110001', telegramChatId: '555111' });

    const res = await processRecallScan({ adminDb: admin.db, sms: spySms, withTenant, now });
    expect(res.sent).toBe(1);

    const tgCalls = fetchCalls.filter((c) => c.url.includes('api.telegram.org'));
    expect(tgCalls).toHaveLength(1);
    expect(tgCalls[0]!.url).toContain('tg-real-token');
    expect(tgCalls[0]!.body).toContain('"chat_id":"555111"');
    // Eskiz'ga chiqilmagan + test fallback spy ishlatilmagan.
    expect(fetchCalls.some((c) => c.url.includes('notify.eskiz.uz'))).toBe(false);
    expect(spySent).toHaveLength(0);

    const [row] = await withTenant(tTelegram, (tx) =>
      tx.select({ status: recalls.status }).from(recalls).where(eq(recalls.id, rId)),
    );
    expect(row!.status).toBe('contacted');
  });

  test('faqat SMS(Eskiz) sozlangan, chat_id yo‘q → Eskiz tanlanadi', async () => {
    const rId = await seedRecall(tSms, { phone: '+998902220002' });

    const res = await processRecallScan({ adminDb: admin.db, sms: spySms, withTenant, now });
    expect(res.sent).toBe(1);

    expect(fetchCalls.some((c) => c.url.includes('api.telegram.org'))).toBe(false);
    const eskizCalls = fetchCalls.filter((c) => c.url.includes('notify.eskiz.uz'));
    expect(eskizCalls.some((c) => c.url.includes('/auth/login'))).toBe(true);
    const sendCall = eskizCalls.find((c) => c.url.includes('/message/sms/send'));
    expect(sendCall).toBeDefined();
    expect(sendCall!.body).toContain('998902220002');
    expect(spySent).toHaveLength(0);

    const [row] = await withTenant(tSms, (tx) =>
      tx.select({ status: recalls.status }).from(recalls).where(eq(recalls.id, rId)),
    );
    expect(row!.status).toBe('contacted');
  });

  test('hech narsa sozlanmagan → NoOp (test fallback spy send oladi)', async () => {
    const rId = await seedRecall(tNone, { phone: '+998903330003' });

    const res = await processRecallScan({ adminDb: admin.db, sms: spySms, withTenant, now });
    expect(res.sent).toBe(1);

    expect(fetchCalls).toHaveLength(0);
    expect(spySent).toHaveLength(1);
    expect(spySent[0]!.to).toBe('+998903330003');

    const [row] = await withTenant(tNone, (tx) =>
      tx.select({ status: recalls.status }).from(recalls).where(eq(recalls.id, rId)),
    );
    expect(row!.status).toBe('contacted');
  });
});
