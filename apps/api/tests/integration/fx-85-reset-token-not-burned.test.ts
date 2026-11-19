/**
 * FX-85 — vendor owner parol tiklashi (`POST /api/reset-owner-password`,
 * REAL DB): bir martalik tiklash tokeni (Supervisor `/v1/verify-reset` —
 * atomik consume) lokal tiklash amalga oshmaydigan holatda SARFLANMAYDI.
 *
 * Bug: `verifyReset()` (tokenni Supervisor'da yoqadi) tenant mavjudligi
 * tekshirilishidan OLDIN chaqirilardi — lokal bazada tenant bo'lmasa
 * `reset.no_tenant` qaytar edi, lekin token allaqachon yonib ketgan bo'lardi
 * (vendor yangi token berishi kerak edi).
 *
 * Isbotlaydi:
 *  1. Tenant yo'q → 400 `reset.no_tenant` va `verifyReset` CHAQIRILMAYDI.
 *  2. Oddiy holat — `verifyReset` bir marta chaqiriladi, parol o'zgaradi.
 *
 * `verifyReset` spy in'ektsiya qilinadi (Supervisor'ga tarmoq so'rovi yo'q);
 * tenant/owner — real Postgres.
 *
 * Ishga tushirish: `cd apps/api && bun test --env-file=../../.env --timeout 30000 tests/integration/fx-85-reset-token-not-burned.test.ts`
 */

import { afterAll, beforeEach, describe, expect, test } from 'bun:test';
import { tenants, users } from '@dental/db-schema';
import { eq, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { db } from '../../src/db/client.ts';
import { hashPassword, verifyPassword } from '../../src/lib/password.ts';
import { closeRateLimitRedis } from '../../src/lib/rate-limit.ts';
import { resetOwnerPasswordRoutes } from '../../src/routes/reset-owner-password.ts';

const NEW_PASSWORD = 'OwnerBrandNew789!';

let ipSeq = 0;
const nextIp = () => `10.185.${Math.floor(Math.random() * 200)}.${++ipSeq}`;

const makeSpy = () => {
  const calls: string[] = [];
  const verifyReset = async (token: string) => {
    calls.push(token);
    return { ok: true };
  };
  return { calls, verifyReset };
};

const post = (verifyReset: (t: string) => Promise<{ ok: boolean }>) => {
  const app = new Hono();
  app.route('/api/reset-owner-password', resetOwnerPasswordRoutes({ verifyReset }));
  return app.request('/api/reset-owner-password', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-real-ip': nextIp() },
    body: JSON.stringify({ resetToken: 'AAAAA-BBBBB-CCCCC', newPassword: NEW_PASSWORD }),
  });
};

beforeEach(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
});

afterAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
  await closeRateLimitRedis();
});

describe('FX-85 reset token is not consumed when local reset cannot proceed', () => {
  test('tenant yo‘q → reset.no_tenant, verifyReset chaqirilmaydi', async () => {
    const spy = makeSpy();
    const res = await post(spy.verifyReset);
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error?: { code: string } };
    expect(json.error?.code).toBe('reset.no_tenant');
    expect(spy.calls.length).toBe(0);
  });

  test('oddiy holat — verifyReset bir marta, parol yangilanadi', async () => {
    const [owner] = await db
      .insert(users)
      .values({
        phone: '+998900085002',
        passwordHash: await hashPassword('OwnerTempPass123!'),
        fullName: 'Owner FX85 ok',
      })
      .returning({ id: users.id });
    if (!owner) throw new Error('user insert failed');
    await db
      .insert(tenants)
      .values({ name: 'FX-85 Clinic OK', slug: 'fx-85-clinic-ok', ownerUserId: owner.id });

    const spy = makeSpy();
    const res = await post(spy.verifyReset);
    expect(res.status).toBe(200);
    expect(spy.calls.length).toBe(1);
    const [u] = await db.select().from(users).where(eq(users.id, owner.id));
    expect(await verifyPassword(NEW_PASSWORD, u?.passwordHash ?? '')).toBe(true);
  });
});
