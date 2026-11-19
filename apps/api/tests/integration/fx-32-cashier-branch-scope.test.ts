/**
 * X-2 + FX-32 (LA-27/LA-30, D-8) — kassa operatsiyalari chaqiruvchining tayinlangan
 * filiallari bilan cheklanadi. REAL DB + REAL HTTP (createApp) + real `user_assignments`
 * + real cheklangan rol permset'lari. @owner / tenant-wide tayinlov istisno.
 *
 * Run: cd apps/api && bun test --env-file=../../.env --timeout 30000 tests/integration/fx-32-cashier-branch-scope.test.ts
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
import { eq, inArray, sql } from 'drizzle-orm';
import { createApp } from '../../src/app.ts';
import { db } from '../../src/db/client.ts';
import { signAccess } from '../../src/lib/jwt.ts';

const CASHIER_PERMS = ['cashier.view', 'cashier.create_transaction', 'cashier.refund'];
const app = createApp();

let tenantId: string;
let brA: string;
let brB: string;
let patientId: string;
let svcId: string;
let txA: string;
let txB: string;
const tok: Record<string, string> = {};

const call = async (who: string, method: 'GET' | 'POST', path: string, body?: unknown) => {
  const res = await app.request(path, {
    method,
    headers: {
      Authorization: `Bearer ${tok[who]}`,
      'Content-Type': 'application/json',
      'x-real-ip': `10.32.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, json: (await res.json().catch(() => null)) as any };
};

const today = new Date().toISOString().slice(0, 10);
const payBody = (branchId: string) => ({
  branchId,
  patientId,
  items: [{ serviceId: svcId, quantity: 1, unitPrice: 1, serviceName: 'x' }],
  discount: 0,
  paidAmount: 100000,
  paymentMethod: 'cash',
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
  const owner = await mk('+998900003201');
  const recA = await mk('+998900003202'); // faqat A
  const recAll = await mk('+998900003203'); // tenant-wide
  const ghost = await mk('+998900003204'); // tayinlov yo'q
  const mixed = await mk('+998900003205'); // A'da kassir, B'da kassasiz rol
  const refA = await mk('+998900003206'); // A'da refund

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
      .values({ name: 'FX32', slug: 'fx-32-cashier', ownerUserId: owner })
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
    const [cashierRole] = await tx
      .insert(roles)
      .values({ tenantId, name: 'Kassir' })
      .returning({ id: roles.id });
    await tx
      .insert(rolePermissions)
      .values(permRows.map((p) => ({ roleId: cashierRole!.id, permissionId: p.id })));
    const [plainRole] = await tx
      .insert(roles)
      .values({ tenantId, name: 'Kassasiz' })
      .returning({ id: roles.id });
    const asg = (userId: string, branchId: string | null, roleId = cashierRole!.id) => ({
      tenantId,
      userId,
      branchId,
      roleId,
    });
    await tx
      .insert(userAssignments)
      .values([
        asg(recA, brA),
        asg(recAll, null),
        asg(mixed, brA),
        asg(mixed, brB, plainRole!.id),
        asg(refA, brA),
      ]);
    const [pt] = await tx
      .insert(patients)
      .values({ tenantId, fullName: 'P' })
      .returning({ id: patients.id });
    patientId = pt!.id;
    const [svc] = await tx
      .insert(services)
      .values({ tenantId, code: 'S1', nameUz: 'Xizmat' })
      .returning({ id: services.id });
    svcId = svc!.id;
    await tx.insert(servicePrices).values([
      { serviceId: svcId, branchId: brA, price: '100000' },
      { serviceId: svcId, branchId: brB, price: '100000' },
    ]);
    const mkTx = async (branchId: string) =>
      (
        await tx
          .insert(cashierTransactions)
          .values({
            tenantId,
            branchId,
            patientId,
            totalAmount: '100000',
            paidAmount: '100000',
            paymentMethod: 'cash',
            type: 'payment',
            status: 'completed',
          } as never)
          .returning({ id: cashierTransactions.id })
      )[0]!.id;
    txA = await mkTx(brA);
    txB = await mkTx(brB);
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
  tok.recA = await sign(recA, CASHIER_PERMS);
  tok.recAll = await sign(recAll, CASHIER_PERMS);
  tok.ghost = await sign(ghost, CASHIER_PERMS);
  tok.mixed = await sign(mixed, CASHIER_PERMS);
  tok.refA = await sign(refA, CASHIER_PERMS);
});

describe('FX-32: begona filial → 403 branch.forbidden', () => {
  test('daily-summary: o‘z filiali 200, begona 403', async () => {
    expect(
      (await call('recA', 'GET', `/api/cashier/daily-summary?branchId=${brA}&date=${today}`))
        .status,
    ).toBe(200);
    const r = await call('recA', 'GET', `/api/cashier/daily-summary?branchId=${brB}&date=${today}`);
    expect(r.status).toBe(403);
    expect(r.json.error.code).toBe('branch.forbidden');
  });

  test('pending-visits: begona filial 403', async () => {
    expect((await call('recA', 'GET', `/api/cashier/pending-visits?branchId=${brA}`)).status).toBe(
      200,
    );
    const r = await call('recA', 'GET', `/api/cashier/pending-visits?branchId=${brB}`);
    expect(r.status).toBe(403);
    expect(r.json.error.code).toBe('branch.forbidden');
  });

  test('POST /transactions: begona filial nomidan to‘lov 403 va yozuv yaratilmaydi', async () => {
    const r = await call('recA', 'POST', '/api/cashier/transactions', payBody(brB));
    expect(r.status).toBe(403);
    expect(r.json.error.code).toBe('branch.forbidden');
    const rows = await db.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
      return tx.select().from(cashierTransactions).where(eq(cashierTransactions.branchId, brB));
    });
    expect(rows.length).toBe(1); // faqat seed qilingan txB
    const ok = await call('recA', 'POST', '/api/cashier/transactions', payBody(brA));
    expect(ok.status).toBe(201);
  });

  test('GET /transactions: branchId berilmasa faqat tayinlangan filial; begona so‘ralsa 403', async () => {
    const all = await call('recA', 'GET', '/api/cashier/transactions');
    expect(all.status).toBe(200);
    const branchIds = new Set(all.json.data.data.map((t: any) => t.branchId));
    expect(branchIds.has(brB)).toBe(false);
    expect(branchIds.has(brA)).toBe(true);
    const r = await call('recA', 'GET', `/api/cashier/transactions?branchId=${brB}`);
    expect(r.status).toBe(403);
    expect(r.json.error.code).toBe('branch.forbidden');
  });

  test('GET /transactions/{id}: begona filial tranzaksiyasi 403', async () => {
    expect((await call('recA', 'GET', `/api/cashier/transactions/${txA}`)).status).toBe(200);
    const r = await call('recA', 'GET', `/api/cashier/transactions/${txB}`);
    expect(r.status).toBe(403);
    expect(r.json.error.code).toBe('branch.forbidden');
  });

  test('refund: original.branchId begona → 403, o‘z filiali → 200', async () => {
    const bad = await call('refA', 'POST', `/api/cashier/transactions/${txB}/refund`, {});
    expect(bad.status).toBe(403);
    expect(bad.json.error.code).toBe('branch.forbidden');
    const good = await call('refA', 'POST', `/api/cashier/transactions/${txA}/refund`, {});
    expect(good.status).toBe(200);
  });

  test('ruxsat beruvchi bo‘lmagan rol tayinlovi doirani kengaytirmaydi (A kassir, B kassasiz)', async () => {
    const r = await call(
      'mixed',
      'GET',
      `/api/cashier/daily-summary?branchId=${brB}&date=${today}`,
    );
    expect(r.status).toBe(403);
    expect(
      (await call('mixed', 'GET', `/api/cashier/daily-summary?branchId=${brA}&date=${today}`))
        .status,
    ).toBe(200);
  });

  test('tayinlovsiz xodim (fail-closed) → 403', async () => {
    const r = await call(
      'ghost',
      'GET',
      `/api/cashier/daily-summary?branchId=${brA}&date=${today}`,
    );
    expect(r.status).toBe(403);
  });

  test('istisno: tenant-wide tayinlov va owner — istalgan filial', async () => {
    for (const who of ['recAll', 'owner']) {
      for (const b of [brA, brB]) {
        const r = await call(who, 'GET', `/api/cashier/daily-summary?branchId=${b}&date=${today}`);
        expect(r.status).toBe(200);
      }
      expect((await call(who, 'POST', '/api/cashier/transactions', payBody(brB))).status).toBe(201);
    }
    const list = await call('recAll', 'GET', `/api/cashier/transactions?branchId=${brB}`);
    expect(list.status).toBe(200);
  });
});
