/**
 * FX-33 (LA-31) — filial doirasi eskalatsiyasi. Filialga biriktirilgan xodim (user.invite/
 * user.manage bilan) invite/addAssignment/updateAssignment orqali o'z filialidan tashqariga
 * yoki klinika miqyosiga (branchId=null) tayinlov bera olmaydi (403 `branch.escalation`).
 * REAL HTTP (`createApp()`) + real DB + real cheklangan permset (tayinlov rolidan hosil
 * qilingan), `@owner` faqat istisno tekshiruvida.
 *
 * Ishga tushirish: `cd apps/api && bun test --env-file=../../.env --timeout 30000 tests/integration/fx-33-branch-escalation.test.ts`
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { PERMISSIONS } from '@dental/core';
import {
  branches,
  permissions as permissionsTable,
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

const mgrPerms = ['user.view', 'user.invite', 'user.manage', 'patient.view', 'appointment.view'];

let tenantId: string;
let branchA: string;
let branchB: string;
let ownerId: string;
let bmAId: string; // faqat A filialida mgr
let wideId: string; // klinika miqyosida mgr
let targetId: string;
let lowRoleId: string;
let mgrRoleId: string;
let bmAToken: string;
let wideToken: string;
let ownerToken: string;

const tokenFor = async (userId: string, perms: string[], abid: string | null = null) =>
  (await signAccess({ sub: userId, atid: tenantId, abid, perms, roleKey: 'x', lang: 'uz' })).token;

const call = (token: string, method: string, path: string, body?: unknown) =>
  createApp().request(`/api${path}`, {
    method,
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

const withTx = <T>(fn: (tx: Parameters<Parameters<typeof db.transaction>[0]>[0]) => Promise<T>) =>
  db.transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
    return fn(tx);
  });

const seedRole = (name: string, codes: string[]): Promise<string> =>
  withTx(async (tx) => {
    const [r] = await tx.insert(roles).values({ tenantId, name }).returning({ id: roles.id });
    if (!r) throw new Error('role insert failed');
    const perms = await tx
      .select({ id: permissionsTable.id })
      .from(permissionsTable)
      .where(inArray(permissionsTable.code, codes));
    await tx
      .insert(rolePermissions)
      .values(perms.map((p) => ({ roleId: r.id, permissionId: p.id })));
    return r.id;
  });

const assign = (userId: string, roleId: string, branchId: string | null) =>
  withTx(async (tx) => {
    const [a] = await tx
      .insert(userAssignments)
      .values({ userId, tenantId, roleId, branchId, isActive: true, acceptedAt: new Date() })
      .returning({ id: userAssignments.id });
    return a?.id as string;
  });

beforeAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
  for (const p of PERMISSIONS) {
    await db
      .insert(permissionsTable)
      .values({
        code: p.code,
        category: p.category,
        descriptionUz: p.descriptionUz,
        descriptionRu: p.descriptionRu,
      })
      .onConflictDoNothing();
  }
  const mk = async (phone: string, fullName: string) => {
    const [u] = await db
      .insert(users)
      .values({ phone, passwordHash: 'x', fullName })
      .returning({ id: users.id });
    if (!u) throw new Error('user insert failed');
    return u.id;
  };
  ownerId = await mk('+998900033001', 'OwnerFx33');
  bmAId = await mk('+998900033002', 'BmA');
  wideId = await mk('+998900033003', 'Wide');
  targetId = await mk('+998900033004', 'Target');

  const [tenant] = await db
    .insert(tenants)
    .values({ name: 'FX33 Clinic', slug: 'fx33-clinic', ownerUserId: ownerId })
    .returning({ id: tenants.id });
  if (!tenant) throw new Error('tenant insert failed');
  tenantId = tenant.id;

  const [a, b] = await withTx((tx) =>
    tx
      .insert(branches)
      .values([
        { tenantId, name: 'A' },
        { tenantId, name: 'B' },
      ])
      .returning({ id: branches.id }),
  );
  branchA = a?.id as string;
  branchB = b?.id as string;

  mgrRoleId = await seedRole('Mgr', mgrPerms);
  lowRoleId = await seedRole('Low', ['patient.view', 'appointment.view']);
  await assign(bmAId, mgrRoleId, branchA);
  await assign(wideId, mgrRoleId, null);

  bmAToken = await tokenFor(bmAId, mgrPerms, branchA);
  wideToken = await tokenFor(wideId, mgrPerms);
  ownerToken = await tokenFor(ownerId, ['@owner']);
});

afterAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
});

const codeOf = async (res: Response) =>
  ((await res.json()) as { error: { code: string } }).error.code;

describe('FX-33 filial eskalatsiyasi (real cheklangan rol)', () => {
  test("invite: A-filial mudiri klinika miqyosidagi (branchId yo'q) tayinlov bera olmaydi; user yaratilmaydi", async () => {
    const res = await call(bmAToken, 'POST', '/users/invite', {
      phone: '+998900033101',
      fullName: 'Xodim Bir',
      roleId: lowRoleId,
    });
    expect(res.status).toBe(403);
    expect(await codeOf(res)).toBe('branch.escalation');
    expect((await db.select().from(users).where(eq(users.phone, '+998900033101'))).length).toBe(0);
  });

  test("invite: boshqa filialga (B) → 403; o'z filialiga (A) → 201", async () => {
    const bad = await call(bmAToken, 'POST', '/users/invite', {
      phone: '+998900033102',
      fullName: 'Xodim Bir',
      roleId: lowRoleId,
      branchId: branchB,
    });
    expect(bad.status).toBe(403);
    expect(await codeOf(bad)).toBe('branch.escalation');
    const ok = await call(bmAToken, 'POST', '/users/invite', {
      phone: '+998900033103',
      fullName: 'Xodim Ikki',
      roleId: lowRoleId,
      branchId: branchA,
    });
    expect(ok.status).toBe(201);
  });

  test('addAssignment: null va B → 403, A → 201', async () => {
    for (const branchId of [undefined, branchB]) {
      const res = await call(bmAToken, 'POST', `/users/${targetId}/assignments`, {
        roleId: lowRoleId,
        ...(branchId ? { branchId } : {}),
      });
      expect(res.status).toBe(403);
      expect(await codeOf(res)).toBe('branch.escalation');
    }
    const ok = await call(bmAToken, 'POST', `/users/${targetId}/assignments`, {
      roleId: lowRoleId,
      branchId: branchA,
    });
    expect(ok.status).toBe(201);
  });

  test("updateAssignment: filialni null/B ga o'zgartirish → 403; qayta faollashtirish boshqa filialda → 403", async () => {
    const id = await assign(targetId, lowRoleId, branchA);
    for (const branchId of [null, branchB]) {
      const res = await call(bmAToken, 'PATCH', `/users/assignments/${id}`, { branchId });
      expect(res.status).toBe(403);
      expect(await codeOf(res)).toBe('branch.escalation');
    }
    const [row] = await withTx((tx) =>
      tx.select().from(userAssignments).where(eq(userAssignments.id, id)),
    );
    expect(row?.branchId).toBe(branchA);

    // B filialdagi o'chirilgan tayinlovni A mudiri qayta yoqa olmaydi
    const [dead] = await withTx((tx) =>
      tx
        .insert(userAssignments)
        .values({
          userId: targetId,
          tenantId,
          roleId: lowRoleId,
          branchId: branchB,
          isActive: false,
        })
        .returning({ id: userAssignments.id }),
    );
    const res = await call(bmAToken, 'PATCH', `/users/assignments/${dead?.id}`, { isActive: true });
    expect(res.status).toBe(403);
    expect(await codeOf(res)).toBe('branch.escalation');
  });

  test('istisno: klinika miqyosidagi mudir (tenant-wide) va owner — null/B ga bera oladi', async () => {
    const w1 = await call(wideToken, 'POST', '/users/invite', {
      phone: '+998900033104',
      fullName: 'Wide Bir',
      roleId: lowRoleId,
    });
    expect(w1.status).toBe(201);
    const w2 = await call(wideToken, 'POST', '/users/invite', {
      phone: '+998900033105',
      fullName: 'Wide Ikki',
      roleId: lowRoleId,
      branchId: branchB,
    });
    expect(w2.status).toBe(201);
    const o = await call(ownerToken, 'POST', '/users/invite', {
      phone: '+998900033106',
      fullName: 'Owner Inv',
      roleId: lowRoleId,
    });
    expect(o.status).toBe(201);
  });
});
