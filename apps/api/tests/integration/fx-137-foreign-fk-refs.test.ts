/**
 * FX-137 (LC-15) — ombor (stockItems.branchId), jadval (doctorId/branchId), xizmat narxi
 * (branchId/serviceId) begona tenant UUID'sini FK orqali qabul qilmasligi kerak. FK RLS'ni
 * chetlab o'tadi. REAL DB + REAL HTTP + real cheklangan rol (@owner emas). service_prices
 * RLS WITH CHECK'i begona branch'ga qarshi DB darajasida ham tekshiriladi.
 *
 * Run: cd apps/api && bun test --env-file=../../.env --timeout 30000 tests/integration/fx-137-foreign-fk-refs.test.ts
 */
import { beforeAll, describe, expect, test } from 'bun:test';
import {
  branches,
  permissions,
  rolePermissions,
  roles,
  servicePrices,
  services,
  stockItems,
  tenants,
  userAssignments,
  users,
} from '@dental/db-schema';
import { eq, inArray, sql } from 'drizzle-orm';
import { createApp } from '../../src/app.ts';
import { db } from '../../src/db/client.ts';
import { signAccess } from '../../src/lib/jwt.ts';

const PERMS = ['stock.manage', 'stock.view', 'schedule.manage', 'schedule.view', 'service.manage'];
const app = createApp();

let tenantId: string;
let tenant2: string;
let brA: string;
let foreignBranch: string;
let foreignService: string;
let ownService: string;
let docA: string;
let foreignDoc: string;
let itemId: string;
const tok: Record<string, string> = {};

const call = async (who: string, method: string, path: string, body?: unknown) => {
  const res = await app.request(path, {
    method,
    headers: {
      Authorization: `Bearer ${tok[who]}`,
      'Content-Type': 'application/json',
      'x-real-ip': `10.137.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, json: (await res.json().catch(() => null)) as any };
};

const inTenant = async <T>(tid: string, fn: (tx: any) => Promise<T>): Promise<T> =>
  db.transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tid}'`));
    return fn(tx);
  });

beforeAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
  const mk = async (phone: string) =>
    (
      await db
        .insert(users)
        .values({ phone, passwordHash: 'x', fullName: phone })
        .returning({ id: users.id })
    )[0]!.id;
  const owner = await mk('+998900013701');
  const mgr = await mk('+998900013702');
  docA = await mk('+998900013703');
  const owner2 = await mk('+998900013704');
  foreignDoc = await mk('+998900013705');

  for (const code of PERMS) {
    await db.insert(permissions).values({ code, category: 'x' }).onConflictDoNothing();
  }
  const permRows = await db
    .select({ id: permissions.id })
    .from(permissions)
    .where(inArray(permissions.code, PERMS));

  tenantId = (
    await db
      .insert(tenants)
      .values({ name: 'FX137', slug: 'fx-137-a', ownerUserId: owner })
      .returning({ id: tenants.id })
  )[0]!.id;
  tenant2 = (
    await db
      .insert(tenants)
      .values({ name: 'FX137-B', slug: 'fx-137-b', ownerUserId: owner2 })
      .returning({ id: tenants.id })
  )[0]!.id;

  await inTenant(tenant2, async (tx) => {
    foreignBranch = (
      await tx.insert(branches).values({ tenantId: tenant2, name: 'Begona' }).returning()
    )[0]!.id;
    foreignService = (
      await tx
        .insert(services)
        .values({ tenantId: tenant2, nameUz: 'Begona xizmat', code: 'F1' })
        .returning()
    )[0]!.id;
    const [r] = await tx.insert(roles).values({ tenantId: tenant2, name: 'Doc' }).returning();
    await tx
      .insert(userAssignments)
      .values({ tenantId: tenant2, userId: foreignDoc, branchId: foreignBranch, roleId: r.id });
  });

  await inTenant(tenantId, async (tx) => {
    brA = (await tx.insert(branches).values({ tenantId, name: 'A' }).returning())[0]!.id;
    ownService = (
      await tx.insert(services).values({ tenantId, nameUz: 'Xizmat', code: 'S1' }).returning()
    )[0]!.id;
    const [mgrRole] = await tx.insert(roles).values({ tenantId, name: 'Mudir' }).returning();
    await tx
      .insert(rolePermissions)
      .values(permRows.map((p) => ({ roleId: mgrRole!.id, permissionId: p.id })));
    await tx.insert(userAssignments).values([
      { tenantId, userId: mgr, branchId: null, roleId: mgrRole!.id },
      { tenantId, userId: docA, branchId: brA, roleId: mgrRole!.id },
    ]);
    itemId = (
      await tx
        .insert(stockItems)
        .values({ tenantId, branchId: brA, name: 'Paxta', unit: 'dona' })
        .returning()
    )[0]!.id;
  });

  tok.mgr = (
    await signAccess({
      sub: mgr,
      atid: tenantId,
      abid: null,
      perms: PERMS,
      roleKey: null,
      lang: 'uz',
    })
  ).token;
});

const MISSING = '00000000-0000-4000-8000-000000000137';

