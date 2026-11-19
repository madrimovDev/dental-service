/**
 * FX-05 (LA-19) — vendor-vositachiligidagi owner parol tiklashi
 * (`POST /api/reset-owner-password`, REAL DB + real auth HTTP).
 *
 * Isbotlaydi:
 *  1. Tiklashdan OLDIN berilgan owner refresh token'i tiklashdan keyin
 *     `/api/auth/refresh`da 401 `auth.invalid_refresh` (begona qurilmadagi
 *     sessiya yashamaydi) — DB'da owner'ning faol refresh token'i qolmaydi.
 *  2. `must_change_password` tozalanadi — owner hozirgina qo'ygan parol bilan
 *     kirganda `mustChangePassword: false` (yana /change-password-required'ga
 *     tushmaydi).
 *  3. Boshqa foydalanuvchining refresh token'i TEGILMAYDI.
 *
 * `verifyReset` fake in'ektsiya qilinadi (Supervisor'ga tarmoq so'rovi yo'q);
 * login/refresh esa haqiqiy `createApp()` orqali.
 *
 * Ishga tushirish: `cd apps/api && bun test --env-file=../../.env --timeout 30000 tests/integration/fx-05-owner-reset-revoke.test.ts`
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { refreshTokens, tenants, users } from '@dental/db-schema';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { createApp } from '../../src/app.ts';
import { db } from '../../src/db/client.ts';
import { hashPassword } from '../../src/lib/password.ts';
import { closeRateLimitRedis } from '../../src/lib/rate-limit.ts';
import { resetOwnerPasswordRoutes } from '../../src/routes/reset-owner-password.ts';

const OWNER_PHONE = '+998900050501';
const OTHER_PHONE = '+998900050502';
const OWNER_TEMP_PASSWORD = 'OwnerTempPass123!';
const OTHER_PASSWORD = 'OtherUserPass456!';
const NEW_PASSWORD = 'OwnerBrandNew789!';

let ownerId: string;
let otherId: string;

let ipSeq = 0;
const nextIp = () => `10.205.${Math.floor(Math.random() * 200)}.${++ipSeq}`;

const api = (method: string, path: string, body?: unknown) =>
  createApp().request(`/api${path}`, {
    method,
    headers: { 'content-type': 'application/json', 'x-real-ip': nextIp() },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

const resetApp = () => {
  const app = new Hono();
  app.route(
    '/api/reset-owner-password',
    resetOwnerPasswordRoutes({ verifyReset: async () => ({ ok: true }) }),
  );
  return app;
};

const login = async (phone: string, password: string) => {
  const res = await api('POST', '/auth/login', { phone, password });
  const json = (await res.json()) as {
    data?: { refreshToken: string; mustChangePassword: boolean };
  };
  return { res, data: json.data };
};

beforeAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
  const [owner] = await db
    .insert(users)
    .values({
      phone: OWNER_PHONE,
      passwordHash: await hashPassword(OWNER_TEMP_PASSWORD),
      fullName: 'Owner FX05',
      // Provisioning'dan keyingi vaqtinchalik parol holati.
      mustChangePassword: true,
    })
    .returning({ id: users.id });
  const [other] = await db
    .insert(users)
    .values({
      phone: OTHER_PHONE,
      passwordHash: await hashPassword(OTHER_PASSWORD),
      fullName: 'Other FX05',
    })
    .returning({ id: users.id });
  if (!owner || !other) throw new Error('user insert failed');
  ownerId = owner.id;
  otherId = other.id;
  await db
    .insert(tenants)
    .values({ name: 'FX-05 Clinic', slug: 'fx-05-clinic', ownerUserId: ownerId });
});

afterAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
  await closeRateLimitRedis();
});

describe('FX-05 vendor owner reset revokes sessions + clears must_change_password', () => {
  test('eski refresh token 401, mustChangePassword false, boshqa user sessiyasi tegilmaydi', async () => {
    const pre = await login(OWNER_PHONE, OWNER_TEMP_PASSWORD);
    expect(pre.res.status).toBe(200);
    expect(pre.data?.mustChangePassword).toBe(true);
    const staleRefresh = pre.data?.refreshToken ?? '';
    expect(staleRefresh.length).toBeGreaterThan(0);

    const otherPre = await login(OTHER_PHONE, OTHER_PASSWORD);
    expect(otherPre.res.status).toBe(200);

    const reset = await resetApp().request('/api/reset-owner-password', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-real-ip': nextIp() },
      body: JSON.stringify({ resetToken: 'AAAAA-BBBBB-CCCCC', newPassword: NEW_PASSWORD }),
    });
    expect(reset.status).toBe(200);

    // 1. Eski refresh token endi ishlamaydi.
    const refreshed = await api('POST', '/auth/refresh', { refreshToken: staleRefresh });
    expect(refreshed.status).toBe(401);
    const live = await db
      .select({ id: refreshTokens.id })
      .from(refreshTokens)
      .where(and(eq(refreshTokens.userId, ownerId), isNull(refreshTokens.revokedAt)));
    expect(live.length).toBe(0);

    // 2. must_change_password tozalangan.
    const [u] = await db.select().from(users).where(eq(users.id, ownerId));
    expect(u?.mustChangePassword).toBe(false);
    const post = await login(OWNER_PHONE, NEW_PASSWORD);
    expect(post.res.status).toBe(200);
    expect(post.data?.mustChangePassword).toBe(false);

    // 3. Boshqa foydalanuvchining sessiyasi saqlangan.
    const otherLive = await db
      .select({ id: refreshTokens.id })
      .from(refreshTokens)
      .where(and(eq(refreshTokens.userId, otherId), isNull(refreshTokens.revokedAt)));
    expect(otherLive.length).toBeGreaterThan(0);
  });
});
