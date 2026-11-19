/**
 * FX-68 — «Necha kunga yetadi»: oyna item yoshiga moslashadi (yangi itemda sarf kamaytirib
 * ko'rsatilmaydi) va 30 kundan eski chiqimning qaytarishi oynani manfiy qilmaydi.
 * REAL DB + REAL HTTP (createApp) + real cheklangan rol (stock.view/stock.manage rolli xodim).
 *
 * Run: cd apps/api && bun test --env-file=../../.env --timeout 60000 tests/integration/fx-68-stock-days-window.test.ts
 */
import { beforeAll, describe, expect, test } from 'bun:test';
import {
  branches,
  patients,
  permissions,
  rolePermissions,
  roles,
  stockItems,
  stockMovements,
  tenants,
  userAssignments,
  users,
  visitNotes,
} from '@dental/db-schema';
import { inArray, sql } from 'drizzle-orm';
import { createApp } from '../../src/app.ts';
import { db } from '../../src/db/client.ts';
import { signAccess } from '../../src/lib/jwt.ts';

const app = createApp();
const DAY = 24 * 60 * 60 * 1000;
const PERMS = ['stock.view', 'stock.manage'];

let tenantId: string;
let patientId: string;
let docId: string;
let token: string;

const withTenant = <T>(
  fn: (tx: Parameters<Parameters<typeof db.transaction>[0]>[0]) => Promise<T>,
) =>
  db.transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
    return fn(tx);
  });

const mkItem = (name: string, quantity: string, ageDays: number) =>
  withTenant(async (tx) => {
    const [i] = await tx
      .insert(stockItems)
      .values({
        tenantId,
        branchId: null,
        name,
        unit: 'dona',
        quantity,
        minThreshold: '1',
        createdAt: new Date(Date.now() - ageDays * DAY),
      })
      .returning({ id: stockItems.id });
    return i!.id;
  });

const mkNote = () =>
  withTenant(async (tx) => {
    const [n] = await tx
      .insert(visitNotes)
      .values({ tenantId, patientId, doctorId: docId, performedServices: [] })
      .returning({ id: visitNotes.id });
    return n!.id;
  });

const mkMovement = (
  itemId: string,
  type: 'in' | 'out',
  quantity: string,
  daysAgo: number,
  reason: string | null,
  sourceVisitNoteId: string | null = null,
) =>
  withTenant((tx) =>
    tx.insert(stockMovements).values({
      tenantId,
      itemId,
      type,
      quantity,
      reason,
      sourceVisitNoteId,
      createdAt: new Date(Date.now() - daysAgo * DAY),
    }),
  );

const usage = async (name: string) => {
  const res = await app.request('/api/stock/items', {
    headers: {
      Authorization: `Bearer ${token}`,
      'x-real-ip': `10.68.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`,
    },
  });
  expect(res.status).toBe(200);
  const body = (await res.json()) as {
    data: Array<{ name: string; daysLeft: number | null; avgDailyUsage: string }>;
  };
  const row = body.data.find((i) => i.name === name)!;
  return { avg: Number(row.avgDailyUsage), daysLeft: row.daysLeft };
};

beforeAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
  const [owner, clerk] = await db
    .insert(users)
    .values([
      { phone: '+998900006801', passwordHash: 'x', fullName: 'Owner' },
      { phone: '+998900006802', passwordHash: 'x', fullName: 'Ombor' },
    ])
    .returning({ id: users.id });
  docId = clerk!.id;
  tenantId = (
    await db
      .insert(tenants)
      .values({ name: 'FX68', slug: 'fx-68', ownerUserId: owner!.id })
      .returning({ id: tenants.id })
  )[0]!.id;
  for (const code of PERMS) {
    await db.insert(permissions).values({ code, category: 'stock' }).onConflictDoNothing();
  }
  const permRows = await db
    .select({ id: permissions.id })
    .from(permissions)
    .where(inArray(permissions.code, PERMS));
  await withTenant(async (tx) => {
    await tx.insert(branches).values({ tenantId, name: 'Asosiy' });
    const [role] = await tx
      .insert(roles)
      .values({ tenantId, name: 'Ombor' })
      .returning({ id: roles.id });
    await tx
      .insert(rolePermissions)
      .values(permRows.map((p) => ({ roleId: role!.id, permissionId: p.id })));
    await tx
      .insert(userAssignments)
      .values({ tenantId, userId: docId, branchId: null, roleId: role!.id });
    patientId = (
      await tx.insert(patients).values({ tenantId, fullName: 'P68' }).returning({ id: patients.id })
    )[0]!.id;
  });
  token = (
    await signAccess({
      sub: docId,
      atid: tenantId,
      abid: null,
      perms: PERMS,
      roleKey: null,
      lang: 'uz',
    })
  ).token;
});

describe('FX-68: necha kunga yetadi oynasi', () => {
  test('2 kunlik item: 6 ta sarf → 3/kun (30 ga bo‘linib 0.2 emas)', async () => {
    const id = await mkItem('Yangi-2kun', '9', 2);
    await mkMovement(id, 'out', '6', 1, 'visit_auto');
    const r = await usage('Yangi-2kun');
    expect(r.avg).toBeCloseTo(3, 1);
    expect(r.daysLeft).toBe(3);
  });

  test('bugun yaratilgan item: oyna kamida 1 kun', async () => {
    const id = await mkItem('Yangi-bugun', '4', 0);
    await mkMovement(id, 'out', '2', 0, 'visit_auto');
    const r = await usage('Yangi-bugun');
    expect(r.avg).toBeCloseTo(2, 5);
    expect(r.daysLeft).toBe(2);
  });

  test('eski item: oyna 30 kun (o‘zgarmagan)', async () => {
    const id = await mkItem('Eski-item', '10', 90);
    await mkMovement(id, 'out', '30', 5, 'visit_auto');
    const r = await usage('Eski-item');
    expect(r.avg).toBeCloseTo(1, 5);
    expect(r.daysLeft).toBe(10);
  });

  test('30 kundan eski chiqimning qaytarishi oyna sarfidan ayrilmaydi', async () => {
    const id = await mkItem('Eski-qaytarish', '10', 120);
    const oldNote = await mkNote();
    await mkMovement(id, 'out', '30', 45, 'visit_auto', oldNote); // oynadan tashqarida
    await mkMovement(id, 'in', '30', 1, 'visit_edit_return', oldNote); // bugungi tahrir
    await mkMovement(id, 'out', '6', 2, 'visit_auto'); // oyna ichidagi haqiqiy sarf
    const r = await usage('Eski-qaytarish');
    // Qaytarish asl chiqimi oynadan tashqarida → ayrilmaydi: 6/30 = 0.2/kun (xato: max(0, 6-30)=0).
    expect(r.avg).toBeCloseTo(0.2, 5);
    expect(r.daysLeft).toBe(50);
  });

  test('oyna ichidagi chiqimning qaytarishi sarfdan ayriladi', async () => {
    const id = await mkItem('Yangi-qaytarish', '10', 120);
    const note = await mkNote();
    await mkMovement(id, 'out', '30', 5, 'visit_auto', note);
    await mkMovement(id, 'in', '24', 1, 'visit_cancel_return', note);
    const r = await usage('Yangi-qaytarish');
    expect(r.avg).toBeCloseTo(0.2, 5); // (30-24)/30
  });
});
