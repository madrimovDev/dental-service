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
import { createApp } from '../../src/app.ts';
import { db } from '../../src/db/client.ts';
import { closeRateLimitRedis } from '../../src/lib/rate-limit.ts';
import { authRoutes } from '../../src/modules/auth/auth.routes.ts';

const app = new OpenAPIHono();
app.route('/api/auth', authRoutes({ db }));

const originalFlag = process.env.DENTAL_LOCAL_DESKTOP;
const originalLicensePath = process.env.LICENSE_PATH;

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
  if (originalLicensePath === undefined) {
    delete process.env.LICENSE_PATH;
  } else {
    process.env.LICENSE_PATH = originalLicensePath;
  }
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

  // ⚠️ Yuqoridagi testlar `authRoutes`ni yalang'och `OpenAPIHono`ga mount qiladi —
  // ular handler'ni tekshiradi, YETIB BORISHNI emas. Bu endpoint aynan
  // "Local Desktop + litsenziya HALI faollashtirilmagan" holati uchun kerak
  // — ya'ni litsenziya darvozalari eng "issiq" bo'lgan payt. Shuning uchun
  // REAL `createApp()` ustida ham tekshiriladi (CLI-358 module-gating testi
  // pretsedenti): brauzerdan LAN orqali kiruvchi klientda `window.dentalDesktop`
  // yo'q, server signali — YAGONA darvoza.
  test("REAL createApp(): desktop + litsenziyasiz ham yetib boradi (403 gate'ga tushmaydi)", async () => {
    process.env.DENTAL_LOCAL_DESKTOP = 'true';
    process.env.LICENSE_PATH = `/tmp/registration-enabled-no-license-${crypto.randomUUID()}.lic`;

    const realApp = createApp();
    const res = await realApp.request('/api/auth/registration-enabled');
    expect(res.status).toBe(200);
    expect(((await res.json()) as Body).data?.enabled).toBe(false);
  });
});
