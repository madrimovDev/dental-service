/**
 * L8 (Lab Hub) — SaaS tenantlar Supervisor'da klinika sifatida: ro'yxatga olish,
 * obuna muddati sinxroni, P18 bilan bir xil blok. REAL DB (app + admin conn) va
 * REAL HTTP Supervisor-stub (`Bun.serve`) — spy-dep emas.
 *
 * Tekshiriladi:
 *  - Supervisor o'chiq bo'lsa ham register-tenant 201; keyin sikl ro'yxatga oladi,
 *    qayta sikl dublikat yaratmaydi (idempotent);
 *  - muddat noma'lum (NULL) → bloklanmaydi; imtiyoz (7 kun) ichida → 200 + status
 *    `grace`; imtiyozdan keyin → 403 LICENSE_EXPIRED, ochiq yo'llar (auth/status)
 *    ishlaydi; boshqa tenant ta'sirlanmaydi;
 *  - «Qayta tekshirish» (POST /api/license/recheck) Supervisor'dan yangi muddatni
 *    olib blokni darhol yechadi;
 *  - desktop rejimi SaaS obunasini O'QIMAYDI (mavjud p18/cli-387 testlari qolgan
 *    xulqni qulflaydi).
 *
 * Ishga tushirish: `cd apps/api && bun test --env-file=../../.env l8-saas-supervisor`
 */
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';
import { tenantSettings } from '@dental/db-schema';
import { eq, sql } from 'drizzle-orm';
import { createApp } from '../../src/app.ts';
import { createAdminDb, db } from '../../src/db/client.ts';
import { signAccess } from '../../src/lib/jwt.ts';
import { closeRateLimitRedis } from '../../src/lib/rate-limit.ts';
import { invalidateSubscriptionCache } from '../../src/lib/subscription.ts';
import { runSupervisorSyncCycle } from '../../src/lib/supervisor-saas.ts';

const TOKEN = 'l8-saas-test-token-0123456789-abcdefghijkl';
const DAY = 86_400_000;
const admin = createAdminDb();
const app = createApp();

// ─── Supervisor stub (haqiqiy HTTP) ──────────────────────────────────────────
type StubClinic = { clinicId: string; subscriptionExpiresAt: string };
const store = new Map<string, StubClinic>();
const registerCalls: string[] = [];
const stub = Bun.serve({
  port: 0,
  fetch: async (req) => {
    const url = new URL(req.url);
    if (req.headers.get('authorization') !== `Bearer ${TOKEN}`) {
      return Response.json({ error: { code: 'UNAUTHORIZED' } }, { status: 401 });
    }
    if (req.method === 'POST' && url.pathname === '/internal/saas/clinics') {
      const body = (await req.json()) as { tenantId: string; ownerPhone: string };
      registerCalls.push(body.tenantId);
      const existing = store.get(body.tenantId);
      if (existing) return Response.json({ ...existing, mode: 'saas' }, { status: 200 });
      const created = {
        clinicId: crypto.randomUUID(),
        subscriptionExpiresAt: new Date(Date.now() + 14 * DAY).toISOString(),
      };
      store.set(body.tenantId, created);
      return Response.json({ ...created, mode: 'saas' }, { status: 201 });
    }
    const m = url.pathname.match(/^\/internal\/saas\/clinics\/([^/]+)\/status$/);
    if (req.method === 'GET' && m) {
      const found = store.get(m[1] as string);
      if (!found) return Response.json({ error: { code: 'NOT_FOUND' } }, { status: 404 });
      return Response.json({ ...found, mode: 'saas' });
    }
    return Response.json({ error: { code: 'NOT_FOUND' } }, { status: 404 });
  },
});
const STUB_URL = `http://127.0.0.1:${stub.port}`;
const DEAD_URL = 'http://127.0.0.1:1'; // connection refused

const saved = {
  url: process.env.SUPERVISOR_URL,
  token: process.env.SUPERVISOR_SAAS_TOKEN,
  desktop: process.env.DENTAL_LOCAL_DESKTOP,
};
const restore = (k: string, v: string | undefined) => {
  if (v === undefined) delete process.env[k];
  else process.env[k] = v;
};

let ipSeq = 0;
const registerTenant = async (label: string) => {
  const phone = `+99893${String(Math.floor(Math.random() * 9_000_000) + 1_000_000)}`;
  const res = await app.request('/api/auth/register-tenant', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-forwarded-for': `10.88.${Math.floor(Math.random() * 250)}.${(ipSeq++ % 250) + 1}`,
    },
    body: JSON.stringify({
      tenantName: `L8 ${label}`,
      ownerPhone: phone,
      ownerFullName: `L8 Owner ${label}`,
      ownerPassword: 'CorrectHorseBattery1',
      defaultLanguage: 'uz',
    }),
  });
  const body = (await res.json()) as { data?: { tenantId?: string } };
  return { status: res.status, tenantId: body.data?.tenantId as string, phone };
};

