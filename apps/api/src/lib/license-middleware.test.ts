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
  const originalWebDistDir = process.env.WEB_DIST_DIR;

  afterEach(() => {
    if (originalWebDistDir === undefined) {
      delete process.env.WEB_DIST_DIR;
    } else {
      process.env.WEB_DIST_DIR = originalWebDistDir;
    }
  });

  test("WEB_DIST_DIR yo'q bo'lsa (cloud/dev/CI) — litsenziya bo'lmasa ham o'tadi (no-op)", async () => {
    delete process.env.WEB_DIST_DIR;
    activeModules = [];
    const app = new Hono();
    app.get('/test', requireModuleInDesktop('patients'), (c) => c.json({ ok: true }));
    const res = await app.request('/test');
    expect(res.status).toBe(200);
  });

  test("WEB_DIST_DIR bor bo'lsa (Local Desktop) — requireModule kabi 403 LICENSE_NOT_FOUND qaytaradi", async () => {
    process.env.WEB_DIST_DIR = '/tmp/fake-web-dist';
    activeModules = [];
    const app = new Hono();
    app.get('/test', requireModuleInDesktop('patients'), (c) => c.json({ ok: true }));
    const res = await app.request('/test');
    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('LICENSE_NOT_FOUND');
  });

  test("WEB_DIST_DIR bor + modul faol bo'lsa — o'tadi", async () => {
    process.env.WEB_DIST_DIR = '/tmp/fake-web-dist';
    activeModules = ['patients'];
    const app = new Hono();
    app.get('/test', requireModuleInDesktop('patients'), (c) => c.json({ ok: true }));
    const res = await app.request('/test');
    expect(res.status).toBe(200);
  });
});
