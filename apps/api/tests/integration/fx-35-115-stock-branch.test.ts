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

describe('FX-35: BOM avto-chiqimi vizit filialidagi itemdan', () => {
  const noopAudit = { record: async () => {} } as unknown as AuditLogger;
  const stock = createStockService({ audit: noopAudit });
  const ctx = (tx: DbOrTx, activeBranchId: string | null): Context =>
    ({
      get: (k: string) =>
        k === 'db'
          ? tx
          : k === 'accessClaims'
            ? { perms: ['@owner'], atid: tenantId, sub: docId }
            : k === 'activeTenantId'
              ? tenantId
              : k === 'activeBranchId'
                ? activeBranchId
                : k === 'user'
                  ? { id: docId }
                  : undefined,
      req: { header: () => undefined },
    }) as unknown as Context;
  const withTx = <T>(fn: (tx: DbOrTx) => Promise<T>): Promise<T> =>
    db.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
      return fn(tx);
    });

  let visitId: string;
  let apptBId: string;
  let visitViaApptId: string;
  beforeAll(async () => {
    await admin.db.execute(sql`DELETE FROM service_materials`);
    await withTx(async (tx) => {
      await tx.update(stockItems).set({ quantity: '10' });
      // BOM faqat A itemiga yozilgan (tenant-darajali BOM)
      await tx
        .insert(serviceMaterials)
        .values({ tenantId, serviceId: svcId, itemId: itemA, qtyPerService: '2' });
      const [p] = await tx
        .insert(patients)
        .values({ tenantId, fullName: 'P35' })
        .returning({ id: patients.id });
      const [vn] = await tx
        .insert(visitNotes)
        .values({ tenantId, patientId: p!.id, doctorId: docId })
        .returning({ id: visitNotes.id });
      visitId = vn!.id;
      const [ap] = await tx
        .insert(appointments)
        .values({
          tenantId,
          branchId: brB,
          patientId: p!.id,
          doctorId: docId,
          startTime: new Date('2030-01-01T10:00:00Z'),
          endTime: new Date('2030-01-01T10:30:00Z'),
        } as never)
        .returning({ id: appointments.id });
      apptBId = ap!.id;
      const [vn2] = await tx
        .insert(visitNotes)
        .values({ tenantId, patientId: p!.id, doctorId: docId, appointmentId: apptBId })
        .returning({ id: visitNotes.id });
      visitViaApptId = vn2!.id;
    });
  });

  test('B filialdagi vizit: chiqim B’ning o‘z itemidan, A itemi tegilmaydi', async () => {
    await withTx((tx) => stock.deductForServices(ctx(tx, brB), [svcId], visitId));
    expect(await qty(itemA)).toBe(10);
    expect(await qty(itemB)).toBe(8);
  });

  test('qaytarish (reconcile) ham shu B itemiga', async () => {
    await withTx((tx) => stock.reconcileForServices(ctx(tx, brB), [svcId], [], visitId));
    expect(await qty(itemB)).toBe(10);
    expect(await qty(itemA)).toBe(10);
  });

  test('vizit filiali yozilish (appointment) filialidan: aktiv filial A bo‘lsa ham B', async () => {
    await withTx((tx) => stock.deductForServices(ctx(tx, brA), [svcId], visitViaApptId));
    expect(await qty(itemB)).toBe(8);
    expect(await qty(itemA)).toBe(10);
  });

  test('o‘z filialidagi item to‘g‘ridan: A vizit A itemini kamaytiradi', async () => {
    await withTx((tx) => stock.deductForServices(ctx(tx, brA), [svcId], visitId));
    expect(await qty(itemA)).toBe(8);
  });

  test('filialda mos item yo‘q bo‘lsa — boshqa filial itemidan AYIRILMAYDI', async () => {
    await withTx(async (tx) => {
      await tx.update(stockItems).set({ name: 'Boshqa' }).where(eq(stockItems.id, itemB));
    });
    const aBefore = await qty(itemA);
    await withTx((tx) => stock.deductForServices(ctx(tx, brB), [svcId], visitId));
    expect(await qty(itemA)).toBe(aBefore);
    expect(await qty(itemB)).toBe(8);
  });
});

describe('FX-35 review: har filial uchun alohida BOM qatori — ikki marta ayirilmaydi', () => {
  const noopAudit = { record: async () => {} } as unknown as AuditLogger;
  const stock = createStockService({ audit: noopAudit });
  const ctx = (tx: DbOrTx, activeBranchId: string | null): Context =>
    ({
      get: (k: string) =>
        k === 'db'
          ? tx
          : k === 'accessClaims'
            ? { perms: ['@owner'], atid: tenantId, sub: docId }
            : k === 'activeTenantId'
              ? tenantId
              : k === 'activeBranchId'
                ? activeBranchId
                : k === 'user'
                  ? { id: docId }
                  : undefined,
      req: { header: () => undefined },
    }) as unknown as Context;
  const withTx = <T>(fn: (tx: DbOrTx) => Promise<T>): Promise<T> =>
    db.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
      return fn(tx);
    });

  let lidoA: string;
  let lidoB: string;
  let svcL: string;
  let visitL: string;
  beforeAll(async () => {
    await withTx(async (tx) => {
      const [a, b] = await tx
        .insert(stockItems)
        .values([
          { tenantId, branchId: brA, name: 'Lidokain', unit: 'ml', quantity: '10' },
          { tenantId, branchId: brB, name: 'Lidokain', unit: 'ml', quantity: '10' },
        ])
        .returning({ id: stockItems.id });
      lidoA = a!.id;
      lidoB = b!.id;
      const [s] = await tx
        .insert(services)
        .values({ tenantId, code: 'L35R', nameUz: 'L' })
        .returning({ id: services.id });
      svcL = s!.id;
      await tx.insert(serviceMaterials).values([
        { tenantId, serviceId: svcL, itemId: lidoA, qtyPerService: '1' },
        { tenantId, serviceId: svcL, itemId: lidoB, qtyPerService: '1' },
      ]);
      const [p] = await tx
        .insert(patients)
        .values({ tenantId, fullName: 'P35R' })
        .returning({ id: patients.id });
      const [vn] = await tx
        .insert(visitNotes)
        .values({ tenantId, patientId: p!.id, doctorId: docId })
        .returning({ id: visitNotes.id });
      visitL = vn!.id;
    });
  });

  test('B filial vizit: faqat B itemi 1 marta (A 10, B 9)', async () => {
    await withTx((tx) => stock.deductForServices(ctx(tx, brB), [svcL], visitL));
    expect(await qty(lidoA)).toBe(10);
    expect(await qty(lidoB)).toBe(9);
  });

  test('A filial vizit: faqat A itemi 1 marta (A 9, B 9)', async () => {
    await withTx((tx) => stock.deductForServices(ctx(tx, brA), [svcL], visitL));
    expect(await qty(lidoA)).toBe(9);
    expect(await qty(lidoB)).toBe(9);
  });
});
