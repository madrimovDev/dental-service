/**
 * FX-102 (LB-11): Supervisor SaaS klinikani to'xtatsa (`suspendedAt`), apps/api
 * tenantni IMTIYOZSIZ bloklaydi — obuna muddati kelajakda bo'lsa ham. Vendor
 * «Muddatni uzaytirish» qilgach (`suspendedAt: null`) blok yechiladi.
 *
 * Real DB (tenant_settings, license gate) + haqiqiy HTTP Supervisor stub.
 * Token — cheklangan rol ruxsatlari (owner emas): blok hammaga tegishi kerak.
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { sql } from 'drizzle-orm';
import { createApp } from '../../src/app.ts';
import { createAdminDb, db } from '../../src/db/client.ts';
import { signAccess } from '../../src/lib/jwt.ts';
import { closeRateLimitRedis } from '../../src/lib/rate-limit.ts';
import { invalidateSubscriptionCache } from '../../src/lib/subscription.ts';
import { runSupervisorSyncCycle } from '../../src/lib/supervisor-saas.ts';

const TOKEN = 'fx102-saas-test-token-0123456789-abcdefghij';
const DAY = 86_400_000;
const admin = createAdminDb();
const app = createApp();

type StubClinic = { clinicId: string; subscriptionExpiresAt: string; suspendedAt: string | null };
const store = new Map<string, StubClinic>();
const stub = Bun.serve({
  port: 0,
  fetch: async (req) => {
    const url = new URL(req.url);
    if (req.headers.get('authorization') !== `Bearer ${TOKEN}`) {
      return Response.json({ error: { code: 'UNAUTHORIZED' } }, { status: 401 });
    }
    if (req.method === 'POST' && url.pathname === '/internal/saas/clinics') {
      const body = (await req.json()) as { tenantId: string };
      const created = {
        clinicId: crypto.randomUUID(),
        subscriptionExpiresAt: new Date(Date.now() + 60 * DAY).toISOString(),
        suspendedAt: null,
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

const saved = {
  url: process.env.SUPERVISOR_URL,
  token: process.env.SUPERVISOR_SAAS_TOKEN,
  desktop: process.env.DENTAL_LOCAL_DESKTOP,
};
const restore = (k: string, v: string | undefined) => {
  if (v === undefined) delete process.env[k];
  else process.env[k] = v;
};

beforeAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
  delete process.env.DENTAL_LOCAL_DESKTOP;
  process.env.SUPERVISOR_SAAS_TOKEN = TOKEN;
  process.env.SUPERVISOR_URL = `http://127.0.0.1:${stub.port}`;
});

afterAll(async () => {
  stub.stop(true);
  restore('SUPERVISOR_URL', saved.url);
  restore('SUPERVISOR_SAAS_TOKEN', saved.token);
  restore('DENTAL_LOCAL_DESKTOP', saved.desktop);
  invalidateSubscriptionCache();
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
  await admin.client.end({ timeout: 5 });
  await closeRateLimitRedis();
});

// Rate-limit bucket'lari Redis'da saqlanadi — har yurgizishda yangi IP oralig'i.
const ipBase = `10.${100 + Math.floor(Math.random() * 150)}.${Math.floor(Math.random() * 250)}`;
let ipSeq = 0;
const registerTenant = async (label: string) => {
  const phone = `+99893${String(Math.floor(Math.random() * 9_000_000) + 1_000_000)}`;
  const res = await app.request('/api/auth/register-tenant', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': `${ipBase}.${++ipSeq}` },
    body: JSON.stringify({
      tenantName: `FX102 ${label}`,
      ownerPhone: phone,
      ownerFullName: `FX102 Owner ${label}`,
      ownerPassword: 'CorrectHorseBattery1',
      defaultLanguage: 'uz',
    }),
  });
  expect(res.status).toBe(201);
  return ((await res.json()) as { data: { tenantId: string } }).data.tenantId;
};

/** Receptionist'ga o'xshash cheklangan ruxsatlar — `@owner` emas. */
const staffToken = async (tenantId: string) =>
  (
    await signAccess({
      sub: crypto.randomUUID(),
      atid: tenantId,
      abid: null,
      perms: ['patient.view', 'appointment.view'],
      roleKey: 'receptionist',
      lang: 'uz',
    })
  ).token;

const recheck = async (token: string) => {
  const res = await app.request('/api/license/recheck', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'x-forwarded-for': `${ipBase}.${++ipSeq}` },
  });
  expect(res.status).toBe(200);
  return ((await res.json()) as { data: { state: string } }).data.state;
};

const patients = (token: string) =>
  app.request('/api/patients', { headers: { Authorization: `Bearer ${token}` } });

describe('FX-102 — vendor to‘xtatgan SaaS tenant imtiyozsiz bloklanadi', () => {
  test('suspendedAt (muddat kelajakda) → expired + 403 LICENSE_EXPIRED; renew → blok yechiladi', async () => {
    const tenantId = await registerTenant('recheck');
    const token = await staffToken(tenantId);
    expect((await patients(token)).status).not.toBe(403);

    const clinic = store.get(tenantId) as StubClinic;
    clinic.suspendedAt = new Date().toISOString();
    expect(await recheck(token)).toBe('expired');
    const blocked = await patients(token);
    expect(blocked.status).toBe(403);
    expect(((await blocked.json()) as { error: { code: string } }).error.code).toBe(
      'LICENSE_EXPIRED',
    );

    // Vendor «Muddatni uzaytirish» — Supervisor to'xtatishni yechadi.
    clinic.suspendedAt = null;
    clinic.subscriptionExpiresAt = new Date(Date.now() + 365 * DAY).toISOString();
    expect(await recheck(token)).toBe('active');
    expect((await patients(token)).status).not.toBe(403);
  });

  test('davriy sinxron sikli ham to‘xtatishni qo‘llaydi', async () => {
    const tenantId = await registerTenant('cycle');
    const token = await staffToken(tenantId);
    const clinic = store.get(tenantId) as StubClinic;
    clinic.suspendedAt = new Date().toISOString();
    // Sinxron eskirgan deb hisoblanishi uchun `now` 21 soat keyin.
    await runSupervisorSyncCycle({ adminDb: admin.db, now: new Date(Date.now() + 21 * 3_600_000) });
    invalidateSubscriptionCache(tenantId);
    expect((await patients(token)).status).toBe(403);
  });
});
