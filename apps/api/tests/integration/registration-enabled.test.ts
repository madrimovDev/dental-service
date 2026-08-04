/**
 * `GET /api/auth/registration-enabled` — pre-auth (auth'siz, `requirePermission`siz)
 * kichik endpoint. Maqsad: SPA `/register-tenant` sahifasini ko'rsatish/yashirish.
 *
 * Local Desktop rejimida o'z-o'zini ro'yxatdan o'tkazish o'chirilgan
 * (`POST /register-tenant` allaqachon 403 qaytaradi — `desktop-register-tenant-block.test.ts`),
 * bu endpoint esa foydalanuvchini bekorga formaga yubormaslik uchun.
 *
 * ⚠️ Signal `process.env.DENTAL_LOCAL_DESKTOP` (frozen `env.ts` EMAS) — har so'rovda
 * qayta o'qiladi, `requireModuleInDesktop` pretsedenti.
 *
 * Ishga tushirish: `cd apps/api && bun test --env-file=../../.env registration-enabled`
 */

import { afterAll, afterEach, describe, expect, test } from 'bun:test';
import { OpenAPIHono } from '@hono/zod-openapi';
import { db } from '../../src/db/client.ts';
import { closeRateLimitRedis } from '../../src/lib/rate-limit.ts';
import { authRoutes } from '../../src/modules/auth/auth.routes.ts';

const app = new OpenAPIHono();
app.route('/api/auth', authRoutes({ db }));

const originalFlag = process.env.DENTAL_LOCAL_DESKTOP;

// ⚠️ Bu endpoint hech qanday jadvalga tegmaydi — TRUNCATE YO'Q (testlar bitta
// umumiy bazadan foydalanadi, keraksiz tozalash zararli).
afterEach(() => {
  if (originalFlag === undefined) {
    delete process.env.DENTAL_LOCAL_DESKTOP;
  } else {
    process.env.DENTAL_LOCAL_DESKTOP = originalFlag;
  }
});

afterAll(async () => {
  await closeRateLimitRedis();
});

const request = () => app.request('/api/auth/registration-enabled');

type Body = { success: boolean; data?: { enabled: boolean } };

describe('GET /auth/registration-enabled', () => {
  test("DENTAL_LOCAL_DESKTOP='true' — ro'yxatdan o'tish o'chirilgan (enabled=false)", async () => {
    process.env.DENTAL_LOCAL_DESKTOP = 'true';
    const res = await request();
    expect(res.status).toBe(200);
    const body = (await res.json()) as Body;
    expect(body.success).toBe(true);
    expect(body.data?.enabled).toBe(false);
  });

  test("DENTAL_LOCAL_DESKTOP yo'q (cloud/dev/CI) — enabled=true", async () => {
    delete process.env.DENTAL_LOCAL_DESKTOP;
    const res = await request();
    expect(res.status).toBe(200);
    expect(((await res.json()) as Body).data?.enabled).toBe(true);
  });

  test("DENTAL_LOCAL_DESKTOP='false' — hali ham enabled=true", async () => {
    process.env.DENTAL_LOCAL_DESKTOP = 'false';
    const res = await request();
    expect(res.status).toBe(200);
    expect(((await res.json()) as Body).data?.enabled).toBe(true);
  });

  test("auth header YO'Q bo'lsa ham ochiq (pre-auth sahifa uchun)", async () => {
    delete process.env.DENTAL_LOCAL_DESKTOP;
    const res = await app.request('/api/auth/registration-enabled', {
      headers: { accept: 'application/json' },
    });
    expect(res.status).toBe(200);
  });
});
