/**
 * FX-03a — ombor (BOM / partiya / harakat) begona ID egaligi.
 * REAL DB, real createApp(), CHEKLANGAN rol (`stock.manage` + `stock.view` — @owner EMAS).
 *
 * Postgres FK RLS'ni chetlab o'tadi: A kontekstida B ombor itemiga partiya/BOM yoziladi.
 *   cd apps/api && bun test --env-file=../../.env --timeout 30000 tests/integration/fx-03a-stock-ownership.test.ts
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import {
  roles,
  serviceMaterials,
  services,
  stockBatches,
  stockItems,
  stockMovements,
  tenants,
  userAssignments,
  users,
} from '@dental/db-schema';
import { eq, sql } from 'drizzle-orm';
import { createApp } from '../../src/app.ts';
import { createAdminDb, db } from '../../src/db/client.ts';
import { withTenant } from '../../src/db/scoped.ts';
import { signAccess } from '../../src/lib/jwt.ts';

const admin = createAdminDb();

let tA: string;
let tB: string;
let staffA: string;
let itemA: string;
let itemB: string;
let serviceA: string;
let serviceB: string;
let token: string;

const call = (method: string, path: string, body?: unknown) =>
  createApp().request(path, {
    method,
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

const count = async (
  table: typeof stockBatches | typeof stockMovements | typeof serviceMaterials,
) => (await admin.db.select().from(table).where(eq(table.tenantId, tA))).length;

beforeAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
  const mk = async (phone: string, name: string) => {
    const [u] = await db
      .insert(users)
      .values({ phone, passwordHash: 'x', fullName: name })
      .returning({ id: users.id });
    return u!.id;
  };
  const ownerA = await mk('+998900003001', 'Owner A');
  const ownerB = await mk('+998900003002', 'Owner B');
  staffA = await mk('+998900003003', 'Staff A');
  const mkTenant = async (slug: string, owner: string) => {
    const [t] = await db
      .insert(tenants)
      .values({ name: slug, slug, ownerUserId: owner })
      .returning({ id: tenants.id });
    return t!.id;
  };
  tA = await mkTenant('fx03a-a', ownerA);
  tB = await mkTenant('fx03a-b', ownerB);

  await withTenant(tA, async (tx) => {
    const [role] = await tx
      .insert(roles)
      .values({ tenantId: tA, name: 'Stock', isSystem: false })
      .returning({ id: roles.id });
    await tx
      .insert(userAssignments)
      .values({ userId: staffA, tenantId: tA, roleId: role!.id, isActive: true });
    const [i] = await tx
      .insert(stockItems)
      .values({ tenantId: tA, name: 'A item', unit: 'dona', quantity: '10' })
      .returning({ id: stockItems.id });
    itemA = i!.id;
    serviceA = await mkServiceTx(tx, tA, 'A-SVC');
  });
  await withTenant(tB, async (tx) => {
    const [i] = await tx
      .insert(stockItems)
      .values({ tenantId: tB, name: 'B item', unit: 'dona', quantity: '10' })
      .returning({ id: stockItems.id });
    itemB = i!.id;
    serviceB = await mkServiceTx(tx, tB, 'B-SVC');
  });

  ({ token } = await signAccess({
    sub: staffA,
    atid: tA,
    abid: null,
    perms: ['stock.manage', 'stock.view'],
    roleKey: null,
    lang: 'uz',
  }));
});

async function mkServiceTx(tx: typeof db, tenantId: string, code: string) {
  const [s] = await tx
    .insert(services)
    .values({ tenantId, code, nameUz: code, nameRu: code })
    .returning({ id: services.id });
  return s!.id;
}

afterAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
  await admin.client.end({ timeout: 5 });
});

const itemQty = async (id: string) =>
  (await admin.db.select().from(stockItems).where(eq(stockItems.id, id)))[0]!.quantity;

describe('FX-03a — begona itemId/serviceId → 404, hech narsa yozilmaydi', () => {
  test("POST /stock/batches begona itemId → 404, partiya va harakat YO'Q", async () => {
    const res = await call('POST', '/api/stock/batches', { itemId: itemB, qtyReceived: 5 });
    expect(res.status).toBe(404);
    expect(await count(stockBatches)).toBe(0);
    expect(await count(stockMovements)).toBe(0);
    expect(Number(await itemQty(itemB))).toBe(10);
  });

  test('POST /stock/movements begona itemId → 404 (500 emas)', async () => {
    const res = await call('POST', '/api/stock/movements', {
      itemId: itemB,
      type: 'out',
      quantity: 3,
    });
    expect(res.status).toBe(404);
    expect(await count(stockMovements)).toBe(0);
    expect(Number(await itemQty(itemB))).toBe(10);
  });

  test('POST /stock/bom begona itemId → 404', async () => {
    const res = await call('POST', '/api/stock/bom', {
      serviceId: serviceA,
      itemId: itemB,
      qtyPerService: 1,
    });
    expect(res.status).toBe(404);
    expect(await count(serviceMaterials)).toBe(0);
  });

  test('POST /stock/bom begona serviceId → 404', async () => {
    const res = await call('POST', '/api/stock/bom', {
      serviceId: serviceB,
      itemId: itemA,
      qtyPerService: 1,
    });
    expect(res.status).toBe(404);
    expect(await count(serviceMaterials)).toBe(0);
  });

  test("GET harakat/partiya begona itemId → bo'sh (sizish yo'q)", async () => {
    // B tomonida haqiqiy yozuv bor
    await admin.db.insert(stockMovements).values({
      tenantId: tB,
      itemId: itemB,
      type: 'in',
      quantity: '1',
    });
    const m = await call('GET', `/api/stock/movements?itemId=${itemB}`);
    expect(m.status).toBe(200);
    expect(((await m.json()) as { data: unknown[] }).data).toEqual([]);
    const b = await call('GET', `/api/stock/batches?itemId=${itemB}`);
    expect(b.status).toBe(200);
    expect(((await b.json()) as { data: unknown[] }).data).toEqual([]);
  });
});

describe("FX-03a — o'z ID lari bilan regressiya yo'q", () => {
  test('batch + movement + bom → muvaffaqiyatli', async () => {
    const b = await call('POST', '/api/stock/batches', { itemId: itemA, qtyReceived: 5 });
    expect(b.status).toBe(201);
    const m = await call('POST', '/api/stock/movements', {
      itemId: itemA,
      type: 'out',
      quantity: 3,
    });
    expect(m.status).toBe(201);
    const bom = await call('POST', '/api/stock/bom', {
      serviceId: serviceA,
      itemId: itemA,
      qtyPerService: 2,
    });
    expect(bom.status).toBe(201);
    expect(Number(await itemQty(itemA))).toBe(12);
  });
});
