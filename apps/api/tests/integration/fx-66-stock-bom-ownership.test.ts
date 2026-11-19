/**
 * FX-66 — BOM/partiya/harakat endpointlari begona/yo'q item/xizmatni 404 bilan rad etadi,
 * takror BOM jufti 409 (500 emas).
 * REAL DB + REAL HTTP (createApp) + real cheklangan rollar (doktor / ombor).
 *
 * Run: cd apps/api && bun test --env-file=../../.env --timeout 30000 tests/integration/fx-66-stock-bom-ownership.test.ts
 */
import { beforeAll, describe, expect, test } from 'bun:test';
import {
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
} from '@dental/db-schema';
import { eq, inArray, sql } from 'drizzle-orm';
import { createApp } from '../../src/app.ts';
import { createAdminDb, db } from '../../src/db/client.ts';
import { signAccess } from '../../src/lib/jwt.ts';

const app = createApp();
const admin = createAdminDb();

const ROLE_PERMS = {
  doc: ['medical_record.view', 'medical_record.edit', 'appointment.view'],
  store: ['stock.view', 'stock.manage'],
} as const;

let tenantId: string;
let patientId: string;
let docId: string;
let item: string;
let foreignItem: string;
let foreignService: string;
let svcX: string;
const tok: Record<string, string> = {};
const RANDOM_UUID = '00000000-0000-4000-8000-00000000dead';

const call = async (who: string, method: string, path: string, body?: unknown) => {
  const res = await app.request(path, {
    method,
    headers: {
      Authorization: `Bearer ${tok[who]}`,
      'Content-Type': 'application/json',
      'x-real-ip': `10.60.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, json: (await res.json().catch(() => null)) as any };
};

const _qty = async (id: string) =>
  Number((await admin.db.select().from(stockItems).where(eq(stockItems.id, id)))[0]!.quantity);
const _setQty = (id: string, q: number) =>
  admin.db
    .update(stockItems)
    .set({ quantity: String(q) })
    .where(eq(stockItems.id, id));
const setBom = async (serviceId: string, q: number | null) => {
  await admin.db.delete(serviceMaterials).where(eq(serviceMaterials.serviceId, serviceId));
  if (q !== null) {
    const r = await call('store', 'POST', '/api/stock/bom', {
      serviceId,
      itemId: item,
      qtyPerService: q,
    });
    expect(r.status).toBe(201);
  }
};
const movementCount = async () =>
  (await admin.db.select().from(stockMovements).where(eq(stockMovements.itemId, item))).length;

beforeAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
  const mk = async (phone: string) =>
    (
      await db
        .insert(users)
        .values({ phone, passwordHash: 'x', fullName: phone })
        .returning({ id: users.id })
    )[0]!.id;
  const owner = await mk('+998900006001');
  docId = await mk('+998900006002');
  const store = await mk('+998900006003');
  const owner2 = await mk('+998900006004');

  const allCodes = [...new Set(Object.values(ROLE_PERMS).flat())];
  for (const code of allCodes) {
    await db
      .insert(permissions)
      .values({ code, category: code.split('.')[0]! })
      .onConflictDoNothing();
  }
  const permRows = await db
    .select({ id: permissions.id, code: permissions.code })
    .from(permissions)
    .where(inArray(permissions.code, allCodes));

  tenantId = (
    await db
      .insert(tenants)
      .values({ name: 'FX60', slug: 'fx-60-66', ownerUserId: owner })
      .returning({ id: tenants.id })
  )[0]!.id;
  const tenant2 = (
    await db
      .insert(tenants)
      .values({ name: 'FX60-other', slug: 'fx-60-66-b', ownerUserId: owner2 })
      .returning({ id: tenants.id })
  )[0]!.id;

  await db.transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenant2}'`));
    foreignItem = (
      await tx
        .insert(stockItems)
        .values({ tenantId: tenant2, branchId: null, name: 'Begona', unit: 'dona', quantity: '5' })
        .returning({ id: stockItems.id })
    )[0]!.id;
    foreignService = (
      await tx
        .insert(services)
        .values({ tenantId: tenant2, code: 'FSV', nameUz: 'Begona xizmat' })
        .returning({ id: services.id })
    )[0]!.id;
  });

  await db.transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
    await tx.insert(branches).values({ tenantId, name: 'Asosiy' });
    for (const [key, uid] of [
      ['doc', docId],
      ['store', store],
    ] as const) {
      const [role] = await tx
        .insert(roles)
        .values({ tenantId, name: `R-${key}` })
        .returning({ id: roles.id });
      await tx
        .insert(rolePermissions)
        .values(
          permRows
            .filter((p) => (ROLE_PERMS[key] as readonly string[]).includes(p.code))
            .map((p) => ({ roleId: role!.id, permissionId: p.id })),
        );
      await tx
        .insert(userAssignments)
        .values({ tenantId, userId: uid, branchId: null, roleId: role!.id });
    }
    patientId = (
      await tx.insert(patients).values({ tenantId, fullName: 'P60' }).returning({ id: patients.id })
    )[0]!.id;
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
    const [x] = await tx
      .insert(services)
      .values([{ tenantId, code: 'X60', nameUz: 'X' }])
      .returning({ id: services.id });
    svcX = x!.id;
  });

  const sign = async (userId: string, perms: readonly string[]) =>
    (
      await signAccess({
        sub: userId,
        atid: tenantId,
        abid: null,
        perms: [...perms],
        roleKey: null,
        lang: 'uz',
      })
    ).token;
  tok.doc = await sign(docId, ROLE_PERMS.doc);
  tok.store = await sign(store, ROLE_PERMS.store);
});

