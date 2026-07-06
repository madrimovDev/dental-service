/**
 * Desktop instance'da o'z-o'zini ro'yxatdan o'tkazish (POST /register-tenant)
 * BLOKLANGAN bo'lishi kerak — Local Desktop bitta-klinika litsenziya modelida
 * tenant faqat Supervisor tomonidan oldindan yaratiladi (`POST
 * /v1/admin/clinics`); ilova ichida yangi klinika ro'yxatdan o'tkazish shu
 * modelga zid.
 *
 * Signal — `requireModuleInDesktop` bilan bir xil: `DENTAL_LOCAL_DESKTOP ===
 * 'true'` (license-middleware.ts pretsedenti), cloud/dev/CI'da hech qanday
 * o'zgarish yo'q (default no-op).
 *
 * Ishga tushirish: `cd apps/api && bun test --env-file=../../.env desktop-register-tenant-block`
 */

import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';
import { OpenAPIHono } from '@hono/zod-openapi';
import { sql } from 'drizzle-orm';
import { db } from '../../src/db/client.ts';
import { closeRateLimitRedis } from '../../src/lib/rate-limit.ts';
import { authRoutes } from '../../src/modules/auth/auth.routes.ts';

const app = new OpenAPIHono();
app.route('/api/auth', authRoutes({ db }));

const registerReq = (phone: string, ip: string) =>
  app.request('/api/auth/register-tenant', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': ip },
    body: JSON.stringify({
      tenantName: 'Desktop Block Test Clinic',
      ownerPhone: phone,
      ownerFullName: 'Desktop Block Test',
      ownerPassword: 'CorrectHorseBattery1',
      defaultLanguage: 'uz',
    }),
  });

const uniquePhone = (tag: string, i: number) => `+99892${tag}${String(i).padStart(3, '0')}`;

const originalFlag = process.env.DENTAL_LOCAL_DESKTOP;

beforeAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
});

afterEach(() => {
  if (originalFlag === undefined) {
    delete process.env.DENTAL_LOCAL_DESKTOP;
  } else {
    process.env.DENTAL_LOCAL_DESKTOP = originalFlag;
  }
});

afterAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
  await closeRateLimitRedis();
});

describe('POST /register-tenant — desktop gate', () => {
  test("DENTAL_LOCAL_DESKTOP='true' bo'lsa — 403 va tenant/user yaratilmaydi", async () => {
    process.env.DENTAL_LOCAL_DESKTOP = 'true';
    const tag = String(Math.floor(Math.random() * 900 + 100));
    const phone = uniquePhone(tag, 0);
    const ip = `10.89.0.${Math.floor(Math.random() * 250 + 1)}`;

    const res = await registerReq(phone, ip);
    expect(res.status).toBe(403);
    const body = (await res.json()) as { error?: { code: string; message: string } };
    expect(body.error?.code).toBe('auth.self_registration_disabled');

    const found = await db.query.users.findFirst({
      where: (u, { eq }) => eq(u.phone, phone),
    });
    expect(found).toBeUndefined();
  });

  test("DENTAL_LOCAL_DESKTOP yo'q bo'lsa (cloud/dev/CI) — o'zgarish yo'q, 201", async () => {
    delete process.env.DENTAL_LOCAL_DESKTOP;
    const tag = String(Math.floor(Math.random() * 900 + 100));
    const ip = `10.89.1.${Math.floor(Math.random() * 250 + 1)}`;

    const res = await registerReq(uniquePhone(tag, 0), ip);
    expect(res.status).toBe(201);
  });

  test("DENTAL_LOCAL_DESKTOP='false' — hali ham no-op, 201", async () => {
    process.env.DENTAL_LOCAL_DESKTOP = 'false';
    const tag = String(Math.floor(Math.random() * 900 + 100));
    const ip = `10.89.2.${Math.floor(Math.random() * 250 + 1)}`;

    const res = await registerReq(uniquePhone(tag, 0), ip);
    expect(res.status).toBe(201);
  });
});
