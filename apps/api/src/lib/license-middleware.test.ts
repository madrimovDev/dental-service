import { afterEach, describe, expect, mock, test } from 'bun:test';
import { Hono } from 'hono';
import * as realLicense from './license';

// './license' mock qilinadi — mock.module BEFORE any dynamic import of
// './license-middleware' resolves it (bun mock.module must be registered up front).
// `activeModules` mutable — har test o'z holatini o'rnatadi (LICENSE_NOT_FOUND vs
// MODULE_DISABLED vs active). Haqiqiy modulni spread qilib faqat
// `getActiveModules`ni override qilamiz — aks holda `mock.module`ning GLOBAL
// tabiati sabab boshqa test fayllari (masalan license.test.ts) `./license`ni
// import qilganda qolgan eksportlar (`writeLicense` va h.k.) `undefined`
// bo'lib qoladi (fayllar tartibiga bog'liq, racy).
let activeModules: string[] = ['patients', 'appointments'];

mock.module('./license', () => ({
  ...realLicense,
  getActiveModules: async () => activeModules,
}));

const { requireModule, requireModuleInDesktop } = await import('./license-middleware');

describe('requireModule', () => {
  test('allows request if module is active', async () => {
    activeModules = ['patients', 'appointments'];
    const app = new Hono();
    app.get('/test', requireModule('patients'), (c) => c.json({ ok: true }));
    const res = await app.request('/test');
    expect(res.status).toBe(200);
  });

  test('blocks request with 403 MODULE_DISABLED if module is inactive', async () => {
    activeModules = ['patients', 'appointments'];
    const app = new Hono();
    app.get('/test', requireModule('lab-orders'), (c) => c.json({ ok: true }));
    const res = await app.request('/test');
    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('MODULE_DISABLED');
  });

  test('blocks request with 403 LICENSE_NOT_FOUND if no license activated', async () => {
    activeModules = [];
    const app = new Hono();
    app.get('/test', requireModule('patients'), (c) => c.json({ ok: true }));
    const res = await app.request('/test');
    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('LICENSE_NOT_FOUND');
  });

  test('whitelists /activate route even without an active license', async () => {
    activeModules = [];
    const app = new Hono();
    app.get('/activate', requireModule('patients'), (c) => c.json({ ok: true }));
    const res = await app.request('/activate');
    expect(res.status).toBe(200);
  });

  test('whitelists /api/activate route even without an active license', async () => {
    activeModules = [];
    const app = new Hono();
    app.get('/api/activate', requireModule('patients'), (c) => c.json({ ok: true }));
    const res = await app.request('/api/activate');
    expect(res.status).toBe(200);
  });

  test('enterprise wildcard (*) grants access to any module', async () => {
    activeModules = ['*'];
    const app = new Hono();
    app.get('/test', requireModule('lab-orders'), (c) => c.json({ ok: true }));
    const res = await app.request('/test');
    expect(res.status).toBe(200);
  });
});

describe('requireModuleInDesktop', () => {
  // CLI-433 — signal renamed from `WEB_DIST_DIR` (litsenziyaga aloqasi
  // bo'lmagan static-serve sozlamasi) to a dedicated `DENTAL_LOCAL_DESKTOP`
  // flag `process-manager.ts` beradi.
  const originalFlag = process.env.DENTAL_LOCAL_DESKTOP;

  afterEach(() => {
    if (originalFlag === undefined) {
      delete process.env.DENTAL_LOCAL_DESKTOP;
    } else {
      process.env.DENTAL_LOCAL_DESKTOP = originalFlag;
    }
  });

  test("DENTAL_LOCAL_DESKTOP yo'q bo'lsa (cloud/dev/CI) — litsenziya bo'lmasa ham o'tadi (no-op)", async () => {
    delete process.env.DENTAL_LOCAL_DESKTOP;
    activeModules = [];
    const app = new Hono();
    app.get('/test', requireModuleInDesktop('patients'), (c) => c.json({ ok: true }));
    const res = await app.request('/test');
    expect(res.status).toBe(200);
  });

  test("DENTAL_LOCAL_DESKTOP='true' bo'lsa (Local Desktop) — requireModule kabi 403 LICENSE_NOT_FOUND qaytaradi", async () => {
    process.env.DENTAL_LOCAL_DESKTOP = 'true';
    activeModules = [];
    const app = new Hono();
    app.get('/test', requireModuleInDesktop('patients'), (c) => c.json({ ok: true }));
    const res = await app.request('/test');
    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('LICENSE_NOT_FOUND');
  });

  test("DENTAL_LOCAL_DESKTOP='true' + modul faol bo'lsa — o'tadi", async () => {
    process.env.DENTAL_LOCAL_DESKTOP = 'true';
    activeModules = ['patients'];
    const app = new Hono();
    app.get('/test', requireModuleInDesktop('patients'), (c) => c.json({ ok: true }));
    const res = await app.request('/test');
    expect(res.status).toBe(200);
  });

  // Non-'true' values (e.g. accidental "false", "0") must NOT accidentally
  // activate the gate — only the exact string 'true' does.
  test("DENTAL_LOCAL_DESKTOP='false' — hali ham no-op", async () => {
    process.env.DENTAL_LOCAL_DESKTOP = 'false';
    activeModules = [];
    const app = new Hono();
    app.get('/test', requireModuleInDesktop('patients'), (c) => c.json({ ok: true }));
    const res = await app.request('/test');
    expect(res.status).toBe(200);
  });
});

// CLI-433 — divergence guard: apps/api's reference MODULE_MAP (dead code at
// runtime — the real gate reads `lic.modules` from the signed `.lic`, not this
// constant) must stay in lockstep with Supervisor's
// apps/supervisor-api/src/modules/clinics/clinics.routes.ts MODULE_MAP by
// hand (separate deploy units, no workspace import edge — license-signature.ts
// precedent). This test hardcodes the agreed dictionary (docs/audit-fixes/
// CLI-433 §2c) and asserts BOTH api's MODULE_MAP AND the same dictionary
// mirrored in supervisor's own guard test (licenses/clinics test suite)
// match it — if either file's table is edited without the other, one of the
// two guard tests fails.
describe('MODULE_MAP — supervisor/api dictionary lockstep (CLI-433)', () => {
  const AGREED_MODULE_MAP: Record<string, string[]> = {
    starter: ['patients', 'appointments', 'queue'],
    standard: ['patients', 'appointments', 'queue', 'cashier', 'reports', 'staff'],
    premium: [
      'patients',
      'appointments',
      'queue',
      'cashier',
      'reports',
      'staff',
      'clinical',
      'lab-orders',
      'patient-images',
      'prescriptions',
      'consent',
    ],
    enterprise: [
      'patients',
      'appointments',
      'queue',
      'cashier',
      'reports',
      'staff',
      'clinical',
      'lab-orders',
      'patient-images',
      'prescriptions',
      'consent',
      'expenses',
      'stock',
      'payroll',
      'notifications',
      'schedule',
      'recalls',
    ],
  };

  test("apps/api's MODULE_MAP matches the agreed dictionary (mirror this in supervisor's clinics.test.ts too)", async () => {
    const { MODULE_MAP } = await import('./license-middleware');
    expect(MODULE_MAP).toEqual(AGREED_MODULE_MAP);
  });
});
