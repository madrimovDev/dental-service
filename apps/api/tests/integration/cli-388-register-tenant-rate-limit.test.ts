/**
 * CLI-388 — POST /api/auth/register-tenant rate limiting (REAL Redis + DB).
 *
 * Isbotlaydi: bitta IP'dan `env.AUTH_REGISTER_RATE_LIMIT` marta muvaffaqiyatli
 * ro'yxatdan o'tishdan keyin (N+1)-chi so'rov 429 qaytaradi (loyiha xato
 * konverti `{ error: { code: 'rate_limited', message } }` + `Retry-After`
 * header) — va middleware handler'gacha yetib bormaydi (blocked so'rov
 * yangi tenant/user yaratmaydi).
 *
 * Talab: Postgres + Redis running, migration apply qilingan.
 * Ishga tushirish: `cd apps/api && bun test --env-file=../../.env cli-388`
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { OpenAPIHono } from '@hono/zod-openapi';
import { sql } from 'drizzle-orm';
import { db } from '../../src/db/client.ts';
import { env } from '../../src/lib/env.ts';
import { closeRateLimitRedis } from '../../src/lib/rate-limit.ts';
import { authRoutes } from '../../src/modules/auth/auth.routes.ts';

const app = new OpenAPIHono();
app.route('/api/auth', authRoutes({ db }));

const registerReq = (phone: string, ip: string) =>
  app.request('/api/auth/register-tenant', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': ip },
    body: JSON.stringify({
      tenantName: 'CLI-388 Test Clinic',
      ownerPhone: phone,
      ownerFullName: 'Rate Limit Test',
      ownerPassword: 'CorrectHorseBattery1',
      defaultLanguage: 'uz',
    }),
  });

const uniquePhone = (tag: string, i: number) => `+99891${tag}${String(i).padStart(3, '0')}`;

beforeAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
});

afterAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
  await closeRateLimitRedis();
});

describe('CLI-388 — register-tenant rate limiting', () => {
  test(`limit (${env.AUTH_REGISTER_RATE_LIMIT}) oshganda 429 + xato konverti`, async () => {
    const limit = env.AUTH_REGISTER_RATE_LIMIT;
    const ip = `10.88.0.${Math.floor(Math.random() * 250 + 1)}`;
    const tag = String(Math.floor(Math.random() * 900 + 100));

    // Limitgacha — har biri 201 (haqiqiy tenant yaratiladi, unique phone).
    for (let i = 0; i < limit; i++) {
      const res = await registerReq(uniquePhone(tag, i), ip);
      expect(res.status).toBe(201);
    }

    // Limitdan oshgani — 429 (yangi, hali ishlatilmagan telefon bilan ham).
    const blocked = await registerReq(uniquePhone(tag, limit), ip);
    expect(blocked.status).toBe(429);
    const body = (await blocked.json()) as { error?: { code: string; message: string } };
    expect(body.error?.code).toBe('rate_limited');
    expect(typeof body.error?.message).toBe('string');
    expect(blocked.headers.get('retry-after')).toBeTruthy();

    // Blocked so'rov handler'gacha yetib bormagan — DB'da bu telefon uchun user yo'q.
    // (users — platform-level, tenant_id yo'q; cli-227 ham shu jadvalni to'g'ridan
    // `db` orqali RLS'siz o'qiydi/yozadi, shuning uchun bu tekshiruv haqiqiy.)
    const found = await db.query.users.findFirst({
      where: (u, { eq }) => eq(u.phone, uniquePhone(tag, limit)),
    });
    expect(found).toBeUndefined();
  });

  test('different IP is not affected by another IP exhausting its limit', async () => {
    const otherIp = `10.88.1.${Math.floor(Math.random() * 250 + 1)}`;
    const tag = String(Math.floor(Math.random() * 900 + 100));
    const res = await registerReq(uniquePhone(`${tag}9`, 0), otherIp);
    expect(res.status).toBe(201);
  });
});
