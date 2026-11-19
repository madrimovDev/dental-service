/**
 * FX-60 — bosqichni plan ekranidan completed qilish ombor BOM chiqimini bajaradi, vizit
 * yo'li bilan ikki marta yechilmaydi.
 * REAL DB + REAL HTTP (createApp) + real cheklangan rollar (doktor / ombor).
 *
 * Run: cd apps/api && bun test --env-file=../../.env --timeout 30000 tests/integration/fx-60-stock-stage-bom.test.ts
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
  treatmentPlans,
  treatmentStages,
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
let _foreignItem: string;
let _foreignService: string;
let svcX: string;
let svcY: string;
const tok: Record<string, string> = {};
const _RANDOM_UUID = '00000000-0000-4000-8000-00000000dead';

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
const _movementCount = async () =>
  (await admin.db.select().from(stockMovements).where(eq(stockMovements.itemId, item))).length;

let planId: string;
/** Plan (in_progress) ichida qabul qilingan bosqich. */
const newStage = async (serviceId: string | null) =>
  (
    await admin.db
      .insert(treatmentStages)
      .values({
        treatmentPlanId: planId,
        sequence: 1,
        serviceId,
        serviceName: 'Bosqich',
        cost: '100',
        status: 'pending',
        acceptance: 'accepted',
      })
      .returning({ id: treatmentStages.id })
  )[0]!.id;
const completeStage = (stageId: string) =>
  call('doc', 'PATCH', `/api/treatment-stages/${stageId}`, { status: 'completed' });
const newNote = async (performedServices: string[], stageId?: string) => {
  const r = await call('doc', 'POST', '/api/visit-notes', {
    patientId,
    doctorId: docId,
    performedServices,
    stageId,
  });
  expect(r.status).toBe(201);
  return r.json.data.id as string;
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
    _foreignItem = (
      await tx
        .insert(stockItems)
        .values({ tenantId: tenant2, branchId: null, name: 'Begona', unit: 'dona', quantity: '5' })
        .returning({ id: stockItems.id })
    )[0]!.id;
    _foreignService = (
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
    const [x, y] = await tx
      .insert(services)
      .values([
        { tenantId, code: 'X60', nameUz: 'X' },
        { tenantId, code: 'Y60', nameUz: 'Y' },
      ])
      .returning({ id: services.id });
    svcX = x!.id;
    svcY = y!.id;
    planId = (
      await tx
        .insert(treatmentPlans)
        .values({ tenantId, patientId, doctorId: docId, title: 'Reja', status: 'in_progress' })
        .returning({ id: treatmentPlans.id })
    )[0]!.id;
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

describe('FX-60: plan ekranidan completed -> BOM chiqimi, ikki marta yechilmaydi', () => {
  test('plan ekranidan completed: BOM yechiladi; qayta PATCH ikki marta yechmaydi', async () => {
    await setQty(item, 10);
    await setBom(svcX, 2);
    const stage = await newStage(svcX);
    const r = await completeStage(stage);
    expect(r.status).toBe(200);
    expect(await qty(item)).toBe(8);
    const again = await completeStage(stage);
    expect(again.status).toBe(200);
    expect(await qty(item)).toBe(8);
  });

  test('xizmatsiz bosqich yoki BOM yo‘q xizmat: ombor tegilmaydi', async () => {
    await setQty(item, 10);
    await setBom(svcX, null);
    expect((await completeStage(await newStage(null))).status).toBe(200);
    expect((await completeStage(await newStage(svcX))).status).toBe(200);
    expect(await qty(item)).toBe(10);
  });

  test('vizit (bosqichga bog‘liq, performedServices) avval yechgan: plan ekrani qayta yechmaydi', async () => {
    await setQty(item, 10);
    await setBom(svcX, 2);
    const stage = await newStage(svcX);
    await newNote([svcX], stage);
    expect(await qty(item)).toBe(8);
    expect((await completeStage(stage)).status).toBe(200);
    expect(await qty(item)).toBe(8);
  });

  test('plan ekrani avval yechgan: keyingi vizit (shu bosqich + shu xizmat) qayta yechmaydi', async () => {
    await setQty(item, 10);
    await setBom(svcX, 2);
    const stage = await newStage(svcX);
    expect((await completeStage(stage)).status).toBe(200);
    expect(await qty(item)).toBe(8);
    const note = await newNote([svcX], stage);
    expect(await qty(item)).toBe(8);
    // boshqa xizmat (Y) hali odatdagidek yechiladi
    await setBom(svcY, 3);
    await call('doc', 'PATCH', `/api/visit-notes/${note}`, { performedServices: [svcX, svcY] });
    expect(await qty(item)).toBe(5);
  });
});