describe('FX-137: ombor item branchId', () => {
  test('POST /stock/items begona/yo‘q branchId → 404 ownership.branch.not_found, item yaratilmaydi', async () => {
    for (const branchId of [foreignBranch, MISSING]) {
      const r = await call('mgr', 'POST', '/api/stock/items', {
        branchId,
        name: 'X',
        unit: 'dona',
        quantity: 0,
        minThreshold: 0,
      });
      expect(r.status).toBe(404);
      expect(r.json.error.code).toBe('ownership.branch.not_found');
    }
    const n = await inTenant(tenantId, async (tx) => (await tx.select().from(stockItems)).length);
    expect(n).toBe(1);
  });

  test('PATCH /stock/items/{id} begona branchId → 404, filial o‘zgarmaydi; o‘z filiali 200', async () => {
    const r = await call('mgr', 'PATCH', `/api/stock/items/${itemId}`, { branchId: foreignBranch });
    expect(r.status).toBe(404);
    expect(r.json.error.code).toBe('ownership.branch.not_found');
    const row = await inTenant(
      tenantId,
      async (tx) => (await tx.select().from(stockItems).where(eq(stockItems.id, itemId)))[0],
    );
    expect(row.branchId).toBe(brA);
    const ok = await call('mgr', 'PATCH', `/api/stock/items/${itemId}`, { branchId: brA });
    expect(ok.status).toBe(200);
  });
});

describe('FX-137: jadval doctorId/branchId', () => {
  test('PUT working-hours begona branchId → 400 ownership.branch.not_found', async () => {
    const r = await call('mgr', 'PUT', `/api/schedule/doctors/${docA}/working-hours`, {
      branchId: foreignBranch,
      segments: [{ weekday: 1, start: '09:00', end: '12:00' }],
    });
    expect(r.status).toBe(400);
    expect(r.json.error.code).toBe('ownership.branch.not_found');
  });

  test('PUT working-hours begona doctorId (shu tenantda tayinlovi yo‘q) → 400 ownership.user.not_found', async () => {
    const r = await call('mgr', 'PUT', `/api/schedule/doctors/${foreignDoc}/working-hours`, {
      branchId: brA,
      segments: [{ weekday: 1, start: '09:00', end: '12:00' }],
    });
    expect(r.status).toBe(400);
    expect(r.json.error.code).toBe('ownership.user.not_found');
  });

  test('POST time-off begona doctorId/branchId → 400; o‘z doctor+branch 201', async () => {
    const base = {
      type: 'other',
      startAt: '2026-12-01T09:00:00.000Z',
      endAt: '2026-12-01T10:00:00.000Z',
    };
    const d = await call('mgr', 'POST', '/api/schedule/time-off', {
      ...base,
      doctorId: foreignDoc,
      branchId: brA,
    });
    expect(d.status).toBe(400);
    expect(d.json.error.code).toBe('ownership.user.not_found');
    const b = await call('mgr', 'POST', '/api/schedule/time-off', {
      ...base,
      doctorId: docA,
      branchId: foreignBranch,
    });
    expect(b.status).toBe(400);
    expect(b.json.error.code).toBe('ownership.branch.not_found');
    const ok = await call('mgr', 'POST', '/api/schedule/time-off', {
      ...base,
      doctorId: docA,
      branchId: brA,
    });
    expect(ok.status).toBe(201);
    const okAll = await call('mgr', 'POST', '/api/schedule/time-off', { ...base, doctorId: docA });
    expect(okAll.status).toBe(201);
  });

  test('PUT working-hours o‘z doctor+branch 200', async () => {
    const r = await call('mgr', 'PUT', `/api/schedule/doctors/${docA}/working-hours`, {
      branchId: brA,
      segments: [{ weekday: 1, start: '09:00', end: '12:00' }],
    });
    expect(r.status).toBe(200);
  });
});

describe('FX-137: xizmat narxi branchId/serviceId', () => {
  test('POST /services/{id}/prices begona branchId → 404 ownership.branch.not_found, narx yozilmaydi', async () => {
    const r = await call('mgr', 'POST', `/api/services/${ownService}/prices`, {
      branchId: foreignBranch,
      price: 50000,
    });
    expect(r.status).toBe(404);
    expect(r.json.error.code).toBe('ownership.branch.not_found');
    const n = await inTenant(
      tenantId,
      async (tx) => (await tx.select().from(servicePrices)).length,
    );
    expect(n).toBe(0);
  });

  test('POST /services/{begona}/prices → 404 ownership.service.not_found', async () => {
    const r = await call('mgr', 'POST', `/api/services/${foreignService}/prices`, {
      branchId: brA,
      price: 50000,
    });
    expect(r.status).toBe(404);
    expect(r.json.error.code).toBe('ownership.service.not_found');
  });

  test('o‘z xizmat+filial narxi 201', async () => {
    const r = await call('mgr', 'POST', `/api/services/${ownService}/prices`, {
      branchId: brA,
      price: 50000,
    });
    expect(r.status).toBe(201);
  });

  test('DB WITH CHECK: app roli begona filial uchun service_prices qatorini to‘g‘ridan insert qila olmaydi', async () => {
    let err: unknown = null;
    try {
      await inTenant(tenantId, async (tx) => {
        await tx
          .insert(servicePrices)
          .values({ serviceId: ownService, branchId: foreignBranch, price: '1' });
      });
    } catch (e) {
      err = e;
    }
    expect(err).not.toBeNull();
    expect(String((err as any)?.cause?.code ?? (err as any)?.code)).toBe('42501');
  });
});
