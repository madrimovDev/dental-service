/**
 * FX-149 (LC-27): Supervisor SaaS tenantni bilmasa (404) apps/api uni qayta
 * ro'yxatga oladi. Avval: (a) so'rovda tenant yaratilgan sanasi yo'q edi —
 * Supervisor har safar yangi 30 kunlik sinov berardi; (b) natija saqlangan,
 * ancha kech (to'langan) muddatni ham qisqartirib yuborardi.
 *
 * REAL DB (app + admin conn) va REAL HTTP Supervisor-stub (`Bun.serve`), stub
 * Supervisor qoidasini takrorlaydi: sinov = min(tenantCreatedAt, now) + 30 kun.
 *
 * Ishga tushirish: `cd apps/api && bun test --env-file=../../.env fx-149-saas-reregister`
 */
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';
import { tenantSettings, tenants } from '@dental/db-schema';
import { eq, sql } from 'drizzle-orm';
import { createApp } from '../../src/app.ts';
import { createAdminDb, db } from '../../src/db/client.ts';
import { closeRateLimitRedis } from '../../src/lib/rate-limit.ts';
import { invalidateSubscriptionCache } from '../../src/lib/subscription.ts';
import { runSupervisorSyncCycle, syncTenantSubscription } from '../../src/lib/supervisor-saas.ts';

const TOKEN = 'fx149-saas-test-token-0123456789-abcdefghij';
const DAY = 86_400_000;
const TRIAL_DAYS = 30;
const admin = createAdminDb();
const app = createApp();

