/**
 * FX-44 (LA-42) + FX-45 (LA-41) — ombor qaytarishi ledger bo'yicha va yozilish bekorida.
 * REAL DB + REAL HTTP (createApp) + real cheklangan rollar (doktor / registrator / ombor).
 *
 * Run: cd apps/api && bun test --env-file=../../.env --timeout 30000 tests/integration/fx-44-45-stock-return.test.ts
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
} from '@dental/db-schema';
import { eq, inArray, sql } from 'drizzle-orm';
import { createApp } from '../../src/app.ts';
import { createAdminDb, db } from '../../src/db/client.ts';
import { signAccess } from '../../src/lib/jwt.ts';

const app = createApp();
const admin = createAdminDb();

const ROLE_PERMS = {
  doc: ['medical_record.view', 'medical_record.edit', 'appointment.view'],
  rec: ['appointment.view', 'appointment.edit', 'appointment.cancel'],
  store: ['stock.view', 'stock.manage'],
} as const;

let tenantId: string;
let branchId: string;
let patientId: string;
let docId: string;
let item: string;
let svcX: string;
let svcY: string;
const tok: Record<string, string> = {};

const call = async (who: string, method: string, path: string, body?: unknown) => {
  const res = await app.request(path, {
    method,
    headers: {
      Authorization: `Bearer ${tok[who]}`,
      'Content-Type': 'application/json',
      'x-real-ip': `10.44.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, json: (await res.json().catch(() => null)) as any };
};

const qty = async (id: string) =>
  Number((await admin.db.select().from(stockItems).where(eq(stockItems.id, id)))[0]!.quantity);
const setQty = (id: string, q: number) =>
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
const newNote = async (performedServices: string[], appointmentId?: string) => {
  const r = await call('doc', 'POST', '/api/visit-notes', {
    patientId,
    doctorId: docId,
    performedServices,
    appointmentId,
  });
  expect(r.status).toBe(201);
  return r.json.data.id as string;
};
let slot = 0;
const newAppt = async (status: 'scheduled' | 'in_progress' = 'in_progress') => {
  const start = new Date(Date.UTC(2031, 0, 1) + ++slot * 3_600_000);
  return (
    await admin.db
      .insert(appointments)
      .values({
        tenantId,
        branchId,
        patientId,
        doctorId: docId,
        startTime: start,
        endTime: new Date(start.getTime() + 1_800_000),
        status,
      } as never)
      .returning({ id: appointments.id })
  )[0]!.id;
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
  const owner = await mk('+998900004401');
  docId = await mk('+998900004402');
  const rec = await mk('+998900004403');
  const store = await mk('+998900004404');

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
      .values({ name: 'FX44', slug: 'fx-44-45', ownerUserId: owner })
      .returning({ id: tenants.id })
  )[0]!.id;

  await db.transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
    branchId = (
      await tx.insert(branches).values({ tenantId, name: 'Asosiy' }).returning({ id: branches.id })
    )[0]!.id;
    for (const [key, uid] of [
      ['doc', docId],
      ['rec', rec],
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
      await tx.insert(patients).values({ tenantId, fullName: 'P44' }).returning({ id: patients.id })
    )[0]!.id;
    item = (
      await tx
        .insert(stockItems)
        .values({
          tenantId,
          branchId: null,
          name: 'Anestetik',
          unit: 'dona',
          quantity: '10',
          minThreshold: '1',
        })
        .returning({ id: stockItems.id })
    )[0]!.id;
    const [x, y] = await tx
      .insert(services)
      .values([
        { tenantId, code: 'X44', nameUz: 'X' },
        { tenantId, code: 'Y44', nameUz: 'Y' },
      ])
      .returning({ id: services.id });
    svcX = x!.id;
    svcY = y!.id;
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
  tok.rec = await sign(rec, ROLE_PERMS.rec);
  tok.store = await sign(store, ROLE_PERMS.store);
});

describe('FX-44: vizit tahririda qaytarish ledger (haqiqiy chiqim) bo‘yicha', () => {
  test('BOM saqlangandan keyin 2 -> 3 ga o‘zgargan: qaytarish 2 (3 emas), fantom qoldiq yo‘q', async () => {
    await setQty(item, 10);
    await setBom(svcX, 2);
    const note = await newNote([svcX]);
    expect(await qty(item)).toBe(8);
    await setBom(svcX, 3);
    const r = await call('doc', 'PATCH', `/api/visit-notes/${note}`, { performedServices: [] });
    expect(r.status).toBe(200);
    expect(await qty(item)).toBe(10);
  });

  test('BOM butunlay o‘chirilgan: chiqqan 2 baribir qaytadi', async () => {
    await setQty(item, 10);
    await setBom(svcX, 2);
    const note = await newNote([svcX]);
    expect(await qty(item)).toBe(8);
    await setBom(svcX, null);
    await call('doc', 'PATCH', `/api/visit-notes/${note}`, { performedServices: [] });
    expect(await qty(item)).toBe(10);
  });

  test('BOM vizitdan KEYIN qo‘shilgan: olib tashlash hech narsa "qaytarmaydi"', async () => {
    await setQty(item, 10);
    await setBom(svcX, null);
    const note = await newNote([svcX]);
    expect(await qty(item)).toBe(10);
    await setBom(svcX, 5);
    await call('doc', 'PATCH', `/api/visit-notes/${note}`, { performedServices: [] });
    expect(await qty(item)).toBe(10);
  });

  test('ikki xil xizmat + takror: faqat olib tashlangan xizmat ulushi qaytadi', async () => {
    await setQty(item, 20);
    await setBom(svcX, 2);
    await setBom(svcY, 5);
    const note = await newNote([svcX, svcX, svcY]); // 2+2+5 = 9
    expect(await qty(item)).toBe(11);
    // X dan bittasini olib tashlaymiz; BOM bu orada o'zgaradi
    await setBom(svcX, 7);
    await call('doc', 'PATCH', `/api/visit-notes/${note}`, { performedServices: [svcX, svcY] });
    expect(await qty(item)).toBe(13); // +2
    await call('doc', 'PATCH', `/api/visit-notes/${note}`, { performedServices: [svcY] });
    expect(await qty(item)).toBe(15); // +2 (X ning ikkinchisi)
    await call('doc', 'PATCH', `/api/visit-notes/${note}`, { performedServices: [] });
    expect(await qty(item)).toBe(20); // +5 (Y)
  });
});