const ownerToken = async (tenantId: string) => {
  const { token } = await signAccess({
    sub: crypto.randomUUID(),
    atid: tenantId,
    abid: null,
    perms: ['@owner'],
    roleKey: null,
    lang: 'uz',
  });
  return token;
};

const get = (path: string, token: string) =>
  app.request(path, { headers: { Authorization: `Bearer ${token}` } });

const settingsOf = async (tenantId: string) => {
  const [row] = await admin.db
    .select()
    .from(tenantSettings)
    .where(eq(tenantSettings.tenantId, tenantId));
  return row;
};

const setExpiry = async (tenantId: string, at: Date | null) => {
  await admin.db
    .insert(tenantSettings)
    .values({ tenantId, subscriptionExpiresAt: at })
    .onConflictDoUpdate({
      target: tenantSettings.tenantId,
      set: { subscriptionExpiresAt: at },
    });
  invalidateSubscriptionCache(tenantId);
};

beforeAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
  delete process.env.DENTAL_LOCAL_DESKTOP;
  process.env.SUPERVISOR_SAAS_TOKEN = TOKEN;
  process.env.SUPERVISOR_URL = DEAD_URL;
});

afterEach(() => {
  process.env.SUPERVISOR_URL = DEAD_URL;
  invalidateSubscriptionCache();
});

afterAll(async () => {
  stub.stop(true);
  restore('SUPERVISOR_URL', saved.url);
  restore('SUPERVISOR_SAAS_TOKEN', saved.token);
  restore('DENTAL_LOCAL_DESKTOP', saved.desktop);
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
  await admin.client.end({ timeout: 5 });
  await closeRateLimitRedis();
});

describe('L8 — Supervisor o‘chiq: tenant baribir yaratiladi, keyin sikl ro‘yxatga oladi', () => {
  test('register-tenant 201 (Supervisor yetib bo‘lmaydi), muddat noma‘lum → bloklanmaydi', async () => {
    const t = await registerTenant('down');
    expect(t.status).toBe(201);
    const s = await settingsOf(t.tenantId);
    expect(s?.supervisorClinicId ?? null).toBeNull();

    const token = await ownerToken(t.tenantId);
    const status = await get('/api/license/status', token);
    expect(((await status.json()) as any).data).toMatchObject({ state: 'none', mode: 'cloud' });
    const res = await get('/api/patients', token);
    expect(res.status).not.toBe(403); // bloklanmagan (200 yoki ruxsat bo'yicha boshqa kod emas)
  });

  test('sikl: ro‘yxatga oladi (14 kunlik sinov), qayta sikl dublikat yaratmaydi', async () => {
    const t = await registerTenant('retry');
    expect(t.status).toBe(201);
    process.env.SUPERVISOR_URL = STUB_URL;
    const before = registerCalls.filter((id) => id === t.tenantId).length;

    const r1 = await runSupervisorSyncCycle({ adminDb: admin.db });
    expect(r1.registered).toBeGreaterThanOrEqual(1);
    const s = await settingsOf(t.tenantId);
    expect(s?.supervisorClinicId).toBe(store.get(t.tenantId)?.clinicId);
    const days = ((s?.subscriptionExpiresAt?.getTime() ?? 0) - Date.now()) / DAY;
    expect(days).toBeGreaterThan(13.9);
    expect(days).toBeLessThan(14.1);

    await runSupervisorSyncCycle({ adminDb: admin.db });
    expect(registerCalls.filter((id) => id === t.tenantId).length - before).toBe(1);
  });

  test('Supervisor tomoni yo‘q (token yo‘q) → integratsiya o‘chiq, hech narsa yuborilmaydi', async () => {
    const t = await registerTenant('notoken');
    delete process.env.SUPERVISOR_SAAS_TOKEN;
    try {
      process.env.SUPERVISOR_URL = STUB_URL;
      const before = registerCalls.length;
      const r = await runSupervisorSyncCycle({ adminDb: admin.db });
      expect(r).toEqual({ registered: 0, synced: 0, failed: 0 });
      expect(registerCalls.length).toBe(before);
      expect((await settingsOf(t.tenantId))?.supervisorClinicId ?? null).toBeNull();
    } finally {
      process.env.SUPERVISOR_SAAS_TOKEN = TOKEN;
    }
  });
});

describe('L8 — register-tenant Supervisor ishlayotganda darhol ro‘yxatga oladi', () => {
  test('afterCommit orqali supervisor_clinic_id + muddat yoziladi', async () => {
    process.env.SUPERVISOR_URL = STUB_URL;
    const t = await registerTenant('up');
    expect(t.status).toBe(201);
    const s = await settingsOf(t.tenantId);
    expect(s?.supervisorClinicId).toBe(store.get(t.tenantId)?.clinicId);
    expect(s?.subscriptionExpiresAt).toBeTruthy();
  });
});

