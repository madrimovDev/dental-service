/**
 * UI-M3 — GET /api/tenant-settings/readiness. Real DB + real HTTP (createApp),
 * cheklangan permset (tenant_settings.view bor / yo'q) — @owner EMAS.
 *
 * Ishga tushirish:
 *   cd apps/api && bun test --env-file=../../.env tests/integration/ui-m3-readiness.test.ts
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import {
  branches,
  roles,
  servicePrices,
  services,
  tenants,
  userAssignments,
  users,
} from '@dental/db-schema';
import { sql } from 'drizzle-orm';
import type { Context } from 'hono';
import { createApp } from '../../src/app.ts';
import type { DbOrTx } from '../../src/db/client.ts';
import { db } from '../../src/db/client.ts';
import { signAccess } from '../../src/lib/jwt.ts';
import { createReadinessService } from '../../src/modules/tenant-settings/readiness.service.ts';

let tenantId: string;
let ownerId: string;
let branchId: string;
let viewToken: string;
let noPermToken: string;

const withTenant = async <T>(fn: (tx: DbOrTx) => Promise<T>): Promise<T> =>
  db.transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
    return fn(tx);
  });

const ctx = (tx: DbOrTx): Context =>
  ({
    get: (k: string) => (k === 'db' ? tx : k === 'activeTenantId' ? tenantId : undefined),
  }) as unknown as Context;

beforeAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
  const [owner] = await db
    .insert(users)
    .values({ phone: '+998900000730', passwordHash: 'fake', fullName: 'Owner' })
    .returning({ id: users.id });
  if (!owner) throw new Error('owner');
  ownerId = owner.id;
  const [tenant] = await db
    .insert(tenants)
    .values({ name: 'UIM3 Clinic', slug: 'uim3-clinic', ownerUserId: ownerId })
    .returning({ id: tenants.id });
  if (!tenant) throw new Error('tenant');
  tenantId = tenant.id;
  await withTenant(async (tx) => {
    const [b] = await tx
      .insert(branches)
      .values({ tenantId, name: 'B1' })
      .returning({ id: branches.id });
    if (!b) throw new Error('branch');
    branchId = b.id;
  });
  const mint = async (perms: string[]) =>
    (
      await signAccess({
        sub: ownerId,
        atid: tenantId,
        abid: branchId,
        perms,
        roleKey: null,
        lang: 'uz',
      })
    ).token;
  viewToken = await mint(['tenant_settings.view']);
  noPermToken = await mint(['patient.view']);
});

afterAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
});

const get = (token: string) =>
  createApp().request('/api/tenant-settings/readiness', {
    headers: { authorization: `Bearer ${token}`, 'x-real-ip': '10.7.3.1' },
  });

type Items = { key: string; ok: boolean }[];
const okMap = (items: Items) => Object.fromEntries(items.map((i) => [i.key, i.ok]));

describe('UI-M3 readiness', () => {
  test("ruxsatsiz rol 403; tenant_settings.view bilan 200 (cloud: backup elementi yo'q)", async () => {
    expect((await get(noPermToken)).status).toBe(403);
    const res = await get(viewToken);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { items: Items } };
    const m = okMap(body.data.items);
    expect(m.workHours).toBe(false);
    expect(m.servicePrices).toBe(false);
    expect(m.channel).toBe(false);
    expect('backup' in m).toBe(false);
    expect(m.license).toBe(true); // trial
  });

  test("sozlangach elementlar ok bo'ladi (real DB)", async () => {
    await withTenant(async (tx) => {
      await tx.execute(
        sql`UPDATE branches SET work_hours = ${JSON.stringify({ mon: { open: '09:00', close: '18:00' } })}::jsonb`,
      );
      const [s] = await tx
        .insert(services)
        .values({ tenantId, code: 'S-M3', nameUz: 'X' })
        .returning({ id: services.id });
      if (!s) throw new Error('svc');
      await tx.insert(servicePrices).values({ tenantId, serviceId: s.id, branchId, price: '1000' });
      const [r] = await tx
        .insert(roles)
        .values({ tenantId, name: 'R', isSystem: false } as never)
        .returning({ id: roles.id });
      if (!r) throw new Error('role');
      await tx.insert(userAssignments).values({ userId: ownerId, tenantId, roleId: r.id });
      await tx.execute(
        sql`INSERT INTO tenant_settings (tenant_id, integration_settings) VALUES (${tenantId}, ${JSON.stringify({ sms: { eskizPasswordEnc: 'x' } })}::jsonb)`,
      );
    });
    const body = (await (await get(viewToken)).json()) as { data: { items: Items } };
    const m = okMap(body.data.items);
    expect(m.workHours).toBe(true);
    expect(m.doctorSchedule).toBe(true); // fallback
    expect(m.servicePrices).toBe(true);
    expect(m.channel).toBe(true);
    expect(m.staff).toBe(false); // faqat 1 xodim
  });

  test("desktop: backup elementi lastSuccessAt bo'yicha; litsenziya holati", async () => {
    const run = (last: string | null, state: 'active' | 'expired') =>
      withTenant((tx) =>
        createReadinessService({
          isDesktop: () => true,
          getLicenseState: async () => ({ state, expiresAt: null, graceEndsAt: null, daysLeft: 5 }),
          readBackupLastSuccess: async () => last,
        }).compute(ctx(tx)),
      );
    const a = okMap((await run('2026-11-10T20:00:00Z', 'active')).items);
    expect(a.backup).toBe(true);
    expect(a.license).toBe(true);
    const b = okMap((await run(null, 'expired')).items);
    expect(b.backup).toBe(false);
    expect(b.license).toBe(false);
  });
});
