/**
 * fx-rbac #1 — `GET /api/users/grantable-roles`. REAL HTTP (`createApp()`) + real DB +
 * REAL cheklangan permset (Branch Manager shabloni — `role.view` YO'Q), `@owner` faqat
 * taqqoslash uchun. Ro'yxatdagi har rol `POST /users/invite` da 403 bermasligi kerak,
 * ro'yxatda YO'Q rol esa `role.escalation` bilan rad etilishi kerak (bir xil qoida).
 *
 * Ishga tushirish: `cd apps/api && bun test --env-file=../../.env --timeout 30000 tests/integration/fx-grantable-roles.test.ts`
 */

import { beforeAll, describe, expect, test } from 'bun:test';
import { PERMISSIONS, ROLE_TEMPLATES } from '@dental/core';
import {
  permissions as permissionsTable,
  rolePermissions,
  roles,
  tenants,
  users,
} from '@dental/db-schema';
import { inArray, sql } from 'drizzle-orm';
import { createApp } from '../../src/app.ts';
import { db } from '../../src/db/client.ts';
import { signAccess } from '../../src/lib/jwt.ts';

const templatePerms = (key: string): string[] => {
  const t = ROLE_TEMPLATES.find((x) => x.templateKey === key);
  if (!t) throw new Error(`template not found: ${key}`);
  return [...t.permissions];
};

const bmPerms = templatePerms('branch_manager');
const adminPerms = templatePerms('tenant_admin');

let tenantId: string;
let bmId: string;
let ownerId: string;
let noInviteId: string;
let adminRoleId: string;
let lowRoleId: string;
let bmRoleId: string;
let bmToken: string;
let ownerToken: string;
let noInviteToken: string;

const tokenFor = async (userId: string, perms: string[]) =>
  (await signAccess({ sub: userId, atid: tenantId, abid: null, perms, roleKey: 'x', lang: 'uz' }))
    .token;

const call = (token: string, method: string, path: string, body?: unknown) =>
  createApp().request(`/api${path}`, {
    method,
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

const seedRole = (name: string, codes: string[]): Promise<string> =>
  db.transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
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
  ownerId = await mk('+998900006001', 'OwnerGR');
  bmId = await mk('+998900006002', 'BmGR');
  noInviteId = await mk('+998900006003', 'NoInviteGR');
  const [tenant] = await db
    .insert(tenants)
    .values({ name: 'GR Clinic', slug: 'gr-clinic', ownerUserId: ownerId })
    .returning({ id: tenants.id });
  if (!tenant) throw new Error('tenant insert failed');
  tenantId = tenant.id;

  adminRoleId = await seedRole('Tenant Admin', adminPerms);
  lowRoleId = await seedRole('FrontDesk', ['patient.view', 'appointment.view']);
  bmRoleId = await seedRole('Branch Manager', bmPerms);

  bmToken = await tokenFor(bmId, bmPerms);
  ownerToken = await tokenFor(ownerId, ['@owner']);
  noInviteToken = await tokenFor(noInviteId, ['patient.view']);
});

describe('GET /api/users/grantable-roles (real Branch Manager permset)', () => {
  test('precondition: Branch Manager has user.invite but NOT role.view', () => {
    expect(bmPerms).toContain('user.invite');
    expect(bmPerms).not.toContain('role.view');
  });

  test('GET /api/roles is 403 for Branch Manager, grantable-roles is 200', async () => {
    expect((await call(bmToken, 'GET', '/roles')).status).toBe(403);
    expect((await call(bmToken, 'GET', '/users/grantable-roles')).status).toBe(200);
  });

  test('lists only roles whose permissions the caller holds', async () => {
    const res = await call(bmToken, 'GET', '/users/grantable-roles');
    const body = (await res.json()) as { data: { id: string; name: string }[] };
    const ids = body.data.map((r) => r.id);
    expect(ids).toContain(lowRoleId);
    expect(ids).toContain(bmRoleId);
    expect(ids).not.toContain(adminRoleId);
  });

  test('same rule as assertCanGrant: listed role invites (201), unlisted role is 403 role.escalation', async () => {
    const ok = await call(bmToken, 'POST', '/users/invite', {
      phone: '+998900006101',
      fullName: 'Invited Low',
      roleId: lowRoleId,
    });
    expect(ok.status).toBe(201);
    const bad = await call(bmToken, 'POST', '/users/invite', {
      phone: '+998900006102',
      fullName: 'Invited Admin',
      roleId: adminRoleId,
    });
    expect(bad.status).toBe(403);
  });

  test('owner sees every role', async () => {
    const res = await call(ownerToken, 'GET', '/users/grantable-roles');
    const body = (await res.json()) as { data: { id: string }[] };
    const ids = body.data.map((r) => r.id);
    expect(ids).toEqual(expect.arrayContaining([adminRoleId, lowRoleId, bmRoleId]));
  });

  test('caller without user.invite gets 403', async () => {
    expect((await call(noInviteToken, 'GET', '/users/grantable-roles')).status).toBe(403);
  });
});
