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
 * ⚠️ Ikki xil gating ORDER bor (fix-forward topilgan, quyida izohlangan):
 *   - 9 modul (patients, appointments, queue, cashier, reports, staff,
 *     lab-orders, prescriptions, consent) — gate auth/rls'DAN OLDIN ishlaydi
 *     (`app.use('*', requireModuleInDesktop(...))`, birinchi middleware).
 *     Auth header'siz ham 403 LICENSE_NOT_FOUND.
 *   - 2 modul (clinical, patient-images) — gate auth/rls'DAN KEYIN ishlaydi
 *     (per-route `middleware:` array). Sabab: ikkalasi ham app.ts'da BARE
 *     `/api` prefiksda mount qilingan (boshqalardek `/api/<modul>` emas —
 *     /diagnoses, /treatment-plans, /patients/{id}/images kabi turli
 *     top-level yo'llarga tarqaladi); `app.use('*', ...)` shu yerda
 *     `/api/*`ga tekislanib boshqa hamma modulga bleed qilardi (runtime
 *     probe bilan tasdiqlangan: /api/expenses/stock/payroll/notifications
 *     — MODULE_MAP'da yo'q — ham 403 bo'lib qolardi). Path-scoped
 *     `app.use(pattern, ...)` ikkinchi muammoni ochdi: ikkita alohida
 *     OpenAPIHono instance (clinical, patient-images) bitta prefiksda
 *     `.route()` bilan merge qilinganda, biri o'zining `.use()`
 *     pattern'larini yo'qotadi (Hono `.route()` merge quirk, mount tartibiga
 *     bog'liq). Per-route middleware bu muammoni chetlab o'tadi (hech qanday
 *     `.use()` pattern ro'yxatdan o'tmaydi), lekin auth'dan KEYIN ishlaydi.
 *     Shuning uchun bu ikki modul uchun test auth header BILAN yuboradi
 *     (`signAccess` — DB seed shart emas, faqat JWT imzo tekshiriladi,
 *     rlsMiddleware ixtiyoriy tenantId bilan ham transaction ochadi).
 *
 * Talab: Postgres running, DATABASE_URL .env'da (createApp() DB pool ochadi;
 * auth header'siz testlar hech qanday query yubormaydi — gating birinchi
 * middleware sifatida so'rovni bloklaydi; auth header'li testlar bitta
 * bo'sh transaction ochadi, `SET LOCAL` qiladi, keyin gate 403 qaytarib
 * rollback qiladi — real tenant/user seed shart emas).
 * Ishga tushirish: `cd apps/api && bun test --env-file=../../.env cli-358-module-gating`
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { createApp } from '../../src/app.ts';
import { signAccess } from '../../src/lib/jwt.ts';

let originalLicensePath: string | undefined;
let originalWebDistDir: string | undefined;
let ownerToken: string;

beforeAll(async () => {
  originalLicensePath = process.env.LICENSE_PATH;
  originalWebDistDir = process.env.WEB_DIST_DIR;

  // Mavjud bo'lmagan yo'l — getLicensePath() bu env'ni har chaqiruvda o'qiydi.
  process.env.LICENSE_PATH = `/tmp/cli-358-no-license-${crypto.randomUUID()}.lic`;
  // requireModuleInDesktop faqat WEB_DIST_DIR bor bo'lganda faollashadi —
  // Local Desktop rejimini simulyatsiya qilish uchun (haqiqiy web build
  // shart emas, /api/* so'rovlar static-serving branch'iga yetmaydi).
  process.env.WEB_DIST_DIR = '/tmp/cli-358-fake-web-dist';

  // clinical/patient-images testlari uchun — DB seed SHART EMAS: authMiddleware
  // faqat JWT imzosini tekshiradi (DB'ga bormaydi), rlsMiddleware ixtiyoriy
  // (mavjud bo'lmagan) tenantId bilan ham oddiy transaction ochadi (RLS
  // `set_config` — FK tekshiruvi yo'q), va gate auth'dan keyin lekin
  // requirePermission'dan OLDIN ishlaydi — shuning uchun rol/permission ham
  // kerak emas.
  const { token } = await signAccess({
    sub: '00000000-0000-0000-0000-000000000001',
    atid: '00000000-0000-0000-0000-000000000002',
    abid: null,
    perms: ['@owner'],
    roleKey: null,
    lang: 'uz',
  });
  ownerToken = token;
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

  test('GET /api/appointments (Local Desktop, no license) → 403 LICENSE_NOT_FOUND', async () => {
    const app = createApp();
    const res = await app.request('/api/appointments');
    expect(res.status).toBe(403);
    const body = (await res.json()) as { success: boolean; error: { code: string } };
    expect(body.error.code).toBe('LICENSE_NOT_FOUND');
  });

  test('GET /api/queue (Local Desktop, no license) → 403 LICENSE_NOT_FOUND', async () => {
    const app = createApp();
    const res = await app.request('/api/queue');
    expect(res.status).toBe(403);
    const body = (await res.json()) as { success: boolean; error: { code: string } };
    expect(body.error.code).toBe('LICENSE_NOT_FOUND');
  });

  test('GET /api/cashier/transactions (Local Desktop, no license) → 403 LICENSE_NOT_FOUND', async () => {
    const app = createApp();
    const res = await app.request('/api/cashier/transactions');
    expect(res.status).toBe(403);
    const body = (await res.json()) as { success: boolean; error: { code: string } };
    expect(body.error.code).toBe('LICENSE_NOT_FOUND');
  });

  test('GET /api/reports/revenue (Local Desktop, no license) → 403 LICENSE_NOT_FOUND', async () => {
    const app = createApp();
    const res = await app.request('/api/reports/revenue');
    expect(res.status).toBe(403);
    const body = (await res.json()) as { success: boolean; error: { code: string } };
    expect(body.error.code).toBe('LICENSE_NOT_FOUND');
  });

  test('GET /api/users/assignments (Local Desktop, no license) → 403 LICENSE_NOT_FOUND (staff module)', async () => {
    const app = createApp();
    const res = await app.request('/api/users/assignments');
    expect(res.status).toBe(403);
    const body = (await res.json()) as { success: boolean; error: { code: string } };
    expect(body.error.code).toBe('LICENSE_NOT_FOUND');
  });

  test('GET /api/lab-orders (Local Desktop, no license) → 403 LICENSE_NOT_FOUND', async () => {
    const app = createApp();
    const res = await app.request('/api/lab-orders');
    expect(res.status).toBe(403);
    const body = (await res.json()) as { success: boolean; error: { code: string } };
    expect(body.error.code).toBe('LICENSE_NOT_FOUND');
  });

  test('GET /api/prescriptions (Local Desktop, no license) → 403 LICENSE_NOT_FOUND', async () => {
    const app = createApp();
    const res = await app.request('/api/prescriptions');
    expect(res.status).toBe(403);
    const body = (await res.json()) as { success: boolean; error: { code: string } };
    expect(body.error.code).toBe('LICENSE_NOT_FOUND');
  });

  test('GET /api/consent/templates (Local Desktop, no license) → 403 LICENSE_NOT_FOUND', async () => {
    const app = createApp();
    const res = await app.request('/api/consent/templates');
    expect(res.status).toBe(403);
    const body = (await res.json()) as { success: boolean; error: { code: string } };
    expect(body.error.code).toBe('LICENSE_NOT_FOUND');
  });

  // ── clinical / patient-images: gate runs AFTER auth (see file header) ────
  // Auth header'siz bu ikkalasi 401 auth.missing_token qaytaradi (gate hali
  // ishlamagan) — shuning uchun bu testlar authenticated so'rov yuboradi va
  // gate hali ham 403 LICENSE_NOT_FOUND bilan bloklashini tekshiradi.

  test('GET /api/treatment-plans (Local Desktop, authenticated, no license) → 403 LICENSE_NOT_FOUND (clinical module)', async () => {
    const app = createApp();
    const res = await app.request('/api/treatment-plans', {
      headers: { Authorization: `Bearer ${ownerToken}` },
    });
    expect(res.status).toBe(403);
    const body = (await res.json()) as { success: boolean; error: { code: string } };
    expect(body.error.code).toBe('LICENSE_NOT_FOUND');
  });

  test('GET /api/treatment-plans (Local Desktop, no auth header) → 401, NOT 403 (documents gate-after-auth for clinical)', async () => {
    const app = createApp();
    const res = await app.request('/api/treatment-plans');
    expect(res.status).toBe(401);
    const body = (await res.json()) as { success: boolean; error: { code: string } };
    expect(body.error.code).toBe('auth.missing_token');
  });

  test('GET /api/patient-images/{id} (Local Desktop, authenticated, no license) → 403 LICENSE_NOT_FOUND (patient-images module)', async () => {
    const app = createApp();
    const res = await app.request('/api/patient-images/33333333-3333-3333-3333-333333333333', {
      headers: { Authorization: `Bearer ${ownerToken}` },
    });
    expect(res.status).toBe(403);
    const body = (await res.json()) as { success: boolean; error: { code: string } };
    expect(body.error.code).toBe('LICENSE_NOT_FOUND');
  });

  // ── Regression guards ─────────────────────────────────────────────────────

  test('GET /api/patients WITHOUT WEB_DIST_DIR (cloud/dev/CI mode) → gating is a no-op, never LICENSE_NOT_FOUND', async () => {
    // Simulates every other existing integration test (cli-79-vertical-gating,
    // clinical.test.ts, cashier-*.test.ts, ...) — none of them set WEB_DIST_DIR,
    // none of them provision a .lic. This is the guard that proves CLI-358
    // did not break the rest of the suite / cloud deploy.
    const savedWebDistDir = process.env.WEB_DIST_DIR;
    delete process.env.WEB_DIST_DIR;
    try {
      const app = createApp();
      const res = await app.request('/api/patients');
      // No Authorization header either — falls straight past the (no-op)
      // module gate to authMiddleware → 401, never 403 LICENSE_NOT_FOUND.
      expect(res.status).toBe(401);
      const body = (await res.json()) as { success: boolean; error: { code: string } };
      expect(body.error.code).not.toBe('LICENSE_NOT_FOUND');
      expect(body.error.code).toBe('auth.missing_token');
    } finally {
      if (savedWebDistDir === undefined) {
        delete process.env.WEB_DIST_DIR;
      } else {
        process.env.WEB_DIST_DIR = savedWebDistDir;
      }
    }
  });

  test('GET /api/branches (non-gated route, Local Desktop mode) → NOT LICENSE_NOT_FOUND (falls through to auth)', async () => {
    // /api/branches has no MODULE_MAP entry — requireModuleInDesktop must NOT
    // be mounted on it, even in simulated Local Desktop mode (WEB_DIST_DIR set
    // by the shared beforeAll harness). Without a license it should behave
    // exactly as before this ticket: no Authorization header → 401
    // auth.missing_token, never 403 LICENSE_NOT_FOUND.
    const app = createApp();
    const res = await app.request('/api/branches');
    expect(res.status).toBe(401);
    const body = (await res.json()) as { success: boolean; error: { code: string } };
    expect(body.error.code).not.toBe('LICENSE_NOT_FOUND');
    expect(body.error.code).toBe('auth.missing_token');
  });

  // The bug this project actually shipped and fixed (see file header + the
  // `fix(api): de-bleed requireModuleInDesktop('clinical')...` commit):
  // clinicalRoutes' gate used to be `app.use('*', ...)` at the bare `/api`
  // mount, which Hono flattens to `/api/*` and which bled FORWARD onto every
  // route group mounted after it in app.ts — including these four, which are
  // NOT in MODULE_MAP and must stay reachable (e.g. for the standard tier,
  // which has no clinical/lab-orders/etc access at all). This is the
  // discriminating guard: it fails loudly if that bleed ever comes back.
  for (const path of ['/api/expenses', '/api/stock', '/api/payroll', '/api/notifications']) {
    test(`GET ${path} (non-gated route, Local Desktop mode, no license) → NOT LICENSE_NOT_FOUND (clinical bleed regression guard)`, async () => {
      const app = createApp();
      const res = await app.request(path);
      expect(res.status).toBe(401);
      const body = (await res.json()) as { success: boolean; error: { code: string } };
      expect(body.error.code).not.toBe('LICENSE_NOT_FOUND');
      expect(body.error.code).toBe('auth.missing_token');
    });
  }
});