describe('L8 — obuna bloki (P18 bilan bir xil)', () => {
  test('imtiyoz ichida 200 + status grace; imtiyozdan keyin 403 LICENSE_EXPIRED; ochiq yo‘llar ishlaydi', async () => {
    const t = await registerTenant('gate');
    const token = await ownerToken(t.tenantId);

    await setExpiry(t.tenantId, new Date(Date.now() - 2 * DAY));
    const grace = await get('/api/license/status', token);
    expect(((await grace.json()) as any).data).toMatchObject({ state: 'grace', mode: 'cloud' });
    expect((await get('/api/patients', token)).status).not.toBe(403);

    await setExpiry(t.tenantId, new Date(Date.now() - 8 * DAY));
    const blocked = await get('/api/patients', token);
    expect(blocked.status).toBe(403);
    expect(((await blocked.json()) as any).error.code).toBe('LICENSE_EXPIRED');
    // /uploads ham bloklanadi (P18 bilan bir xil)
    expect((await get('/uploads/x', token)).status).toBe(403);

    // Ochiq yo'llar: status ko'rinadi, auth yo'llari bloklanmaydi.
    const st = await get('/api/license/status', token);
    expect(st.status).toBe(200);
    expect(((await st.json()) as any).data.state).toBe('expired');
    expect((await get('/api/auth/me', token)).status).not.toBe(403);
  });

  test('boshqa tenant (muddati yaxshi / NULL) ta‘sirlanmaydi', async () => {
    const a = await registerTenant('iso-a');
    const b = await registerTenant('iso-b');
    await setExpiry(a.tenantId, new Date(Date.now() - 30 * DAY));
    await setExpiry(b.tenantId, new Date(Date.now() + 30 * DAY));
    expect((await get('/api/patients', await ownerToken(a.tenantId))).status).toBe(403);
    expect((await get('/api/patients', await ownerToken(b.tenantId))).status).not.toBe(403);
  });

  test('yaroqsiz/yo‘q token → obuna gate o‘tkazadi, 401 ni auth beradi', async () => {
    const res = await app.request('/api/patients');
    expect(res.status).toBe(401);
  });

  test('«Qayta tekshirish»: Supervisor muddatni uzaytirgach blok darhol yechiladi', async () => {
    process.env.SUPERVISOR_URL = STUB_URL;
    const t = await registerTenant('recheck');
    const token = await ownerToken(t.tenantId);
    // Supervisor'da ro'yxatda, lekin lokal muddat o'tgan (eskirgan sinxron).
    await setExpiry(t.tenantId, new Date(Date.now() - 30 * DAY));
    expect((await get('/api/patients', token)).status).toBe(403);

    // Hali ham eski muddat Supervisor'da? yo'q — sinov 14 kun, ya'ni sinxron yangi muddatni beradi.
    const re = await app.request('/api/license/recheck', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'x-forwarded-for': '10.77.0.1' },
    });
    expect(re.status).toBe(200);
    expect(((await re.json()) as any).data).toMatchObject({ mode: 'cloud' });
    expect((await get('/api/patients', token)).status).not.toBe(403);
  });

  test('recheck: Supervisor yetib bo‘lmasa saqlangan holat qaytadi (blok saqlanadi), token yo‘q → 404', async () => {
    const t = await registerTenant('recheck-down');
    const token = await ownerToken(t.tenantId);
    await setExpiry(t.tenantId, new Date(Date.now() - 30 * DAY));
    process.env.SUPERVISOR_URL = DEAD_URL;
    const re = await app.request('/api/license/recheck', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'x-forwarded-for': '10.77.0.2' },
    });
    expect(re.status).toBe(200);
    expect(((await re.json()) as any).data.state).toBe('expired');

    const anon = await app.request('/api/license/recheck', {
      method: 'POST',
      headers: { 'x-forwarded-for': '10.77.0.3' },
    });
    expect(anon.status).toBe(404);
  });
});

describe('L8 — desktop rejimi SaaS obunasini o‘qimaydi', () => {
  test('DENTAL_LOCAL_DESKTOP=true: muddati o‘tgan tenant_settings.subscription_expires_at ahamiyatsiz (cloud gate ishlamaydi)', async () => {
    const t = await registerTenant('desk');
    await setExpiry(t.tenantId, new Date(Date.now() - 60 * DAY));
    process.env.DENTAL_LOCAL_DESKTOP = 'true';
    process.env.LICENSE_PATH = `/tmp/l8-no-license-${crypto.randomUUID()}.lic`;
    try {
      const res = await get('/api/patients', await ownerToken(t.tenantId));
      // Desktop gate: .lic yo'q → LICENSE_NOT_FOUND (obuna emas, LICENSE_EXPIRED emas).
      expect(res.status).toBe(403);
      expect(((await res.json()) as any).error.code).toBe('LICENSE_NOT_FOUND');
      // status — desktop shakli
      const st = await get('/api/license/status', await ownerToken(t.tenantId));
      expect(((await st.json()) as any).data.mode).toBe('desktop');
    } finally {
      delete process.env.DENTAL_LOCAL_DESKTOP;
      delete process.env.LICENSE_PATH;
    }
  });
});
