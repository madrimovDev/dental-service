/**
 * FX-153 (LC-31) — xarajat yaratish/tahrirlashda categoryId/branchId shu tenantga tegishli
 * bo'lishi shart. FK RLS'ni chetlab o'tadi: begona tenant UUID'si 23503 → 500 yoki
 * (agar FK o'tib ketsa) cross-tenant bog'lanish. REAL DB + REAL HTTP + real cheklangan rol.
 *
 * Run: cd apps/api && bun test --env-file=../../.env --timeout 30000 tests/integration/fx-153-expense-refs.test.ts
 */
import { beforeAll, describe, expect, test } from 'bun:test';
import {
  branches,
  expenseCategories,
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
let catA: string;
let foreignBranch: string;
let foreignCategory: string;
let expId: string;
const tok: Record<string, string> = {};

const call = async (who: string, method: string, path: string, body?: unknown) => {
  const res = await app.request(path, {
    method,
    headers: {
      Authorization: `Bearer ${tok[who]}`,
      'Content-Type': 'application/json',
      'x-real-ip': `10.153.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`,
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

const countRows = async () =>
  db.transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
    return (await tx.select().from(expenses)).length;
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
  const owner = await mk('+998900015301');
  const mgrA = await mk('+998900015302'); // faqat A filiali, cheklangan rol
  const owner2 = await mk('+998900015303');

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
      .values({ name: 'FX153', slug: 'fx-153-a', ownerUserId: owner })
      .returning({ id: tenants.id })
  )[0]!.id;
  const tenant2 = (
    await db
      .insert(tenants)
      .values({ name: 'FX153-B', slug: 'fx-153-b', ownerUserId: owner2 })
      .returning({ id: tenants.id })
  )[0]!.id;

  await db.transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenant2}'`));
    foreignBranch = (
      await tx.insert(branches).values({ tenantId: tenant2, name: 'Begona' }).returning()
    )[0]!.id;
    foreignCategory = (
      await tx
        .insert(expenseCategories)
        .values({ tenantId: tenant2, name: 'Begona kat' })
        .returning()
    )[0]!.id;
  });

  await db.transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
    brA = (await tx.insert(branches).values({ tenantId, name: 'A' }).returning())[0]!.id;
    catA = (await tx.insert(expenseCategories).values({ tenantId, name: 'Ijara' }).returning())[0]!
      .id;
    const [mgrRole] = await tx
      .insert(roles)
      .values({ tenantId, name: 'Filial mudiri' })
      .returning({ id: roles.id });
    await tx
      .insert(rolePermissions)
      .values(permRows.map((p) => ({ roleId: mgrRole!.id, permissionId: p.id })));
    await tx
      .insert(userAssignments)
      .values({ tenantId, userId: mgrA, branchId: brA, roleId: mgrRole!.id });
    expId = (
      await tx
        .insert(expenses)
        .values({ tenantId, branchId: brA, amount: '1000', date: '2026-11-10', note: 'seed' })
        .returning({ id: expenses.id })
    )[0]!.id;
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
});

const MISSING = '00000000-0000-4000-8000-000000000153';

describe('FX-153: begona/yo‘q categoryId/branchId 4xx, 500 emas, yozuv yaratilmaydi', () => {
  test('POST begona categoryId → 400 ownership.expense_category.not_found', async () => {
    const before = await countRows();
    for (const categoryId of [foreignCategory, MISSING]) {
      for (const who of ['owner', 'mgrA']) {
        const r = await call(who, 'POST', '/api/expenses', {
          categoryId,
          branchId: brA,
          amount: 1000,
          date: '2026-11-11',
        });
        expect(r.status).toBe(400);
        expect(r.json.error.code).toBe('ownership.expense_category.not_found');
      }
    }
    expect(await countRows()).toBe(before);
  });

  test('POST begona branchId (owner — doira cheklovsiz) → 400 ownership.branch.not_found', async () => {
    const before = await countRows();
    for (const branchId of [foreignBranch, MISSING]) {
      const r = await call('owner', 'POST', '/api/expenses', {
        branchId,
        amount: 1000,
        date: '2026-11-11',
      });
      expect(r.status).toBe(400);
      expect(r.json.error.code).toBe('ownership.branch.not_found');
    }
    expect(await countRows()).toBe(before);
  });

  test('POST begona branchId cheklangan rolda — 4xx (403 doira yoki 400), hech qachon 500', async () => {
    const r = await call('mgrA', 'POST', '/api/expenses', {
      branchId: foreignBranch,
      amount: 1000,
      date: '2026-11-11',
    });
    expect([400, 403]).toContain(r.status);
  });

  test('PATCH begona categoryId/branchId → 400, qiymat o‘zgarmaydi', async () => {
    const c = await call('owner', 'PATCH', `/api/expenses/${expId}`, {
      categoryId: foreignCategory,
    });
    expect(c.status).toBe(400);
    expect(c.json.error.code).toBe('ownership.expense_category.not_found');
    const b = await call('owner', 'PATCH', `/api/expenses/${expId}`, { branchId: foreignBranch });
    expect(b.status).toBe(400);
    expect(b.json.error.code).toBe('ownership.branch.not_found');
    const row = await rowOf(expId);
    expect(row!.categoryId).toBeNull();
    expect(row!.branchId).toBe(brA);
  });

  test('o‘z tenant kategoriyasi/filiali bilan yaratish va tahrirlash 201/200', async () => {
    const ok = await call('mgrA', 'POST', '/api/expenses', {
      categoryId: catA,
      branchId: brA,
      amount: 2000,
      date: '2026-11-11',
    });
    expect(ok.status).toBe(201);
    const up = await call('mgrA', 'PATCH', `/api/expenses/${ok.json.data.id}`, {
      categoryId: catA,
    });
    expect(up.status).toBe(200);
  });
});
