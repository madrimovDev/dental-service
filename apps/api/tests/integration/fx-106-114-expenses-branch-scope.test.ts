/**
 * FX-106 + FX-114 (LB-15/LB-23, D-8) — xarajatlar chaqiruvchining tayinlangan filiallari
 * bilan cheklanadi. REAL DB + REAL HTTP (createApp) + real `user_assignments` + real
 * cheklangan rol. @owner va tenant-wide tayinlov istisno; tenant-darajali (branchId=null)
 * xarajat filialga tayinlangan xodimga yopiq.
 *
 * Run: cd apps/api && bun test --env-file=../../.env --timeout 30000 tests/integration/fx-106-114-expenses-branch-scope.test.ts
 */
import { beforeAll, describe, expect, test } from 'bun:test';
import {
  branches,
  expenses,
  permissions,
  rolePermissions,
  roles,
  tenants,
  userAssignments,
  users,
} from '@dental/db-schema';
import { eq, inArray, sql } from 'drizzle-orm';
import { createApp } from '../../src/app.ts';
import { db } from '../../src/db/client.ts';
import { signAccess } from '../../src/lib/jwt.ts';

const EXP_PERMS = ['expense.view', 'expense.manage'];
const app = createApp();

let tenantId: string;
let brA: string;
let brB: string;
let expA: string;
let expB: string;
let expTenant: string;
const tok: Record<string, string> = {};

const call = async (who: string, method: string, path: string, body?: unknown) => {
  const res = await app.request(path, {
    method,
    headers: {
      Authorization: `Bearer ${tok[who]}`,
      'Content-Type': 'application/json',
      'x-real-ip': `10.106.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, json: (await res.json().catch(() => null)) as any };
};

const rowOf = async (id: string) =>
  db.transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
    return (await tx.select().from(expenses).where(eq(expenses.id, id)))[0] ?? null;
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
  const owner = await mk('+998900010601');
  const mgrA = await mk('+998900010602'); // faqat A
  const mgrAll = await mk('+998900010603'); // tenant-wide
  const ghost = await mk('+998900010604'); // tayinlov yo'q
  const mixed = await mk('+998900010605'); // A'da xarajat roli, B'da yo'q

  for (const code of EXP_PERMS) {
    await db.insert(permissions).values({ code, category: 'expense' }).onConflictDoNothing();
  }
  const permRows = await db
    .select({ id: permissions.id })
    .from(permissions)
    .where(inArray(permissions.code, EXP_PERMS));

  tenantId = (
    await db
      .insert(tenants)
      .values({ name: 'FX106', slug: 'fx-106-expenses', ownerUserId: owner })
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
    const [mgrRole] = await tx
      .insert(roles)
      .values({ tenantId, name: 'Filial mudiri' })
      .returning({ id: roles.id });
    await tx
      .insert(rolePermissions)
      .values(permRows.map((p) => ({ roleId: mgrRole!.id, permissionId: p.id })));
    const [plainRole] = await tx
      .insert(roles)
      .values({ tenantId, name: 'Xarajatsiz' })
      .returning({ id: roles.id });
    const asg = (userId: string, branchId: string | null, roleId = mgrRole!.id) => ({
      tenantId,
      userId,
      branchId,
      roleId,
    });
    await tx
      .insert(userAssignments)
      .values([asg(mgrA, brA), asg(mgrAll, null), asg(mixed, brA), asg(mixed, brB, plainRole!.id)]);
    const mkExp = async (branchId: string | null, amount: string) =>
      (
        await tx
          .insert(expenses)
          .values({ tenantId, branchId, amount, date: '2026-11-10', note: 'seed' })
          .returning({ id: expenses.id })
      )[0]!.id;
    expA = await mkExp(brA, '100000');
    expB = await mkExp(brB, '12000000');
    expTenant = await mkExp(null, '500000');
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
  tok.mgrA = await sign(mgrA, EXP_PERMS);
  tok.mgrAll = await sign(mgrAll, EXP_PERMS);
  tok.ghost = await sign(ghost, EXP_PERMS);
  tok.mixed = await sign(mixed, EXP_PERMS);
});

describe('FX-106: o‘qish — ro‘yxat, svod, bitta xarajat', () => {
  test('GET /expenses: branchId berilmasa faqat tayinlangan filial xarajatlari (begona va tenant-darajali ko‘rinmaydi)', async () => {
    const r = await call('mgrA', 'GET', '/api/expenses');
    expect(r.status).toBe(200);
    const ids = r.json.data.data.map((e: any) => e.id);
    expect(ids).toEqual([expA]);
    expect(r.json.data.meta.total).toBe(1);
  });

  test('GET /expenses?branchId=begona → 403 branch.forbidden', async () => {
    const r = await call('mgrA', 'GET', `/api/expenses?branchId=${brB}`);
    expect(r.status).toBe(403);
    expect(r.json.error.code).toBe('branch.forbidden');
    expect((await call('mgrA', 'GET', `/api/expenses?branchId=${brA}`)).status).toBe(200);
  });

  test('GET /expenses/summary: faqat o‘z filiali jami; begona filial 403', async () => {
    const r = await call('mgrA', 'GET', '/api/expenses/summary');
    expect(r.status).toBe(200);
    expect(r.json.data.grandTotal).toBe(100000);
    const bad = await call('mgrA', 'GET', `/api/expenses/summary?branchId=${brB}`);
    expect(bad.status).toBe(403);
    expect(bad.json.error.code).toBe('branch.forbidden');
  });

  test('GET /expenses/{id}: begona filial va tenant-darajali xarajat 403, o‘zi 200', async () => {
    expect((await call('mgrA', 'GET', `/api/expenses/${expA}`)).status).toBe(200);
    for (const id of [expB, expTenant]) {
      const r = await call('mgrA', 'GET', `/api/expenses/${id}`);
      expect(r.status).toBe(403);
      expect(r.json.error.code).toBe('branch.forbidden');
    }
  });

  test('owner va tenant-wide tayinlov hammasini ko‘radi', async () => {
    for (const who of ['owner', 'mgrAll']) {
      const r = await call(who, 'GET', '/api/expenses');
      expect(r.status).toBe(200);
      expect(r.json.data.meta.total).toBe(3);
      const s = await call(who, 'GET', '/api/expenses/summary');
      expect(s.json.data.grandTotal).toBe(12600000);
    }
  });

  test('ruxsat bermaydigan rol tayinlovi doirani kengaytirmaydi; tayinlovsiz xodim fail-closed', async () => {
    const r = await call('mixed', 'GET', `/api/expenses?branchId=${brB}`);
    expect(r.status).toBe(403);
    expect((await call('mixed', 'GET', '/api/expenses')).json.data.meta.total).toBe(1);
    const g = await call('ghost', 'GET', '/api/expenses');
    expect(g.status).toBe(403);
    expect((await call('ghost', 'GET', '/api/expenses/summary')).status).toBe(403);
  });
});
