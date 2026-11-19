/**
 * FX-115 (LB-24, D-8) + FX-35 (LA-11) — ombor filial doirasi va BOM avto-chiqimi filiali.
 * REAL DB + REAL HTTP (createApp) + real `user_assignments` + real cheklangan rol permset'lari.
 *
 * Run: cd apps/api && bun test --env-file=../../.env --timeout 30000 tests/integration/fx-35-115-stock-branch.test.ts
 */
import { beforeAll, describe, expect, test } from 'bun:test';
import {
  appointments,
  branches,
  patients,
  permissions,
  rolePermissions,
  roles,
  serviceMaterials,
  services,
  stockItems,
  stockMovements,
  tenants,
  userAssignments,
  users,
  visitNotes,
} from '@dental/db-schema';
import { eq, inArray, sql } from 'drizzle-orm';
import type { Context } from 'hono';
import { createApp } from '../../src/app.ts';
import type { DbOrTx } from '../../src/db/client.ts';
import { createAdminDb, db } from '../../src/db/client.ts';
import type { AuditLogger } from '../../src/lib/audit-logger.ts';
import { signAccess } from '../../src/lib/jwt.ts';
import { createStockService } from '../../src/modules/stock/stock.service.ts';

const STOCK_PERMS = ['stock.view', 'stock.manage'];
const app = createApp();
const admin = createAdminDb();

let tenantId: string;
let brA: string;
let brB: string;
let itemA: string;
let itemB: string;
let itemShared: string;
let svcId: string;
let docId: string;
const tok: Record<string, string> = {};

