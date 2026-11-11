/**
 * FU-15 — boshqa klinika taklifini qabul qilishdan oldin telefonni Telegram orqali
 * tasdiqlash. REAL HTTP (`createApp()`) + real DB (app roli, RLS) + bot funksiyalari
 * real DB'ga qarshi. Telegram API (`getMe`) — `fetch` mock.
 *
 * Tahdid: klinika A platformada hali yo'q telefon uchun hisob yaratadi (vaqtinchalik
 * parolni biladi); klinika B shu telefonni taklif qiladi → A shu hisob bilan kirib
 * B taklifini qabul qilardi. Endi qabul qilish `phone_verified_at` talab qiladi va
 * uni faqat shu raqam egasining O'Z Telegram kontakti o'rnatadi.
 *
 *   cd apps/api && bun test --env-file=../../.env --timeout 30000 tests/integration/fu15-phone-verification.test.ts
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { PERMISSIONS } from '@dental/core';
import {
  permissions as permissionsTable,
  phoneVerifications,
  rolePermissions,
  roles,
  tenantSettings,
  tenants,
  userAssignments,
  users,
} from '@dental/db-schema';
import { and, eq, inArray, isNull, sql } from 'drizzle-orm';

const secretPath = `${import.meta.dir}/.fu15-phone-verify-secret-test.txt`;
process.env.MESSAGING_SECRET_PATH = secretPath;

const { createApp } = await import('../../src/app.ts');
const { db } = await import('../../src/db/client.ts');
const { encryptSecret } = await import('../../src/lib/crypto.ts');
const { signAccess } = await import('../../src/lib/jwt.ts');
const { hashPassword } = await import('../../src/lib/password.ts');
const { closeRateLimitRedis } = await import('../../src/lib/rate-limit.ts');
const {
  bindPhoneVerification,
  hashVerificationToken,
  parsePhoneVerifyPayload,
  verifyPhoneByContact,
} = await import('../../src/lib/telegram/phone-verify.ts');

const IP = `10.15.0.${Math.floor(Math.random() * 250 + 1)}`;
const PW = 'StaffPassword123!';
const VICTIM_PHONE = '+998900015001';
const BOT_TOKEN_B = '1500150015:fu15-bot-token-b-xxxxxxxxxxxx';
const BOT_TOKEN_D = '1500150016:fu15-bot-token-d-broken-xxxxxx';

// ─── Telegram getMe mock ────────────────────────────────────────────────────
const realFetch = globalThis.fetch;
const telegramCalls: string[] = [];
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  if (url.includes('api.telegram.org')) {
    telegramCalls.push(url);
    if (url.includes(BOT_TOKEN_B)) {
      return new Response(
        JSON.stringify({
          ok: true,
          result: { id: 1, is_bot: true, username: 'fu15_clinic_b_bot' },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }
    // D klinika boti — token bekor qilingan (Telegram 401).
    return new Response(JSON.stringify({ ok: false, error_code: 401 }), { status: 401 });
  }
  return realFetch(input, init);
}) as typeof fetch;

let tenantA: string; // hujumchi klinika (hisobni yaratgan)
let tenantB: string; // bot sozlangan, taklif qilgan
let tenantC: string; // bot sozlanmagan
let tenantD: string; // bot tokeni bor, lekin ishlamaydi
let ownerA: string;
let victimId: string;
let roleA: string;
let invB: string;
let invC: string;
let invD: string;
let victimToken: string;
let ownerAToken: string;

const call = (token: string | null, method: string, path: string, body?: unknown) =>
  createApp().request(`/api${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      'x-forwarded-for': IP,
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

const withTx = <T>(
  tenantId: string,
  fn: (tx: Parameters<Parameters<typeof db.transaction>[0]>[0]) => Promise<T>,
) =>
  db.transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
    return fn(tx);
  });

const errCode = async (res: Response) =>
  ((await res.json()) as { error: { code: string } }).error.code;

const mkUser = async (phone: string, fullName: string, password = PW) => {
  const [u] = await db
    .insert(users)
    .values({ phone, passwordHash: await hashPassword(password), fullName })
    .returning({ id: users.id });
  if (!u) throw new Error('user insert failed');
  return u.id;
};

const mkTenant = async (slug: string, owner: string) => {
  const [t] = await db
    .insert(tenants)
    .values({ name: `Clinic ${slug}`, slug, ownerUserId: owner })
    .returning({ id: tenants.id });
  if (!t) throw new Error('tenant insert failed');
  return t.id;
};

const seedRole = (tenantId: string, name: string, codes: string[]) =>
  withTx(tenantId, async (tx) => {
    const [r] = await tx.insert(roles).values({ tenantId, name }).returning({ id: roles.id });
    if (!r) throw new Error('role insert failed');
    const perms = await tx
      .select({ id: permissionsTable.id })
      .from(permissionsTable)
      .where(inArray(permissionsTable.code, codes));
    await tx
      .insert(rolePermissions)
      .values(perms.map((p) => ({ roleId: r.id, permissionId: p.id })));
    return r.id;
  });

const invite = (tenantId: string, roleId: string) =>
  withTx(tenantId, async (tx) => {
    const [a] = await tx
      .insert(userAssignments)
      .values({ userId: victimId, tenantId, roleId, isActive: true, acceptedAt: null })
      .returning({ id: userAssignments.id });
    if (!a) throw new Error('assignment insert failed');
    return a.id;
  });

const setBotToken = (tenantId: string, token: string) =>
  withTx(tenantId, (tx) =>
    tx
      .insert(tenantSettings)
      .values({
        tenantId,
        integrationSettings: { telegram: { botTokenEnc: encryptSecret(token) } },
      })
      .onConflictDoNothing(),
  );

const phoneVerifiedAt = async () => {
  const [u] = await db
    .select({ v: users.phoneVerifiedAt })
    .from(users)
    .where(eq(users.id, victimId));
  return u?.v ?? null;
};

const acceptedAt = async (tenantId: string, assignmentId: string) => {
  const [a] = await withTx(tenantId, (tx) =>
    tx
      .select({ v: userAssignments.acceptedAt })
      .from(userAssignments)
      .where(eq(userAssignments.id, assignmentId)),
  );
  return a?.v ?? null;
};

type StartData = { alreadyVerified: boolean; deepLink: string | null; expiresAt: string | null };
const start = async (invitationId: string, token = victimToken) =>
  call(token, 'POST', '/auth/phone-verification/start', { invitationId });

const startOk = async (invitationId: string): Promise<string> => {
  const res = await start(invitationId);
  expect(res.status).toBe(200);
  const data = ((await res.json()) as { data: StartData }).data;
  expect(data.alreadyVerified).toBe(false);
  const link = data.deepLink ?? '';
  expect(link.startsWith('https://t.me/fu15_clinic_b_bot?start=pv_')).toBe(true);
  const token = parsePhoneVerifyPayload(new URL(link).searchParams.get('start') ?? undefined);
  if (!token) throw new Error('deepLink token parse failed');
  return token;
};

const meVerified = async () => {
  const res = await call(victimToken, 'GET', '/auth/me');
  expect(res.status).toBe(200);
  return ((await res.json()) as { data: { phoneVerified: boolean } }).data.phoneVerified;
};

beforeAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
  for (const p of PERMISSIONS) {
    await db
      .insert(permissionsTable)
      .values({
        code: p.code,
        category: p.category,
        descriptionUz: p.descriptionUz,
        descriptionRu: p.descriptionRu,
      })
      .onConflictDoNothing();
  }

  ownerA = await mkUser('+998900015101', 'OwnerA', 'OwnerPassword123!');
  const ownerB = await mkUser('+998900015102', 'OwnerB', 'OwnerPassword123!');
  const ownerC = await mkUser('+998900015103', 'OwnerC', 'OwnerPassword123!');
  const ownerD = await mkUser('+998900015104', 'OwnerD', 'OwnerPassword123!');
  victimId = await mkUser(VICTIM_PHONE, 'Victim');

  tenantA = await mkTenant('fu15-a', ownerA);
  tenantB = await mkTenant('fu15-b', ownerB);
  tenantC = await mkTenant('fu15-c', ownerC);
  tenantD = await mkTenant('fu15-d', ownerD);

  // Hisob A klinikasida yaratilgan va qabul qilingan (A o'z klinikasida ishlay oladi).
  roleA = await seedRole(tenantA, 'A Staff', ['patient.view']);
  await withTx(tenantA, (tx) =>
    tx
      .insert(userAssignments)
      .values({ userId: victimId, tenantId: tenantA, roleId: roleA, acceptedAt: new Date() }),
  );
  invB = await invite(tenantB, await seedRole(tenantB, 'B Doctor', ['patient.view']));
  invC = await invite(tenantC, await seedRole(tenantC, 'C Doctor', ['patient.view']));
  invD = await invite(tenantD, await seedRole(tenantD, 'D Doctor', ['patient.view']));
  await setBotToken(tenantB, BOT_TOKEN_B);
  await setBotToken(tenantD, BOT_TOKEN_D);

  victimToken = (
    await signAccess({
      sub: victimId,
      atid: tenantA,
      abid: null,
      perms: ['patient.view'],
      roleKey: null,
      lang: 'uz',
    })
  ).token;
  ownerAToken = (
    await signAccess({
      sub: ownerA,
      atid: tenantA,
      abid: null,
      perms: ['@owner'],
      roleKey: null,
      lang: 'uz',
    })
  ).token;
});

afterAll(async () => {
  globalThis.fetch = realFetch;
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
  await closeRateLimitRedis();
  await Bun.file(secretPath)
    .delete()
    .catch(() => {});
});

describe('FU-15 — taklifni qabul qilish telefon tasdigʻini talab qiladi', () => {
  test('tasdiqlanmagan → accept 403 phone.verification_required, tayinlov kutilmoqda', async () => {
    expect(await meVerified()).toBe(false);
    const res = await call(victimToken, 'POST', `/auth/invitations/${invB}/accept`);
    expect(res.status).toBe(403);
    expect(await errCode(res)).toBe('phone.verification_required');
    expect(await acceptedAt(tenantB, invB)).toBeNull();
  });

  test('begona foydalanuvchi boshqaning taklifini qabul qila olmaydi → 404', async () => {
    // Boshqa foydalanuvchining tokeni bilan begona taklif → 404 (mavjudligi oshkor emas).
    const res = await call(ownerAToken, 'POST', `/auth/invitations/${invB}/accept`);
    expect(res.status).toBe(404);
  });

  test('bot sozlanmagan klinika → start 409 phone.verification_unavailable (yopiq)', async () => {
    const res = await start(invC);
    expect(res.status).toBe(409);
    expect(await errCode(res)).toBe('phone.verification_unavailable');
    const rows = await db
      .select()
      .from(phoneVerifications)
      .where(eq(phoneVerifications.tenantId, tenantC));
    expect(rows).toHaveLength(0);
  });

  test('bot tokeni ishlamaydi (getMe 401) → 409, token yaratilmaydi', async () => {
    const res = await start(invD);
    expect(res.status).toBe(409);
    expect(await errCode(res)).toBe('phone.verification_unavailable');
    expect(telegramCalls.some((u) => u.includes(BOT_TOKEN_D))).toBe(true);
    const rows = await db
      .select()
      .from(phoneVerifications)
      .where(eq(phoneVerifications.tenantId, tenantD));
    expect(rows).toHaveLength(0);
  });

  test('begona taklif id → start 404', async () => {
    const res = await start(invB, ownerAToken);
    expect(res.status).toBe(404);
  });

  test('start → deepLink; bazada faqat SHA-256 xesh, muddat ~15 daqiqa', async () => {
    const token = await startOk(invB);
    const [row] = await db
      .select()
      .from(phoneVerifications)
      .where(eq(phoneVerifications.tokenHash, await hashVerificationToken(token)));
    expect(row).toBeDefined();
    expect(row?.userId).toBe(victimId);
    expect(row?.tenantId).toBe(tenantB);
    const all = await db.select().from(phoneVerifications);
    expect(all.some((r) => r.tokenHash === token)).toBe(false);
    const ttl = (row?.expiresAt.getTime() ?? 0) - Date.now();
    expect(ttl).toBeGreaterThan(14 * 60_000);
    expect(ttl).toBeLessThanOrEqual(15 * 60_000 + 1000);
  });

  test("boshqa klinika boti token'ni bog'lay olmaydi; noma'lum token rad", async () => {
    const token = await startOk(invB);
    expect(await bindPhoneVerification(db, { tenantId: tenantA, token, chatId: '7001' })).toBe(
      'invalid',
    );
    expect(
      await bindPhoneVerification(db, { tenantId: tenantB, token: 'nope', chatId: '7001' }),
    ).toBe('invalid');
  });

  test("begona Telegram foydalanuvchisining kontakti → rad, hech narsa o'zgarmaydi", async () => {
    const token = await startOk(invB);
    expect(await bindPhoneVerification(db, { tenantId: tenantB, token, chatId: '7002' })).toBe(
      'bound',
    );
    // Hujumchi qurbonning kontaktini (manzillar kitobidan) yuboradi: contact.user_id ≠ from.id.
    expect(
      await verifyPhoneByContact(db, {
        tenantId: tenantB,
        chatId: '7002',
        contactUserId: 99_999,
        fromId: 7002,
        phone: VICTIM_PHONE,
      }),
    ).toBe('not_own_contact');
    // contact.user_id umuman yo'q (telefon raqami qo'lda kiritilgan kontakt).
    expect(
      await verifyPhoneByContact(db, {
        tenantId: tenantB,
        chatId: '7002',
        contactUserId: undefined,
        fromId: 7002,
        phone: VICTIM_PHONE,
      }),
    ).toBe('not_own_contact');
    expect(await phoneVerifiedAt()).toBeNull();
  });

  test("o'z kontakti, lekin boshqa raqam → rad, token yoqiladi", async () => {
    const token = await startOk(invB);
    expect(await bindPhoneVerification(db, { tenantId: tenantB, token, chatId: '7003' })).toBe(
      'bound',
    );
    expect(
      await verifyPhoneByContact(db, {
        tenantId: tenantB,
        chatId: '7003',
        contactUserId: 7003,
        fromId: 7003,
        phone: '+998909999999',
      }),
    ).toBe('phone_mismatch');
    expect(await phoneVerifiedAt()).toBeNull();
    // Shu token endi qayta ishlatilmaydi.
    expect(
      await verifyPhoneByContact(db, {
        tenantId: tenantB,
        chatId: '7003',
        contactUserId: 7003,
        fromId: 7003,
        phone: VICTIM_PHONE,
      }),
    ).toBe('expired');
    expect(await phoneVerifiedAt()).toBeNull();
  });

  test('muddati o‘tgan token → bind rad; verify rad', async () => {
    const token = await startOk(invB);
    await db
      .update(phoneVerifications)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(phoneVerifications.tokenHash, await hashVerificationToken(token)));
    expect(await bindPhoneVerification(db, { tenantId: tenantB, token, chatId: '7004' })).toBe(
      'invalid',
    );
    expect(
      await verifyPhoneByContact(db, {
        tenantId: tenantB,
        chatId: '7004',
        contactUserId: 7004,
        fromId: 7004,
        phone: VICTIM_PHONE,
      }),
    ).toBe('expired');
    expect(await phoneVerifiedAt()).toBeNull();
  });

  test("boshqa chat'ga bog'langan token ikkinchi chat'ga bog'lanmaydi", async () => {
    const token = await startOk(invB);
    expect(await bindPhoneVerification(db, { tenantId: tenantB, token, chatId: '7005' })).toBe(
      'bound',
    );
    expect(await bindPhoneVerification(db, { tenantId: tenantB, token, chatId: '7006' })).toBe(
      'invalid',
    );
  });

  test("to'g'ri oqim: o'z kontakti + mos raqam (mahalliy format) → tasdiqlandi; token qayta ishlamaydi; accept 200", async () => {
    const token = await startOk(invB);
    expect(await bindPhoneVerification(db, { tenantId: tenantB, token, chatId: '7007' })).toBe(
      'bound',
    );
    expect(
      await verifyPhoneByContact(db, {
        tenantId: tenantB,
        chatId: '7007',
        contactUserId: 7007,
        fromId: 7007,
        // Telegram ba'zan `+`siz qaytaradi — normalizePhone kanonik shaklga keltiradi.
        phone: '998900015001',
      }),
    ).toBe('verified');
    expect(await phoneVerifiedAt()).not.toBeNull();
    expect(await meVerified()).toBe(true);

    // Qayta ishlatish → rad (consumed).
    expect(await bindPhoneVerification(db, { tenantId: tenantB, token, chatId: '7007' })).toBe(
      'invalid',
    );
    // Foydalanuvchining qolgan kutilayotgan tokenlari ham yopiladi.
    const open = await db
      .select()
      .from(phoneVerifications)
      .where(and(eq(phoneVerifications.userId, victimId), isNull(phoneVerifications.consumedAt)));
    expect(open).toHaveLength(0);

    // Tasdiqlangan foydalanuvchida start yangi token yaratmaydi.
    const again = await start(invB);
    expect(again.status).toBe(200);
    expect(((await again.json()) as { data: StartData }).data.alreadyVerified).toBe(true);

    const res = await call(victimToken, 'POST', `/auth/invitations/${invB}/accept`);
    expect(res.status).toBe(200);
    expect(await acceptedAt(tenantB, invB)).not.toBeNull();
  });

  test('owner parolni tiklasa → phone_verified_at NULL, yangi taklif yana tasdiq talab qiladi', async () => {
    const res = await call(ownerAToken, 'POST', `/users/${victimId}/reset-password`);
    expect(res.status).toBe(200);
    expect(await phoneVerifiedAt()).toBeNull();

    // Yangi taklif (B klinikasining boshqa roli) — qabul qilish yana 403.
    const inv2 = await invite(tenantB, await seedRole(tenantB, 'B Nurse', ['patient.view']));
    const acc = await call(victimToken, 'POST', `/auth/invitations/${inv2}/accept`);
    expect(acc.status).toBe(403);
    expect(await errCode(acc)).toBe('phone.verification_required');
    expect(await acceptedAt(tenantB, inv2)).toBeNull();
  });
});
