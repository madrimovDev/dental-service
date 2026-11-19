/**
 * FX-21 (CF-20) — erkin POS (items) to'lovida `patientId` majburiy.
 * REAL DB + REAL HTTP (createApp) + cheklangan kassir permset'i (@owner EMAS).
 * Vizit to'lovi (visitNoteId) bemorni vizitdan oladi — patientId shart emas.
 *
 * Run: cd apps/api && bun test --env-file=../../.env --timeout 30000 tests/integration/fx-21-pos-patient-required.test.ts
 */
import { beforeAll, describe, expect, test } from 'bun:test';
import {
  branches,
  cashierTransactions,
  patients,
  permissions,
  rolePermissions,
  roles,
  servicePrices,
  services,
  tenants,
  userAssignments,
  users,
} from '@dental/db-schema';
import { inArray, sql } from 'drizzle-orm';
import { createApp } from '../../src/app.ts';
import { db } from '../../src/db/client.ts';
import { signAccess } from '../../src/lib/jwt.ts';

const CASHIER_PERMS = ['cashier.view', 'cashier.create_transaction'];
const app = createApp();

let tenantId: string;
let branchId: string;
let patientId: string;
let svcId: string;
let token: string;

const post = async (body: unknown) => {
  const res = await app.request('/api/cashier/transactions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'x-real-ip': `10.21.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`,
    },
    body: JSON.stringify(body),
  });
  return { status: res.status, json: (await res.json().catch(() => null)) as any };
};

const items = () => [{ serviceId: svcId, quantity: 1, unitPrice: 1, serviceName: 'x' }];

beforeAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
  const [owner] = await db
    .insert(users)
    .values({ phone: '+998900002101', passwordHash: 'x', fullName: 'o' })
    .returning({ id: users.id });
  const [cashier] = await db
    .insert(users)
    .values({ phone: '+998900002102', passwordHash: 'x', fullName: 'k' })
    .returning({ id: users.id });
  for (const code of CASHIER_PERMS) {
    await db.insert(permissions).values({ code, category: 'cashier' }).onConflictDoNothing();
  }
  const permRows = await db
    .select({ id: permissions.id })
    .from(permissions)
    .where(inArray(permissions.code, CASHIER_PERMS));
  tenantId = (
    await db
      .insert(tenants)
      .values({ name: 'FX21', slug: 'fx-21-pos', ownerUserId: owner!.id })
      .returning({ id: tenants.id })
  )[0]!.id;
  await db.transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
    branchId = (
      await tx.insert(branches).values({ tenantId, name: 'A' }).returning({ id: branches.id })
    )[0]!.id;
    const [role] = await tx
      .insert(roles)
      .values({ tenantId, name: 'Kassir' })
      .returning({ id: roles.id });
    await tx
      .insert(rolePermissions)
      .values(permRows.map((p) => ({ roleId: role!.id, permissionId: p.id })));
    await tx
      .insert(userAssignments)
      .values({ tenantId, userId: cashier!.id, branchId: null, roleId: role!.id });
    patientId = (
      await tx.insert(patients).values({ tenantId, fullName: 'P' }).returning({ id: patients.id })
    )[0]!.id;
    svcId = (
      await tx
        .insert(services)
        .values({ tenantId, code: 'S1', nameUz: 'Xizmat' })
        .returning({ id: services.id })
    )[0]!.id;
    await tx.insert(servicePrices).values({ serviceId: svcId, branchId, price: '100000' });
  });
  token = (
    await signAccess({
      sub: cashier!.id,
      atid: tenantId,
      abid: null,
      perms: CASHIER_PERMS,
      roleKey: null,
      lang: 'uz',
    })
  ).token;
});

const count = async () =>
  db.transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
    return (await tx.select({ id: cashierTransactions.id }).from(cashierTransactions)).length;
  });

describe('FX-21: items rejimida patientId majburiy', () => {
  test('patientsiz items to‘lovi → 400, tranzaksiya yozilmaydi', async () => {
    const before = await count();
    const r = await post({
      branchId,
      items: items(),
      paidAmount: 100000,
      paymentMethod: 'cash',
    });
    expect(r.status).toBe(400);
    expect(await count()).toBe(before);
  });

  test('patientId bilan items to‘lovi → 201/200', async () => {
    const r = await post({
      branchId,
      patientId,
      items: items(),
      paidAmount: 100000,
      paymentMethod: 'cash',
    });
    expect([200, 201]).toContain(r.status);
  });
});