describe('FX-66: begona/yo‘q item va xizmat — 404, takror BOM — 409', () => {
  test('begona va yo‘q itemId: harakat/partiya/BOM 404, hech narsa yozilmaydi', async () => {
    const before = await movementCount();
    for (const itemId of [foreignItem, RANDOM_UUID]) {
      const mv = await call('store', 'POST', '/api/stock/movements', {
        itemId,
        type: 'in',
        quantity: 1,
      });
      expect(mv.status).toBe(404);
      const batch = await call('store', 'POST', '/api/stock/batches', { itemId, qtyReceived: 1 });
      expect(batch.status).toBe(404);
      const bom = await call('store', 'POST', '/api/stock/bom', {
        serviceId: svcX,
        itemId,
        qtyPerService: 1,
      });
      expect(bom.status).toBe(404);
    }
    expect(await movementCount()).toBe(before);
    expect(
      (await admin.db.select().from(stockItems).where(eq(stockItems.id, foreignItem)))[0]!.quantity,
    ).toBe('5.00');
  });

  test('begona va yo‘q serviceId: BOM 404', async () => {
    await admin.db.delete(serviceMaterials).where(eq(serviceMaterials.itemId, item));
    for (const serviceId of [foreignService, RANDOM_UUID]) {
      const r = await call('store', 'POST', '/api/stock/bom', {
        serviceId,
        itemId: item,
        qtyPerService: 1,
      });
      expect(r.status).toBe(404);
    }
    expect(
      (await admin.db.select().from(serviceMaterials).where(eq(serviceMaterials.itemId, item)))
        .length,
    ).toBe(0);
  });

  test('bir xil (xizmat, item) jufti ikkinchi marta: 409 (500 emas)', async () => {
    await setBom(svcX, null);
    const first = await call('store', 'POST', '/api/stock/bom', {
      serviceId: svcX,
      itemId: item,
      qtyPerService: 1,
    });
    expect(first.status).toBe(201);
    const dup = await call('store', 'POST', '/api/stock/bom', {
      serviceId: svcX,
      itemId: item,
      qtyPerService: 2,
    });
    expect(dup.status).toBe(409);
    expect(dup.json.error.code).toBe('bom.duplicate');
    const rows = await admin.db
      .select()
      .from(serviceMaterials)
      .where(eq(serviceMaterials.serviceId, svcX));
    expect(rows.length).toBe(1);
    expect(rows[0]!.qtyPerService).toBe('1.00');
  });
});
