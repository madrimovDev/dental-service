/**
 * `GET /api/bootstrap-status` — pre-auth (auth'siz, `requirePermission`siz)
 * diagnostika endpointi (audit C1). SPA `/login` va `/activate` sahifalari,
 * hamda Electron startup gate'i shu javobga qarab qaror qabul qiladi.
 *
 * ⚠️ `src/routes/bootstrap-status.test.ts` route FABRIKASINI soxta `db` bilan
 * chaqiradi, `src/lib/license-middleware.test.ts` esa WHITELIST'ning string
 * mosligini yalang'och `Hono`da tekshiradi — ikkalasi ham YETIB BORISHNI
 * tekshirmaydi. Bu endpoint aynan "litsenziya HALI faollashtirilmagan /
 * lokal baza yo'q" holatida chaqiriladi, ya'ni darvozalar eng "issiq" payt.
 * Shuning uchun REAL `createApp()` ustida ham sinaladi
 * (`registration-enabled.test.ts:90` pretsedenti, CLI-358 module-gating darsi).
 *
 * Ishga tushirish: `cd apps/api && bun test --env-file=../../.env bootstrap-status`
 */

import { afterAll, afterEach, describe, expect, test } from 'bun:test';
import { tenants } from '@dental/db-schema';
import { createApp } from '../../src/app.ts';
import { db } from '../../src/db/client.ts';
import { closeRateLimitRedis } from '../../src/lib/rate-limit.ts';

const originalFlag = process.env.DENTAL_LOCAL_DESKTOP;
const originalLicensePath = process.env.LICENSE_PATH;

type Body = { success: boolean; data?: { hasLicense: boolean; hasTenant: boolean } };

// ⚠️ Bu endpoint hech qanday jadvalga YOZMAYDI — TRUNCATE YO'Q (testlar bitta
// umumiy bazadan foydalanadi, keraksiz tozalash boshqa suite'larni buzadi).
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

describe('GET /api/bootstrap-status (REAL createApp)', () => {
  test("Local Desktop + `.lic` YO'Q — 403 gate'ga tushmaydi, 200 qaytaradi", async () => {
    // Aynan shu kombinatsiya uchun endpoint kerak: `DENTAL_LOCAL_DESKTOP`
    // yoqilgan + litsenziya fayli yo'q.
    //
    // ℹ️ Route hozir `app.ts`ning PUBLIC bo'limida, ustiga hech qanday
    // `requireModuleInDesktop` qo'yilmagan — ya'ni `license-middleware.ts`
    // WHITELIST yozuvi ayni damda MUDOFAA (verify bosqichida tekshirildi:
    // yozuvni olib tashlash bu testni qizil qilmaydi). Bu testni qizil
    // qiladigan narsa — MOUNT yo'qolishi yoki route auth ostiga ko'chishi.
    process.env.DENTAL_LOCAL_DESKTOP = 'true';
    process.env.LICENSE_PATH = `/tmp/bootstrap-status-no-license-${crypto.randomUUID()}.lic`;

    const res = await createApp().request('/api/bootstrap-status');

    expect(res.status).toBe(200);
    const body = (await res.json()) as Body;
    expect(body.success).toBe(true);
    expect(body.data?.hasLicense).toBe(false);
  });

  test("auth header YO'Q bo'lsa ham ochiq (pre-auth sahifa uchun)", async () => {
    delete process.env.DENTAL_LOCAL_DESKTOP;

    const res = await createApp().request('/api/bootstrap-status', {
      headers: { accept: 'application/json' },
    });

    expect(res.status).toBe(200);
  });

  test('`hasTenant` REAL bazadagi holatni aks ettiradi', async () => {
    delete process.env.DENTAL_LOCAL_DESKTOP;

    const rows = await db.select({ id: tenants.id }).from(tenants).limit(1);
    const res = await createApp().request('/api/bootstrap-status');
    const body = (await res.json()) as Body;

    expect(body.data?.hasTenant).toBe(rows.length > 0);
  });
});
