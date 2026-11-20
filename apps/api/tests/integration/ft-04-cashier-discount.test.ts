/**
 * FT-04.2 (D-1) — kassa chegirmasi: `discount > 0` faqat `discount.give` bilan (403
 * `discount.forbidden`), tranzaksiyada `discount_percent/reason/granted_by`, audit, chek.
 *
 * REAL DB + REAL HTTP (createApp) + real `user_assignments` + REAL cheklangan rollar
 * (`@owner` EMAS): «Kassir» (cashier.view + cashier.create_transaction, `discount.give`siz)
 * va Receptionist shablon permset'i (`discount.give` bilan).
 *
 *   cd apps/api && bun test --env-file=../../.env --timeout 30000 tests/integration/ft-04-cashier-discount.test.ts
 */
import { beforeAll, describe, expect, test } from 'bun:test';
import { ROLE_TEMPLATES } from '@dental/core';
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

const KASSIR_PERMS = ['cashier.view', 'cashier.create_transaction'];
const RECEPTION_PERMS = [
  ...(ROLE_TEMPLATES.find((t) => t.templateKey === 'receptionist')?.permissions ?? []),
] as string[];
const app = createApp();

let tenantId: string;
let branchId: string;
let patientId: string;
let svcId: string;
let receptionUserId: string;
const tok: Record<string, string> = {};

// biome-ignore lint/suspicious/noExplicitAny: test javob shakli
type Res = { status: number; json: any };
const call = async (who: string, method: 'GET' | 'POST', path: string, body?: unknown) => {
  const res = await app.request(path, {
    method,
    headers: {
      Authorization: `Bearer ${tok[who]}`,
      'Content-Type': 'application/json',
      'x-real-ip': `10.74.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, json: await res.json().catch(() => null) } as Res;
};

/** Xizmat narxi 200 000 (server narxi; client unitPrice e'tiborsiz — CLI-443). */
const payBody = (discount: number, extra: Record<string, unknown> = {}) => ({
  branchId,
  patientId,
  items: [{ serviceId: svcId, quantity: 1, unitPrice: 1, serviceName: 'Plomba' }],
  discount,
  paidAmount: 200_000 - discount,
  paymentMethod: 'cash',
  ...extra,
});

const txCount = async () =>
  db.transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
    const rows = await tx.select({ id: cashierTransactions.id }).from(cashierTransactions);
    return rows.length;
  });

beforeAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
  const mk = async (phone: string) =>
    (
      await db
        .insert(users)
        .values({ phone, passwordHash: 'x', fullName: phone })
        .returning({ id: users.id })
    )[0]!.id;
  const owner = await mk('+998900074201');
  const kassir = await mk('+998900074202');
  receptionUserId = await mk('+998900074203');

  const allCodes = [...new Set([...KASSIR_PERMS, ...RECEPTION_PERMS])];
  for (const code of allCodes) {
    await db
      .insert(permissions)
      .values({ code, category: code.split('.')[0] ?? 'x' })
      .onConflictDoNothing();
  }
  const permIds = async (codes: string[]) =>
    db.select({ id: permissions.id }).from(permissions).where(inArray(permissions.code, codes));
  const kassirPermRows = await permIds(KASSIR_PERMS);
  const receptionPermRows = await permIds(RECEPTION_PERMS);

  tenantId = (
    await db
      .insert(tenants)
      .values({ name: 'FT04 Kassa', slug: 'ft-04-kassa', ownerUserId: owner })
      .returning({ id: tenants.id })
  )[0]!.id;

  await db.transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
    const [br] = await tx
      .insert(branches)
      .values({ tenantId, name: 'Asosiy' })
      .returning({ id: branches.id });
    branchId = br!.id;
    const [kassirRole] = await tx
      .insert(roles)
      .values({ tenantId, name: 'Kassir (chegirmasiz)' })
      .returning({ id: roles.id });
    await tx
      .insert(rolePermissions)
      .values(kassirPermRows.map((p) => ({ roleId: kassirRole!.id, permissionId: p.id })));
    const [recRole] = await tx
      .insert(roles)
      .values({ tenantId, name: 'Receptionist', isSystem: true, templateKey: 'receptionist' })
      .returning({ id: roles.id });
    await tx
      .insert(rolePermissions)
      .values(receptionPermRows.map((p) => ({ roleId: recRole!.id, permissionId: p.id })));
    await tx.insert(userAssignments).values([
      { tenantId, userId: kassir, branchId, roleId: kassirRole!.id },
      { tenantId, userId: receptionUserId, branchId, roleId: recRole!.id },
    ]);
    const [pt] = await tx
      .insert(patients)
      .values({ tenantId, fullName: 'Bemor FT04' })
      .returning({ id: patients.id });
    patientId = pt!.id;
    const [svc] = await tx
      .insert(services)
      .values({ tenantId, code: 'FT04-S', nameUz: 'Plomba' })
      .returning({ id: services.id });
    svcId = svc!.id;
    await tx.insert(servicePrices).values({ serviceId: svcId, branchId, price: '200000' });
  });

  const sign = async (userId: string, perms: string[]) =>
    (
      await signAccess({
        sub: userId,
        atid: tenantId,
        abid: branchId,
        perms,
        roleKey: null,
        lang: 'uz',
      })
    ).token;
  expect(RECEPTION_PERMS).toContain('discount.give');
  expect(RECEPTION_PERMS).not.toContain('@owner');
  tok.kassir = await sign(kassir, KASSIR_PERMS);
  tok.reception = await sign(receptionUserId, RECEPTION_PERMS);
});

describe('FT-04.2 — discount > 0 faqat discount.give bilan', () => {
  test("Kassir (discount.give'siz): chegirma bilan → 403 discount.forbidden, yozuv yo'q", async () => {
    const before = await txCount();
    const r = await call('kassir', 'POST', '/api/cashier/transactions', payBody(20_000));
    expect(r.status).toBe(403);
    expect(r.json.error.code).toBe('discount.forbidden');
    expect(await txCount()).toBe(before);
  });

  test('Kassir: chegirmasiz to‘lov → 201', async () => {
    const r = await call('kassir', 'POST', '/api/cashier/transactions', payBody(0));
    expect(r.status).toBe(201);
    expect(r.json.data.discount).toBe('0.00');
  });

  test('Receptionist (shablon, discount.give bor): chegirma bilan → 201', async () => {
    const r = await call('reception', 'POST', '/api/cashier/transactions', payBody(20_000));
    expect(r.status).toBe(201);
    expect(Number(r.json.data.totalAmount)).toBe(180_000);
  });
});
