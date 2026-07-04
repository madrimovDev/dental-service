/**
 * Module-gating integration test (CLI-358) — `requireModuleInDesktop`
 * litsenziya-gating middleware'ni REAL to'liq app (`createApp()`) ustida
 * tekshiradi.
 *
 * Maqsad: Local Desktop rejimida (`WEB_DIST_DIR` bor) litsenziya
 * faollashtirilmagan (`.lic` fayl yo'q) holatda modul-gated route'lar 403
 * `LICENSE_NOT_FOUND` qaytarishi kerak — Local Desktop litsenziya modeli shu
 * tekshiruvga tayanadi (CLI-338/348), lekin CLI-358 topilishicha hech bir
 * route bu middleware'dan o'tmagan edi.
 *
 * `requireModuleInDesktop` faqat `process.env.WEB_DIST_DIR` bor bo'lganda
 * faollashadi (cloud/dev/CI'da no-op — Task 1 izohiga qarang), shuning uchun
 * bu fayl `beforeAll`da ikkalasini ham o'rnatadi: `LICENSE_PATH` (mavjud
 * bo'lmagan yo'l → litsenziya topilmadi) VA `WEB_DIST_DIR` (Local Desktop
 * rejimini simulyatsiya qilish uchun, haqiqiy build kerak emas — bu testlar
 * hech qachon static-serving branch'iga yetmaydi, /api/* route'lar
 * ustunroq mos keladi).
 *
 * Talab: Postgres running, DATABASE_URL .env'da (createApp() DB pool ochadi,
 * lekin bu testlar hech qanday query yubormaydi — gating birinchi
 * middleware sifatida so'rovni auth/DB'ga yetmasdan bloklaydi).
 * Ishga tushirish: `cd apps/api && bun test --env-file=../../.env cli-358-module-gating`
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { createApp } from '../../src/app.ts';

let originalLicensePath: string | undefined;
let originalWebDistDir: string | undefined;

beforeAll(() => {
  originalLicensePath = process.env.LICENSE_PATH;
  originalWebDistDir = process.env.WEB_DIST_DIR;

  // Mavjud bo'lmagan yo'l — getLicensePath() bu env'ni har chaqiruvda o'qiydi.
  process.env.LICENSE_PATH = `/tmp/cli-358-no-license-${crypto.randomUUID()}.lic`;
  // requireModuleInDesktop faqat WEB_DIST_DIR bor bo'lganda faollashadi —
  // Local Desktop rejimini simulyatsiya qilish uchun (haqiqiy web build
  // shart emas, /api/* so'rovlar static-serving branch'iga yetmaydi).
  process.env.WEB_DIST_DIR = '/tmp/cli-358-fake-web-dist';
});

afterAll(() => {
  if (originalLicensePath === undefined) {
    delete process.env.LICENSE_PATH;
  } else {
    process.env.LICENSE_PATH = originalLicensePath;
  }
  if (originalWebDistDir === undefined) {
    delete process.env.WEB_DIST_DIR;
  } else {
    process.env.WEB_DIST_DIR = originalWebDistDir;
  }
});

describe('CLI-358 requireModuleInDesktop mounted on gated route groups', () => {
  test('GET /api/patients (Local Desktop, no license) → 403 LICENSE_NOT_FOUND', async () => {
    const app = createApp();
    const res = await app.request('/api/patients');
    expect(res.status).toBe(403);
    const body = (await res.json()) as { success: boolean; error: { code: string } };
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('LICENSE_NOT_FOUND');
  });
});
