/**
 * FX-144 (LC-22): SaaS obuna holatining yagona manbai — `tenant_settings.subscription_expires_at`
 * (Supervisor'dan sinxronlanadi, HTTP/worker bloki shundan hisoblanadi). `tenants.subscription_status`
 * esa hech kim yangilamaydigan ustun (default `trial`) edi: to'lagan klinika Sozlamalarda
 * abadiy «Sinov», imtiyozdagi klinikaning tayyorlik ro'yxatida «Obuna» ✔ ko'rinardi.
 *
 * Endi GET /api/tenant `subscriptionStatus` va readiness `license` bandi saqlangan muddatdan
 * hisoblanadi; muddat NOMA'LUM (Supervisor ro'yxatga olmagan) → eski ustun qiymati.
 * Real DB + real HTTP (createApp), Tenant Admin shablon permset'i (owner EMAS).
 *
 *   cd apps/api && bun test tests/integration/fx-144-subscription-status-source.test.ts --env-file=../../.env
 */
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { ROLE_TEMPLATES } from '@dental/core';
import { branches, tenantSettings, tenants, users } from '@dental/db-schema';
import { sql } from 'drizzle-orm';
import { createApp } from '../../src/app.ts';
import { db } from '../../src/db/client.ts';
import { withTenant } from '../../src/db/scoped.ts';
import { signAccess } from '../../src/lib/jwt.ts';
import { invalidateSubscriptionCache } from '../../src/lib/subscription.ts';

const DAY = 86_400_000;
const adminPerms = [
  ...(ROLE_TEMPLATES.find((t) => t.templateKey === 'tenant_admin')?.permissions ?? []),
];
const savedDesktop = process.env.DENTAL_LOCAL_DESKTOP;

let ownerId: string;
let adminUserId: string;
const tokens: Record<string, string> = {};

const seedTenant = async (key: string, expiresAt: Date | null) => {
  const [t] = await db
    .insert(tenants)
    .values({ name: key, slug: `fx144-${key}`, ownerUserId: ownerId })
    .returning({ id: tenants.id });
  const tenantId = t!.id;
  const branchId = await withTenant(tenantId, async (tx) => {
    await tx.insert(tenantSettings).values({ tenantId, subscriptionExpiresAt: expiresAt });
    const [b] = await tx.insert(branches).values({ tenantId, name: 'B' }).returning();
    return b!.id;
  });
  tokens[key] = (
    await signAccess({
      sub: adminUserId,
      atid: tenantId,
      abid: branchId,
      perms: adminPerms,
      roleKey: 'tenant_admin',
      lang: 'uz',
    })
  ).token;
};

const call = (key: string, path: string) =>
  createApp().request(path, {
    headers: { authorization: `Bearer ${tokens[key]}`, 'x-real-ip': crypto.randomUUID() },
  });

const statusOf = async (key: string) => {
  const res = await call(key, '/api/tenant');
  expect(res.status).toBe(200);
  return ((await res.json()) as { data: { subscriptionStatus: string } }).data.subscriptionStatus;
};

const licenseOk = async (key: string) => {
  const res = await call(key, '/api/tenant-settings/readiness');
  expect(res.status).toBe(200);
  const items = ((await res.json()) as { data: { items: { key: string; ok: boolean }[] } }).data
    .items;
  return items.find((i) => i.key === 'license')?.ok;
};

beforeAll(async () => {
  delete process.env.DENTAL_LOCAL_DESKTOP; // SaaS
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
  const [owner] = await db
    .insert(users)
    .values({ phone: '+998900000144', passwordHash: 'x', fullName: 'Owner' })
    .returning({ id: users.id });
  const [adm] = await db
    .insert(users)
    .values({ phone: '+998900001144', passwordHash: 'x', fullName: 'Admin' })
    .returning({ id: users.id });
  ownerId = owner!.id;
  adminUserId = adm!.id;
  await seedTenant('paid', new Date(Date.now() + 200 * DAY));
  await seedTenant('expiring', new Date(Date.now() + 3 * DAY));
  // Muddat o'tgan, lekin 7 kunlik imtiyoz ichida — ishlaydi, lekin «tayyor» emas.
  await seedTenant('grace', new Date(Date.now() - 2 * DAY));
  await seedTenant('unknown', null);
});

afterAll(async () => {
  if (savedDesktop === undefined) delete process.env.DENTAL_LOCAL_DESKTOP;
  else process.env.DENTAL_LOCAL_DESKTOP = savedDesktop;
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
});

beforeEach(() => invalidateSubscriptionCache());

describe('FX-144 GET /api/tenant subscriptionStatus — saqlangan muddatdan', () => {
  test('Supervisor muddati faol → active (ustun `trial` bo`lsa ham)', async () => {
    expect(await statusOf('paid')).toBe('active');
    expect(await statusOf('expiring')).toBe('active');
    expect(await statusOf('grace')).toBe('active');
  });

  test('muddat noma`lum → eski ustun qiymati (trial)', async () => {
    expect(await statusOf('unknown')).toBe('trial');
  });
});

describe('FX-144 readiness `license` — saqlangan muddatdan (desktop bilan bir xil qoida)', () => {
  test('faol / tugashiga oz qolgan → ok', async () => {
    expect(await licenseOk('paid')).toBe(true);
    expect(await licenseOk('expiring')).toBe(true);
  });

  test('imtiyoz davri → ok emas', async () => {
    expect(await licenseOk('grace')).toBe(false);
  });

  test('muddat noma`lum → ustun bo`yicha (trial → ok)', async () => {
    expect(await licenseOk('unknown')).toBe(true);
  });
});
