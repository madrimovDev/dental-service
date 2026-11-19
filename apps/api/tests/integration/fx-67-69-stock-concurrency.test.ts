/**
 * FX-67 — parallel vizit PATCH'lari qulfsiz 'before' ustida reconcile qilib, qo'sh chiqim yozardi.
 * FX-69 — BOM qatorlari tartibsiz yangilanib, parallel vizitlarda deadlock (vizit saqlanmasdi).
 * REAL DB + REAL HTTP (createApp, parallel so'rovlar) + real cheklangan rol (doktor).
 *
 * Run: cd apps/api && bun test --env-file=../../.env --timeout 60000 tests/integration/fx-67-69-stock-concurrency.test.ts
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

const DOC_PERMS = ['medical_record.view', 'medical_record.edit', 'appointment.view'];

let tenantId: string;
let patientId: string;
let docId: string;
let docToken: string;
let itemA: string;
let itemB: string;
let svcX: string; // BOM: itemA 1
// Ikki xizmatli to'plamlar: BOM qatorlari xizmat id'si (indeks) va kiritish (heap) bo'yicha
// bir xil tartibda: P -> A keyin B; Q -> B keyin A. (Bitta xizmat ichida tartibni indeks
// item_id bo'yicha o'zi tartiblab qo'yadi, shuning uchun to'plamlar xizmatlar bo'yicha quriladi.)
let setP: string[];
let setQ: string[];

const call = async (method: string, path: string, body?: unknown) => {
  const res = await app.request(path, {
    method,
    headers: {
      Authorization: `Bearer ${docToken}`,
      'Content-Type': 'application/json',
      'x-real-ip': `10.67.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`,
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
const newNote = async (performedServices: string[]) => {
  const r = await call('POST', '/api/visit-notes', {
    patientId,
    doctorId: docId,
    performedServices,
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
  const owner = await mk('+998900006701');
  docId = await mk('+998900006702');

  for (const code of DOC_PERMS) {
    await db
      .insert(permissions)
      .values({ code, category: code.split('.')[0]! })
      .onConflictDoNothing();
  }
  const permRows = await db
    .select({ id: permissions.id })
    .from(permissions)
    .where(inArray(permissions.code, DOC_PERMS));

  tenantId = (
    await db
      .insert(tenants)
      .values({ name: 'FX67', slug: 'fx-67-69', ownerUserId: owner })
      .returning({ id: tenants.id })
  )[0]!.id;

  await db.transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
    await tx.insert(branches).values({ tenantId, name: 'Asosiy' });
    const [role] = await tx
      .insert(roles)
      .values({ tenantId, name: 'R-doc' })
      .returning({ id: roles.id });
    await tx
      .insert(rolePermissions)
      .values(permRows.map((p) => ({ roleId: role!.id, permissionId: p.id })));
    await tx
      .insert(userAssignments)
      .values({ tenantId, userId: docId, branchId: null, roleId: role!.id });
    patientId = (
      await tx.insert(patients).values({ tenantId, fullName: 'P67' }).returning({ id: patients.id })
    )[0]!.id;
    const mkItem = async (name: string) =>
      (
        await tx
          .insert(stockItems)
          .values({
            tenantId,
            branchId: null,
            name,
            unit: 'dona',
            quantity: '1000',
            minThreshold: '1',
          })
          .returning({ id: stockItems.id })
      )[0]!.id;
    // itemA < itemB (id bo'yicha) kafolatlanmaydi — tartib testda qiymatga bog'liq emas.
    itemA = await mkItem('A');
    itemB = await mkItem('B');
    const sv = await tx
      .insert(services)
      .values(['X67', 'P1', 'P2', 'Q1', 'Q2'].map((code) => ({ tenantId, code, nameUz: code })))
      .returning({ id: services.id, code: services.code });
    svcX = sv.find((x) => x.code === 'X67')!.id;
    const four = sv.filter((x) => x.code !== 'X67').sort((a, b) => a.id.localeCompare(b.id));
    const [s0, s1, s2, s3] = four.map((x) => x.id) as [string, string, string, string];
    setP = [s0, s1];
    setQ = [s2, s3];
    await tx.insert(serviceMaterials).values([
      { tenantId, serviceId: svcX, itemId: itemA, qtyPerService: '1' },
      { tenantId, serviceId: s0, itemId: itemA, qtyPerService: '1' },
      { tenantId, serviceId: s1, itemId: itemB, qtyPerService: '1' },
      { tenantId, serviceId: s2, itemId: itemB, qtyPerService: '1' },
      { tenantId, serviceId: s3, itemId: itemA, qtyPerService: '1' },
    ]);
  });

  docToken = (
    await signAccess({
      sub: docId,
      atid: tenantId,
      abid: null,
      perms: DOC_PERMS,
      roleKey: null,
      lang: 'uz',
    })
  ).token;
});

describe('FX-67: parallel vizit PATCH — qo‘sh chiqim yo‘q', () => {
  test('bir vizitga ikki parallel PATCH bir xil yangi ro‘yxat bilan: chiqim faqat bir marta farq', async () => {
    for (let round = 0; round < 3; round++) {
      await setQty(itemA, 1000);
      const note = await newNote([svcX]); // A: -1
      const [r1, r2] = await Promise.all([
        call('PATCH', `/api/visit-notes/${note}`, { performedServices: [svcX, svcX, svcX] }),
        call('PATCH', `/api/visit-notes/${note}`, { performedServices: [svcX, svcX, svcX] }),
      ]);
      expect(r1.status).toBe(200);
      expect(r2.status).toBe(200);
      // Yakuniy holat 3 ta xizmat => jami 3 chiqim (1000 - 3). Qulfsiz: ikkalasi ham before=[X]
      // deb +2 ayirib, jami 5 chiqim.
      expect(await qty(itemA)).toBe(997);
      const out = await admin.db
        .select()
        .from(stockMovements)
        .where(eq(stockMovements.sourceVisitNoteId, note));
      expect(out.length).toBe(3);
    }
  });
});

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('FX-69: BOM qatorlari item bo‘yicha tartibli qulflanadi — deadlock yo‘q', () => {
  test('deterministik: P (A,B) A da kutadi, Q (B,A) B ni ushlab A ni kutadi — ikkalasi 201', async () => {
    await setQty(itemA, 1000);
    await setQty(itemB, 1000);
    let release!: () => void;
    const gate = new Promise<void>((r) => {
      release = r;
    });
    let locked!: () => void;
    const lockedP = new Promise<void>((r) => {
      locked = r;
    });
    // Tashqi tranzaksiya A qatorini ushlab turadi (ombor ishchisi qo'lda tahrirlayotgandek).
    const holder = admin.db.transaction(async (tx) => {
      // UPDATE (FOR NO KEY UPDATE) — FK key-share tekshiruvini emas, aynan qoldiq yangilashni bloklaydi.
      await tx.execute(sql`update stock_items set updated_at = updated_at where id = ${itemA}`);
      locked();
      await gate;
    });
    await lockedP;
    const y = call('POST', '/api/visit-notes', {
      patientId,
      doctorId: docId,
      performedServices: setP,
    });
    await sleep(400);
    const z = call('POST', '/api/visit-notes', {
      patientId,
      doctorId: docId,
      performedServices: setQ,
    });
    await sleep(600);
    release();
    await holder;
    const [ry, rz] = await Promise.all([y, z]);
    // Tartibsiz yangilashda biri 40P01 (deadlock) bilan 500 oladi va vizit saqlanmaydi.
    expect([ry.status, rz.status]).toEqual([201, 201]);
    expect(await qty(itemA)).toBe(998);
    expect(await qty(itemB)).toBe(998);
  });

  test('qarama-qarshi BOM tartibli xizmatlar bilan parallel vizitlar: hammasi 201, chiqim to‘liq', async () => {
    await setQty(itemA, 1000);
    await setQty(itemB, 1000);
    const ROUNDS = 6;
    const results = await Promise.all(
      Array.from({ length: ROUNDS * 2 }, (_, i) =>
        call('POST', '/api/visit-notes', {
          patientId,
          doctorId: docId,
          performedServices: i % 2 === 0 ? setP : setQ,
        }),
      ),
    );
    expect(results.map((r) => r.status)).toEqual(Array(ROUNDS * 2).fill(201));
    // Har vizit A va B dan 1 tadan ayiradi.
    expect(await qty(itemA)).toBe(1000 - ROUNDS * 2);
    expect(await qty(itemB)).toBe(1000 - ROUNDS * 2);
  });

  test('parallel reconcile (qo‘shish + qaytarish aralash) deadlock bermaydi', async () => {
    await setQty(itemA, 1000);
    await setQty(itemB, 1000);
    // Bir vaqtda P va Q to'plamlari qo'shiladi (A,B va B,A tartibida) — reconcile yo'li.
    const notes = await Promise.all(Array.from({ length: 6 }, (_, i) => newNote([svcX])));
    const results = await Promise.all(
      notes.map((id, i) =>
        call('PATCH', `/api/visit-notes/${id}`, {
          performedServices: [svcX, ...(i % 2 === 0 ? setP : setQ)],
        }),
      ),
    );
    expect(results.map((r) => r.status)).toEqual(Array(6).fill(200));
  });
});