type StubClinic = { clinicId: string; subscriptionExpiresAt: string };
const store = new Map<string, StubClinic>();
const registerBodies: Array<{ tenantId: string; tenantCreatedAt?: string }> = [];
const stub = Bun.serve({
  port: 0,
  fetch: async (req) => {
    const url = new URL(req.url);
    if (req.headers.get('authorization') !== `Bearer ${TOKEN}`) {
      return Response.json({ error: { code: 'UNAUTHORIZED' } }, { status: 401 });
    }
    if (req.method === 'POST' && url.pathname === '/internal/saas/clinics') {
      const body = (await req.json()) as { tenantId: string; tenantCreatedAt?: string };
      registerBodies.push(body);
      const existing = store.get(body.tenantId);
      if (existing) return Response.json({ ...existing, mode: 'saas' }, { status: 200 });
      const created = body.tenantCreatedAt ? Date.parse(body.tenantCreatedAt) : Date.now();
      const start = Math.min(created, Date.now());
      const clinic = {
        clinicId: crypto.randomUUID(),
        subscriptionExpiresAt: new Date(start + TRIAL_DAYS * DAY).toISOString(),
      };
      store.set(body.tenantId, clinic);
      return Response.json({ ...clinic, mode: 'saas' }, { status: 201 });
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
const DEAD_URL = 'http://127.0.0.1:1';

const saved = {
  url: process.env.SUPERVISOR_URL,
  token: process.env.SUPERVISOR_SAAS_TOKEN,
  desktop: process.env.DENTAL_LOCAL_DESKTOP,
};
const restore = (k: string, v: string | undefined) => {
  if (v === undefined) delete process.env[k];
  else process.env[k] = v;
};

const runId = Date.now() % 200;
let ipSeq = 0;
const registerTenant = async (label: string) => {
  const phone = `+99894${String(Math.floor(Math.random() * 9_000_000) + 1_000_000)}`;
  const res = await app.request('/api/auth/register-tenant', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-forwarded-for': `10.149.${runId}.${(ipSeq++ % 250) + 1}`,
    },
    body: JSON.stringify({
      tenantName: `FX149 ${label}`,
      ownerPhone: phone,
      ownerFullName: `FX149 Owner ${label}`,
      ownerPassword: 'CorrectHorseBattery1',
      defaultLanguage: 'uz',
    }),
  });
  expect(res.status).toBe(201);
  const body = (await res.json()) as { data: { tenantId: string } };
  return body.data.tenantId;
};

const backdateTenant = async (tenantId: string, at: Date) => {
  await admin.db.update(tenants).set({ createdAt: at }).where(eq(tenants.id, tenantId));
};

const settingsOf = async (tenantId: string) => {
  const [row] = await admin.db
    .select()
    .from(tenantSettings)
    .where(eq(tenantSettings.tenantId, tenantId));
  return row;
};

const setState = async (tenantId: string, clinicId: string, at: Date) => {
  await admin.db
    .insert(tenantSettings)
    .values({ tenantId, supervisorClinicId: clinicId, subscriptionExpiresAt: at })
    .onConflictDoUpdate({
      target: tenantSettings.tenantId,
      set: { supervisorClinicId: clinicId, subscriptionExpiresAt: at },
    });
  invalidateSubscriptionCache(tenantId);
};

beforeAll(async () => {
  // Sikl `pending`ni LIMIT 50 bilan, tartibsiz oladi — eski yurgizishlar qoldig'i
  // bu testning tenantini siqib chiqarmasin (l8 testi bilan bir xil naqsh).
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
  delete process.env.DENTAL_LOCAL_DESKTOP;
  process.env.SUPERVISOR_SAAS_TOKEN = TOKEN;
  process.env.SUPERVISOR_URL = DEAD_URL; // register-tenant afterCommit ro'yxatga olmasin
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

describe('FX-149 — qayta ro‘yxat sinovni qayta boshlamaydi', () => {
  test('sikl (ro‘yxatda yo‘q tenant): so‘rovda tenantCreatedAt bor, 40 kunlik tenant — muddat o‘tgan', async () => {
    const tenantId = await registerTenant('cycle');
    const createdAt = new Date(Date.now() - 40 * DAY);
    await backdateTenant(tenantId, createdAt);
    process.env.SUPERVISOR_URL = STUB_URL;

    await runSupervisorSyncCycle({ adminDb: admin.db });

    const sent = registerBodies.find((b) => b.tenantId === tenantId);
    expect(sent?.tenantCreatedAt).toBe(createdAt.toISOString());
    const s = await settingsOf(tenantId);
    expect(s?.subscriptionExpiresAt?.getTime()).toBe(createdAt.getTime() + TRIAL_DAYS * DAY);
  });

  test('404 → qayta ro‘yxat: sinovi tugagan tenant yangi 30 kun olmaydi', async () => {
    const tenantId = await registerTenant('lost-trial');
    const createdAt = new Date(Date.now() - 60 * DAY);
    await backdateTenant(tenantId, createdAt);
    // Supervisor avval bilardi (saqlangan muddat = sinov oxiri), keyin yo'qotdi (404).
    const trialEnd = new Date(createdAt.getTime() + TRIAL_DAYS * DAY);
    await setState(tenantId, crypto.randomUUID(), trialEnd);
    process.env.SUPERVISOR_URL = STUB_URL;

    expect(await syncTenantSubscription(db, tenantId)).toBe(true);

    const sent = registerBodies.find((b) => b.tenantId === tenantId);
    expect(sent?.tenantCreatedAt).toBe(createdAt.toISOString());
    const s = await settingsOf(tenantId);
    expect(s?.subscriptionExpiresAt?.getTime()).toBe(trialEnd.getTime());
    expect(s?.supervisorClinicId).toBe(store.get(tenantId)?.clinicId);
  });

  test('404 → qayta ro‘yxat: saqlangan ancha kech (to‘langan) muddat qisqartirilmaydi', async () => {
    const tenantId = await registerTenant('lost-paid');
    await backdateTenant(tenantId, new Date(Date.now() - 200 * DAY));
    const paidUntil = new Date(Date.now() + 150 * DAY);
    await setState(tenantId, crypto.randomUUID(), paidUntil);
    process.env.SUPERVISOR_URL = STUB_URL;

    expect(await syncTenantSubscription(db, tenantId)).toBe(true);

    const s = await settingsOf(tenantId);
    expect(s?.subscriptionExpiresAt?.getTime()).toBe(paidUntil.getTime());
    // Yangi clinicId baribir saqlanadi (keyingi sinxron shu klinikani so'raydi).
    expect(s?.supervisorClinicId).toBe(store.get(tenantId)?.clinicId);
  });

  test('oddiy sinxron (Supervisor biladi): vendor qisqartirgan muddat QABUL qilinadi', async () => {
    const tenantId = await registerTenant('known');
    process.env.SUPERVISOR_URL = STUB_URL;
    const shorter = new Date(Date.now() + 3 * DAY);
    const clinicId = crypto.randomUUID();
    store.set(tenantId, { clinicId, subscriptionExpiresAt: shorter.toISOString() });
    await setState(tenantId, clinicId, new Date(Date.now() + 150 * DAY));

    expect(await syncTenantSubscription(db, tenantId)).toBe(true);
    expect((await settingsOf(tenantId))?.subscriptionExpiresAt?.getTime()).toBe(shorter.getTime());
  });
});
