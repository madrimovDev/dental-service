/**
 * FX-169 — BOM qtyPerService 2 xonali aniqlikka yaxlitlanib 0.00 bo'lib qolmasin.
 * REAL DB + REAL HTTP (createApp) + real cheklangan rol (ombor: stock.view/stock.manage).
 *
 * Run: cd apps/api && bun test --env-file=../../.env --timeout 30000 tests/integration/fx-169-bom-qty.test.ts
 */
import { beforeAll, describe, expect, test } from 'bun:test';
import {
  branches,
  permissions,
  rolePermissions,
  roles,
  serviceMaterials,
  services,
  stockItems,
  tenants,
  userAssignments,
  users,
} from '@dental/db-schema';
import { eq, inArray, sql } from 'drizzle-orm';
import { createApp } from '../../src/app.ts';
import { createAdminDb, db } from '../../src/db/client.ts';
import { signAccess } from '../../src/lib/jwt.ts';

const app = createApp();
const admin = createAdminDb();

const STORE_PERMS = ['stock.view', 'stock.manage'];

let tenantId: string;
let storeId: string;
let storeToken: string;
let item: string;
let svcX: string;

const call = async (method: string, path: string, body?: unknown) => {
  const res = await app.request(path, {
    method,
    headers: {
      Authorization: `Bearer ${storeToken}`,
      'Content-Type': 'application/json',
      'x-real-ip': `10.169.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return {
    status: res.status,
    json: (await res.json().catch(() => null)) as { data?: any; error?: any } | null,
  };
};

beforeAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
  const mk = async (phone: string) =>
    (
      await db
        .insert(users)
        .values({ phone, passwordHash: 'x', fullName: phone })
        .returning({ id: users.id })
    )[0]!.id;
  const owner = await mk('+9989006101');
  storeId = await mk('+9989006102');
  for (const code of STORE_PERMS) {
    await db
      .insert(permissions)
      .values({ code, category: code.split('.')[0]! })
      .onConflictDoNothing();
  }
  const permRows = await db
    .select({ id: permissions.id })
    .from(permissions)
    .where(inArray(permissions.code, STORE_PERMS));
  tenantId = (
    await db
      .insert(tenants)
      .values({ name: 'FXT', slug: 'fx-fx-169', ownerUserId: owner })
      .returning({ id: tenants.id })
  )[0]!.id;
  await db.transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
    await tx.insert(branches).values({ tenantId, name: 'Asosiy' });
    const [role] = await tx
      .insert(roles)
      .values({ tenantId, name: 'R-store' })
      .returning({ id: roles.id });
    await tx
      .insert(rolePermissions)
      .values(permRows.map((p) => ({ roleId: role!.id, permissionId: p.id })));
    await tx
      .insert(userAssignments)
      .values({ tenantId, userId: storeId, branchId: null, roleId: role!.id });
    item = (
      await tx
        .insert(stockItems)
        .values({
          tenantId,
          branchId: null,
          name: 'Plomba',
          unit: 'dona',
          quantity: '10',
          minThreshold: '1',
        })
        .returning({ id: stockItems.id })
    )[0]!.id;
    svcX = (
      await tx
        .insert(services)
        .values({ tenantId, code: 'XT', nameUz: 'X' })
        .returning({ id: services.id })
    )[0]!.id;
  });
  storeToken = (
    await signAccess({
      sub: storeId,
      atid: tenantId,
      abid: null,
      perms: STORE_PERMS,
      roleKey: null,
      lang: 'uz',
    })
  ).token;
});

describe('FX-169: BOM qtyPerService yaxlitlanib 0.00 bo\u2018lmasin', () => {
  test('0.001 / 0.004 / 0 / manfiy \u2014 400, qator yozilmaydi', async () => {
    for (const q of [0.001, 0.004, 0, -1]) {
      const r = await call('POST', '/api/stock/bom', {
        serviceId: svcX,
        itemId: item,
        qtyPerService: q,
      });
      expect(r.status).toBe(400);
    }
    const rows = await admin.db
      .select()
      .from(serviceMaterials)
      .where(eq(serviceMaterials.serviceId, svcX));
    expect(rows.length).toBe(0);
  });

  test('2 xonadan ortiq aniqlik (1.234) \u2014 400; 0.01 va 1.25 \u2014 201, aynan shu qiymat saqlanadi', async () => {
    const bad = await call('POST', '/api/stock/bom', {
      serviceId: svcX,
      itemId: item,
      qtyPerService: 1.234,
    });
    expect(bad.status).toBe(400);
    const ok = await call('POST', '/api/stock/bom', {
      serviceId: svcX,
      itemId: item,
      qtyPerService: 0.01,
    });
    expect(ok.status).toBe(201);
    expect(ok.json?.data.qtyPerService).toBe('0.01');
    await admin.db.delete(serviceMaterials).where(eq(serviceMaterials.serviceId, svcX));
    const ok2 = await call('POST', '/api/stock/bom', {
      serviceId: svcX,
      itemId: item,
      qtyPerService: 1.25,
    });
    expect(ok2.status).toBe(201);
    expect(ok2.json?.data.qtyPerService).toBe('1.25');
  });
});