const call = async (who: string, method: string, path: string, body?: unknown) => {
  const res = await app.request(path, {
    method,
    headers: {
      Authorization: `Bearer ${tok[who]}`,
      'Content-Type': 'application/json',
      'x-real-ip': `10.35.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, json: (await res.json().catch(() => null)) as any };
};

const qty = async (id: string) =>
  Number((await admin.db.select().from(stockItems).where(eq(stockItems.id, id)))[0]!.quantity);
const movementCount = async (id: string) =>
  (await admin.db.select().from(stockMovements).where(eq(stockMovements.itemId, id))).length;

beforeAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
  const mk = async (phone: string) =>
    (
      await db
        .insert(users)
        .values({ phone, passwordHash: 'x', fullName: phone })
        .returning({ id: users.id })
    )[0]!.id;
  const owner = await mk('+998900003501');
  docId = await mk('+998900003502'); // faqat A
  const wide = await mk('+998900003503'); // tenant-wide
  const mixed = await mk('+998900003504'); // A'da manage, B'da faqat view
  const ghost = await mk('+998900003505'); // tayinlov yo'q

  for (const code of STOCK_PERMS) {
    await db.insert(permissions).values({ code, category: 'stock' }).onConflictDoNothing();
  }
  const permRows = await db
    .select({ id: permissions.id, code: permissions.code })
    .from(permissions)
    .where(inArray(permissions.code, STOCK_PERMS));

  tenantId = (
    await db
      .insert(tenants)
      .values({ name: 'FX35', slug: 'fx-35-115', ownerUserId: owner })
      .returning({ id: tenants.id })
  )[0]!.id;

  await db.transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
    const [a, b] = await tx
      .insert(branches)
      .values([
        { tenantId, name: 'A' },
        { tenantId, name: 'B' },
      ])
      .returning({ id: branches.id });
    brA = a!.id;
    brB = b!.id;
    const [doctorRole] = await tx
      .insert(roles)
      .values({ tenantId, name: 'Shifokor' })
      .returning({ id: roles.id });
    await tx
      .insert(rolePermissions)
      .values(permRows.map((p) => ({ roleId: doctorRole!.id, permissionId: p.id })));
    const [viewRole] = await tx
      .insert(roles)
      .values({ tenantId, name: 'Kuzatuvchi' })
      .returning({ id: roles.id });
    await tx.insert(rolePermissions).values(
      permRows
        .filter((p) => p.code === 'stock.view')
        .map((p) => ({
          roleId: viewRole!.id,
          permissionId: p.id,
        })),
    );
    await tx.insert(userAssignments).values([
      { tenantId, userId: docId, branchId: brA, roleId: doctorRole!.id },
      { tenantId, userId: wide, branchId: null, roleId: doctorRole!.id },
      { tenantId, userId: mixed, branchId: brA, roleId: doctorRole!.id },
      { tenantId, userId: mixed, branchId: brB, roleId: viewRole!.id },
    ]);
    const mkItem = async (name: string, branchId: string | null) =>
      (
        await tx
          .insert(stockItems)
          .values({ tenantId, branchId, name, unit: 'dona', quantity: '10', minThreshold: '1' })
          .returning({ id: stockItems.id })
      )[0]!.id;
    itemA = await mkItem('Lidokain', brA);
    itemB = await mkItem('Lidokain ', brB);
    itemShared = await mkItem('Qo‘lqop', null);
    svcId = (
      await tx
        .insert(services)
        .values({ tenantId, code: 'S35', nameUz: 'Plomba' })
        .returning({ id: services.id })
    )[0]!.id;
  });

  const sign = async (userId: string, perms: string[]) =>
    (
      await signAccess({
        sub: userId,
        atid: tenantId,
        abid: null,
        perms,
        roleKey: null,
        lang: 'uz',
      })
    ).token;
  tok.owner = await sign(owner, ['@owner']);
  tok.doc = await sign(docId, STOCK_PERMS);
  tok.wide = await sign(wide, STOCK_PERMS);
  tok.mixed = await sign(mixed, STOCK_PERMS);
  tok.ghost = await sign(ghost, STOCK_PERMS);
});

describe('FX-115: ombor filial doirasi (D-8)', () => {
  test('listItems default: faqat o‘z filiali + tenant-darajali; begona filial so‘ralsa 403', async () => {
    const r = await call('doc', 'GET', '/api/stock/items');
    expect(r.status).toBe(200);
    const ids = r.json.data.map((i: any) => i.id);
    expect(ids).toContain(itemA);
    expect(ids).toContain(itemShared);
    expect(ids).not.toContain(itemB);
    const forb = await call('doc', 'GET', `/api/stock/items?branchId=${brB}`);
    expect(forb.status).toBe(403);
    expect(forb.json.error.code).toBe('branch.forbidden');
    const all = await call('owner', 'GET', '/api/stock/items');
    expect(all.json.data.length).toBe(3);
  });

  test('getItem: begona filial 403, o‘zi 200', async () => {
    expect((await call('doc', 'GET', `/api/stock/items/${itemA}`)).status).toBe(200);
    const r = await call('doc', 'GET', `/api/stock/items/${itemB}`);
    expect(r.status).toBe(403);
    expect(r.json.error.code).toBe('branch.forbidden');
  });

  test('createMovement begona filial itemiga: 403, qoldiq va ledger o‘zgarmaydi', async () => {
    const before = await movementCount(itemB);
    const r = await call('doc', 'POST', '/api/stock/movements', {
      itemId: itemB,
      type: 'adjustment',
      quantity: 0,
    });
    expect(r.status).toBe(403);
    expect(r.json.error.code).toBe('branch.forbidden');
    expect(await qty(itemB)).toBe(10);
    expect(await movementCount(itemB)).toBe(before);
    const ok = await call('doc', 'POST', '/api/stock/movements', {
      itemId: itemA,
      type: 'out',
      quantity: 1,
    });
    expect(ok.status).toBe(201);
    expect(await qty(itemA)).toBe(9);
  });

  test('tayinlovsiz xodim (stock permset JWT’da) — 403', async () => {
    const r = await call('ghost', 'POST', '/api/stock/movements', {
      itemId: itemA,
      type: 'out',
      quantity: 1,
    });
    expect(r.status).toBe(403);
  });

  test('createBatch begona filial: 403, partiya/harakat yozilmaydi', async () => {
    const before = await movementCount(itemB);
    const r = await call('doc', 'POST', '/api/stock/batches', { itemId: itemB, qtyReceived: 5 });
    expect(r.status).toBe(403);
    expect(await qty(itemB)).toBe(10);
    expect(await movementCount(itemB)).toBe(before);
  });

  test('createBom begona filial itemi: 403', async () => {
    const r = await call('doc', 'POST', '/api/stock/bom', {
      serviceId: svcId,
      itemId: itemB,
      qtyPerService: 1,
    });
    expect(r.status).toBe(403);
    expect(
      (await admin.db.select().from(serviceMaterials).where(eq(serviceMaterials.itemId, itemB)))
        .length,
    ).toBe(0);
  });

  test('updateItem: begona filial itemi 403; branchId o‘zgartirish faqat owner/tenant-wide', async () => {
    const r = await call('doc', 'PATCH', `/api/stock/items/${itemB}`, { name: 'hack' });
    expect(r.status).toBe(403);
    expect(
      (await admin.db.select().from(stockItems).where(eq(stockItems.id, itemB)))[0]!.name,
    ).toBe('Lidokain ');
    expect(
      (await call('doc', 'PATCH', `/api/stock/items/${itemA}`, { name: 'Lidokain' })).status,
    ).toBe(200);
    const move = await call('doc', 'PATCH', `/api/stock/items/${itemA}`, { branchId: brB });
    expect(move.status).toBe(403);
    expect(
      (await admin.db.select().from(stockItems).where(eq(stockItems.id, itemA)))[0]!.branchId,
    ).toBe(brA);
    // begona (tenantda yo'q) filial — tenant-wide ham 404
    const ghostBranch = await call('wide', 'PATCH', `/api/stock/items/${itemA}`, {
      branchId: '00000000-0000-4000-8000-000000000001',
    });
    expect(ghostBranch.status).toBe(404);
    expect(
      (await call('wide', 'PATCH', `/api/stock/items/${itemA}`, { branchId: brB })).status,
    ).toBe(200);
    expect(
      (await call('owner', 'PATCH', `/api/stock/items/${itemA}`, { branchId: brA })).status,
    ).toBe(200);
  });

  test('aralash tayinlov: B’da faqat view — o‘qiydi (200), yozolmaydi (403)', async () => {
    expect((await call('mixed', 'GET', `/api/stock/items/${itemB}`)).status).toBe(200);
    const r = await call('mixed', 'POST', '/api/stock/movements', {
      itemId: itemB,
      type: 'out',
      quantity: 1,
    });
    expect(r.status).toBe(403);
    expect(await qty(itemB)).toBe(10);
  });

  test('tenant-darajali item: filialga tayinlangan xodim movement qila oladi', async () => {
    const r = await call('doc', 'POST', '/api/stock/movements', {
      itemId: itemShared,
      type: 'out',
      quantity: 1,
    });
    expect(r.status).toBe(201);
  });
});
