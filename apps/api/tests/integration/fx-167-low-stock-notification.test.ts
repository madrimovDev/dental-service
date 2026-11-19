/**
 * FX-167 — stock.low_threshold bildirishnomasi type + params bilan saqlanadi (web t() bilan render qiladi).
 * REAL DB + REAL HTTP (createApp) + real cheklangan rol (ombor: stock.view/stock.manage).
 *
 * Run: cd apps/api && bun test --env-file=../../.env --timeout 30000 tests/integration/fx-167-low-stock-notification.test.ts
 */
import { beforeAll, describe, expect, test } from 'bun:test';
import {
  branches,
  notifications,
  permissions,
  rolePermissions,
  roles,
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
      'x-real-ip': `10.167.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`,
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
  const owner = await mk('+9989006201');
  storeId = await mk('+9989006202');
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
      .values({ name: 'FXT', slug: 'fx-fx-167', ownerUserId: owner })
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

describe('FX-167: stock.low_threshold bildirishnomasi type + params saqlaydi', () => {
  test('qoldiq chegaradan tushganda params {itemId,itemName,qty,min} yoziladi, title/body fallback saqlanadi', async () => {
    await admin.db.delete(notifications).where(eq(notifications.tenantId, tenantId));
    const r = await call('POST', '/api/stock/movements', {
      itemId: item,
      type: 'out',
      quantity: 9.5,
    });
    expect(r.status).toBe(201);
    const rows = await admin.db
      .select()
      .from(notifications)
      .where(eq(notifications.type, 'stock.low_threshold'));
    expect(rows.length).toBeGreaterThan(0);
    for (const n of rows) {
      expect(n.params).toEqual({ itemId: item, itemName: 'Plomba', qty: 0.5, min: 1 });
      expect(n.title).toContain('Plomba');
    }
  });

  test('feed DTO params ni qaytaradi (ombor foydalanuvchisi o\u2018z bildirishnomasini ko\u2018radi)', async () => {
    const feed = await call('GET', '/api/notifications');
    expect(feed.status).toBe(200);
    const mine = feed.json?.data.data.find(
      (n: { type: string }) => n.type === 'stock.low_threshold',
    );
    expect(mine).toBeTruthy();
    expect(mine.params).toEqual({ itemId: item, itemName: 'Plomba', qty: 0.5, min: 1 });
  });
});
