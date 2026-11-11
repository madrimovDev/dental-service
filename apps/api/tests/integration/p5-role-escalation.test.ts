/**
 * P5 — rol eskalatsiyasi. Xodim o'zida yo'q huquqli rolni invite/addAssignment/
 * updateAssignment orqali bera olmaydi, `role.manage` egasi esa rolga o'zida yo'q
 * permission qo'sha olmaydi. REAL HTTP (`createApp()`) + real DB + REAL cheklangan
 * permset (Branch Manager shabloni + `user.manage`), `@owner` faqat (g)da.
 *
 * Ishga tushirish: `cd apps/api && bun test --env-file=../../.env --timeout 30000 tests/integration/p5-role-escalation.test.ts`
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { PERMISSIONS, ROLE_TEMPLATES } from '@dental/core';
import {
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

const templatePerms = (key: string): string[] => {
  const t = ROLE_TEMPLATES.find((x) => x.templateKey === key);
  if (!t) throw new Error(`template not found: ${key}`);
  return [...t.permissions];
};

const adminPerms = templatePerms('tenant_admin');
// Branch Manager + `user.manage` (taklif/tayinlash huquqi bor, lekin Tenant Admin emas).
const bmPerms = [...templatePerms('branch_manager'), 'user.manage'];
const roleManagerPerms = ['role.view', 'role.manage'];

let tenantId: string;
let ownerId: string;
let bmId: string;
let roleMgrId: string;
let targetId: string;
let adminRoleId: string;
let lowRoleId: string; // BM permset ichidagi rol
let ownRoleId: string; // role.manage egasining o'z roli
let bmToken: string;
let roleMgrToken: string;
let ownerToken: string;

const tokenFor = async (userId: string, perms: string[]) =>
  (
    await signAccess({
      sub: userId,
      atid: tenantId,
      abid: null,
      perms,
      roleKey: 'x',
      lang: 'uz',
    })
  ).token;

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

const seedRole = async (name: string, codes: string[]): Promise<string> => {
  return withTx(async (tx) => {
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
};

const permsOfRole = (roleId: string) =>
  withTx((tx) =>
    tx
      .select({ code: permissionsTable.code })
      .from(rolePermissions)
      .innerJoin(permissionsTable, eq(rolePermissions.permissionId, permissionsTable.id))
      .where(eq(rolePermissions.roleId, roleId))
      .then((r) => r.map((x) => x.code)),
  );

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
  ownerId = await mk('+998900005001', 'OwnerP5');
  bmId = await mk('+998900005002', 'BmP5');
  roleMgrId = await mk('+998900005003', 'RoleMgrP5');
  targetId = await mk('+998900005004', 'TargetP5');

  const [tenant] = await db
    .insert(tenants)
    .values({ name: 'P5 Clinic', slug: 'p5-clinic', ownerUserId: ownerId })
    .returning({ id: tenants.id });
  if (!tenant) throw new Error('tenant insert failed');
  tenantId = tenant.id;

  adminRoleId = await seedRole('Tenant Admin', adminPerms);
  lowRoleId = await seedRole('FrontDesk', ['patient.view', 'appointment.view']);
  ownRoleId = await seedRole('RoleMgr', roleManagerPerms);

  bmToken = await tokenFor(bmId, bmPerms);
  roleMgrToken = await tokenFor(roleMgrId, roleManagerPerms);
  ownerToken = await tokenFor(ownerId, ['@owner']);
});

afterAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
});

describe('P5 role escalation (real restricted permset)', () => {
  test('sanity: BM permset @owner emas va Tenant Admin rolidan tor', () => {
    expect(bmPerms).not.toContain('@owner');
    expect(adminPerms.filter((p) => !bmPerms.includes(p)).length).toBeGreaterThan(0);
  });

  test('(a) BM invite Tenant Admin → 403 role.escalation (+ details.missing), user yaratilmaydi', async () => {
    const res = await call(bmToken, 'POST', '/users/invite', {
      phone: '+998900005101',
      fullName: 'Esc A',
      roleId: adminRoleId,
    });
    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: { code: string; details: { missing: string[] } } };
    expect(body.error.code).toBe('role.escalation');
    expect(body.error.details.missing.length).toBeGreaterThan(0);
    const created = await db.select().from(users).where(eq(users.phone, '+998900005101'));
    expect(created.length).toBe(0);
  });

  test('(b) BM addAssignment Tenant Admin → 403', async () => {
    const res = await call(bmToken, 'POST', `/users/${targetId}/assignments`, {
      roleId: adminRoleId,
    });
    expect(res.status).toBe(403);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe('role.escalation');
  });

  test('(c) BM updateAssignment roleId=Tenant Admin → 403, rol o‘zgarmaydi; (d) yo‘q roleId → 404', async () => {
    // BM permset ichidagi rol bilan assignment (BM permset ichida) — owner yaratadi
    const created = await call(ownerToken, 'POST', `/users/${targetId}/assignments`, {
      roleId: lowRoleId,
    });
    expect(created.status).toBe(201);
    const assignmentId = ((await created.json()) as { data: { id: string } }).data.id;

    const res = await call(bmToken, 'PATCH', `/users/assignments/${assignmentId}`, {
      roleId: adminRoleId,
    });
    expect(res.status).toBe(403);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe('role.escalation');
    const [row] = await withTx((tx) =>
      tx
        .select({ roleId: userAssignments.roleId })
        .from(userAssignments)
        .where(eq(userAssignments.id, assignmentId)),
    );
    expect(row?.roleId).toBe(lowRoleId);

    const missing = await call(bmToken, 'PATCH', `/users/assignments/${assignmentId}`, {
      roleId: crypto.randomUUID(),
    });
    expect(missing.status).toBe(404);
    expect(((await missing.json()) as { error: { code: string } }).error.code).toBe(
      'role.not_found',
    );
  });

  test('(e) role.manage egasi o‘z roliga o‘zida yo‘q permission qo‘sha olmaydi (PUT /permissions + POST /roles)', async () => {
    const before = await permsOfRole(ownRoleId);
    const res = await call(roleMgrToken, 'PUT', `/roles/${ownRoleId}/permissions`, {
      permissions: [...roleManagerPerms, 'tenant_settings.edit'],
    });
    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: { code: string; details: { missing: string[] } } };
    expect(body.error.code).toBe('role.escalation');
    expect(body.error.details.missing).toEqual(['tenant_settings.edit']);
    expect((await permsOfRole(ownRoleId)).sort()).toEqual([...before].sort());

    const create = await call(roleMgrToken, 'POST', '/roles', {
      name: 'Sneaky',
      permissions: ['tenant_settings.edit'],
    });
    expect(create.status).toBe(403);

    // o'zi ega bo'lgan huquqlar ichida — ruxsat
    const ok = await call(roleMgrToken, 'POST', '/roles', {
      name: 'Narrow',
      permissions: ['role.view'],
    });
    expect(ok.status).toBe(201);
  });

  test('(f) BM o‘z permset ichidagi rol (patient.view+appointment.view) bilan invite → 201', async () => {
    const res = await call(bmToken, 'POST', '/users/invite', {
      phone: '+998900005102',
      fullName: 'Ok F',
      roleId: lowRoleId,
    });
    expect(res.status).toBe(201);
  });

  test("(h) BM eski deaktiv Tenant Admin assignment'ni PATCH {isActive:true} bilan tiriltira olmaydi → 403", async () => {
    const [a] = await withTx((tx) =>
      tx
        .insert(userAssignments)
        .values({ userId: targetId, tenantId, roleId: adminRoleId, isActive: false })
        .returning({ id: userAssignments.id }),
    );
    const id = a?.id as string;
    const res = await call(bmToken, 'PATCH', `/users/assignments/${id}`, { isActive: true });
    expect(res.status).toBe(403);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe('role.escalation');
    const [row] = await withTx((tx) =>
      tx.select().from(userAssignments).where(eq(userAssignments.id, id)),
    );
    expect(row?.isActive).toBe(false);

    // owner (superuser) baribir tiklay oladi; BM esa o'z permset ichidagi rolni tiklay oladi
    const ok = await call(ownerToken, 'PATCH', `/users/assignments/${id}`, { isActive: true });
    expect(ok.status).toBe(200);
  });

  test("(i) BM muddati o'tgan Tenant Admin assignment'ni PATCH {validTo:null} bilan uzaytira olmaydi → 403", async () => {
    const [a] = await withTx((tx) =>
      tx
        .insert(userAssignments)
        .values({
          userId: bmId,
          tenantId,
          roleId: adminRoleId,
          isActive: true,
          validTo: new Date(Date.now() - 86_400_000),
        })
        .returning({ id: userAssignments.id }),
    );
    const id = a?.id as string;
    const res = await call(bmToken, 'PATCH', `/users/assignments/${id}`, { validTo: null });
    expect(res.status).toBe(403);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe('role.escalation');
    const [row] = await withTx((tx) =>
      tx.select().from(userAssignments).where(eq(userAssignments.id, id)),
    );
    expect(row?.validTo).not.toBeNull();

    // muddatni qisqartirish / o'z permset ichidagi rolni tiklash — ruxsat
    const [low] = await withTx((tx) =>
      tx
        .insert(userAssignments)
        .values({ userId: targetId, tenantId, roleId: lowRoleId, isActive: false })
        .returning({ id: userAssignments.id }),
    );
    const okRe = await call(bmToken, 'PATCH', `/users/assignments/${low?.id}`, { isActive: true });
    expect(okRe.status).toBe(200);
    const shorten = await call(bmToken, 'PATCH', `/users/assignments/${id}`, {
      validTo: new Date(Date.now() - 2 * 86_400_000).toISOString(),
    });
    expect(shorten.status).toBe(200);
  });

  test('(g) owner istalgan rolni bera oladi', async () => {
    const res = await call(ownerToken, 'POST', '/users/invite', {
      phone: '+998900005103',
      fullName: 'Admin G',
      roleId: adminRoleId,
    });
    expect(res.status).toBe(201);
    const perm = await call(ownerToken, 'PUT', `/roles/${ownRoleId}/permissions`, {
      permissions: [...roleManagerPerms, 'tenant_settings.edit'],
    });
    expect(perm.status).toBe(200);
  });
});
