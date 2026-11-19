/**
 * FX-101 (LB-10): SaaS blok ekranidagi «Qayta tekshirish» access token muddati
 * o'tgach ham ishlashi kerak.
 *
 * Avval: muddati o'tgan (lekin imzosi yaroqli) Bearer → `tenantIdFromBearer`
 * null → recheck 404 → web «hali ham tugagan» deydi, api-client refresh qilmaydi
 * (refresh faqat 401 `auth.invalid_token` da). Endi: Bearer bor, lekin
 * yaroqsiz/muddati o'tgan → 401 `auth.invalid_token` — api-client refresh qilib
 * qayta urinadi; yangi token bilan recheck Supervisor'dan uzaytirilgan muddatni
 * oladi va blok yechiladi. Token umuman yo'q → avvalgidek 404.
 *
 * Real DB (register-tenant, tenant_settings) + haqiqiy HTTP Supervisor stub.
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { tenantSettings } from '@dental/db-schema';
import { sql } from 'drizzle-orm';
import { sign } from 'hono/jwt';
import { createApp } from '../../src/app.ts';
import { createAdminDb, db } from '../../src/db/client.ts';
import { env } from '../../src/lib/env.ts';
import { signAccess } from '../../src/lib/jwt.ts';
import { closeRateLimitRedis } from '../../src/lib/rate-limit.ts';
import { invalidateSubscriptionCache } from '../../src/lib/subscription.ts';

const TOKEN = 'fx101-saas-test-token-0123456789-abcdefghij';
const DAY = 86_400_000;
const admin = createAdminDb();
const app = createApp();

const store = new Map<string, { clinicId: string; subscriptionExpiresAt: string }>();
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

const recheck = (headers: Record<string, string>) =>
  app.request('/api/license/recheck', { method: 'POST', headers });

describe('FX-101 — SaaS recheck muddati o‘tgan access token bilan', () => {
  test('muddati o‘tgan Bearer → 401 auth.invalid_token (refresh-retry), yangi token → blok yechiladi', async () => {
    const phone = `+99893${String(Math.floor(Math.random() * 9_000_000) + 1_000_000)}`;
    const reg = await app.request('/api/auth/register-tenant', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-forwarded-for': `10.101.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250) + 1}`,
      },
      body: JSON.stringify({
        tenantName: 'FX101 klinika',
        ownerPhone: phone,
        ownerFullName: 'FX101 Owner',
        ownerPassword: 'CorrectHorseBattery1',
        defaultLanguage: 'uz',
      }),
    });
    expect(reg.status).toBe(201);
    const tenantId = ((await reg.json()) as { data: { tenantId: string } }).data.tenantId;

    // Lokal muddat o'tgan (vendor Supervisor'da allaqachon uzaytirgan, sinxron hali yo'q).
    await admin.db
      .insert(tenantSettings)
      .values({ tenantId, subscriptionExpiresAt: new Date(Date.now() - 30 * DAY) })
      .onConflictDoUpdate({
        target: tenantSettings.tenantId,
        set: { subscriptionExpiresAt: new Date(Date.now() - 30 * DAY) },
      });
    invalidateSubscriptionCache(tenantId);

    // Imzosi yaroqli, lekin 1 soat oldin tugagan access token.
    const now = Math.floor(Date.now() / 1000);
    const expired = await sign(
      {
        sub: crypto.randomUUID(),
        atid: tenantId,
        abid: null,
        perms: ['@owner'],
        roleKey: null,
        lang: 'uz',
        iat: now - 7200,
        exp: now - 3600,
        jti: crypto.randomUUID(),
      },
      env.JWT_SECRET,
      'HS256',
    );

    const stale = await recheck({
      Authorization: `Bearer ${expired}`,
      'x-forwarded-for': '10.101.0.2',
    });
    expect(stale.status).toBe(401);
    expect(((await stale.json()) as { error: { code: string } }).error.code).toBe(
      'auth.invalid_token',
    );

    // api-client refresh'dan keyingi qayta urinish (yangi access token).
    const { token: fresh } = await signAccess({
      sub: crypto.randomUUID(),
      atid: tenantId,
      abid: null,
      perms: ['@owner'],
      roleKey: null,
      lang: 'uz',
    });
    const ok = await recheck({ Authorization: `Bearer ${fresh}`, 'x-forwarded-for': '10.101.0.3' });
    expect(ok.status).toBe(200);
    // 14 kunlik muddat = `expiring` — web blok ekrani active/expiring/grace'da ochadi.
    const state = ((await ok.json()) as { data: { state: string } }).data.state;
    expect(['active', 'expiring', 'grace']).toContain(state);
  });

  test('Bearer umuman yo‘q → avvalgidek 404', async () => {
    const anon = await recheck({ 'x-forwarded-for': '10.101.0.4' });
    expect(anon.status).toBe(404);
  });
});
