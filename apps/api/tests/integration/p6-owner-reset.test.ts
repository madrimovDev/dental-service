/**
 * P6 — parolni faqat owner tiklaydi + vaqtinchalik parol majburiy almashtiriladi.
 * REAL HTTP (`createApp()`) + real DB + REAL cheklangan permset (Tenant Admin shabloni),
 * `@owner` faqat owner holatlarida.
 *
 * Ishga tushirish: `cd apps/api && bun test --env-file=../../.env --timeout 30000 tests/integration/p6-owner-reset.test.ts`
 */

import { afterAll, beforeAll, describe, expect, spyOn, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { PERMISSIONS, ROLE_TEMPLATES } from '@dental/core';
import {
  permissions as permissionsTable,
  refreshTokens,
  rolePermissions,
  roles,
  tenants,
  userAssignments,
  users,
} from '@dental/db-schema';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { createApp } from '../../src/app.ts';
import { db } from '../../src/db/client.ts';
import { signAccess, verifyAccess } from '../../src/lib/jwt.ts';
import { logger } from '../../src/lib/logger.ts';
import { hashPassword } from '../../src/lib/password.ts';
import { closeRateLimitRedis } from '../../src/lib/rate-limit.ts';

const templatePerms = (key: string): string[] => {
  const t = ROLE_TEMPLATES.find((x) => x.templateKey === key);
  if (!t) throw new Error(`template not found: ${key}`);
  return [...t.permissions];
};

// Tenant Admin shabloni — `user.manage` bor, lekin owner EMAS.
const adminPerms = templatePerms('tenant_admin');
const STAFF_PASSWORD = 'StaffOldPassword123!';
const IP = `10.66.0.${Math.floor(Math.random() * 250 + 1)}`;

let tenantId: string;
let ownerId: string;
let adminId: string;
let staffId: string;
let outsiderId: string;
let ownerToken: string;
let adminToken: string;

const tokenFor = async (userId: string, perms: string[], extra: { pwc?: boolean } = {}) =>
  (
    await signAccess({
      sub: userId,
      atid: tenantId,
      abid: null,
      perms,
      roleKey: 'x',
      lang: 'uz',
      ...extra,
    })
  ).token;

const call = (token: string | null, method: string, path: string, body?: unknown) =>
  createApp().request(`/api${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      'x-forwarded-for': IP,
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

const withTx = <T>(fn: (tx: Parameters<Parameters<typeof db.transaction>[0]>[0]) => Promise<T>) =>
  db.transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
    return fn(tx);
  });

const login = async (phone: string, password: string) => {
  const res = await call(null, 'POST', '/auth/login', { phone, password });
  const json = (await res.json()) as {
    data?: {
      accessToken: string;
      refreshToken: string;
      mustChangePassword: boolean;
    };
  };
  return { res, data: json.data };
};

const STAFF_PHONE = '+998900006003';

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

  const mk = async (phone: string, fullName: string, password = 'x') => {
    const [u] = await db
      .insert(users)
      .values({ phone, passwordHash: await hashPassword(password), fullName })
      .returning({ id: users.id });
    if (!u) throw new Error('user insert failed');
    return u.id;
  };
  ownerId = await mk('+998900006001', 'OwnerP6', 'OwnerPassword123!');
  adminId = await mk('+998900006002', 'AdminP6');
  staffId = await mk(STAFF_PHONE, 'StaffP6', STAFF_PASSWORD);
  outsiderId = await mk('+998900006004', 'OutsiderP6');

  const [tenant] = await db
    .insert(tenants)
    .values({ name: 'P6 Clinic', slug: 'p6-clinic', ownerUserId: ownerId })
    .returning({ id: tenants.id });
  if (!tenant) throw new Error('tenant insert failed');
  tenantId = tenant.id;

  const seedRole = (name: string, codes: string[]) =>
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
  const adminRoleId = await seedRole('Tenant Admin', adminPerms);
  const staffRoleId = await seedRole('FrontDesk', ['patient.view', 'appointment.view']);

  await withTx((tx) =>
    tx.insert(userAssignments).values([
      { userId: adminId, tenantId, roleId: adminRoleId },
      { userId: staffId, tenantId, roleId: staffRoleId },
    ]),
  );

  ownerToken = await tokenFor(ownerId, ['@owner']);
  adminToken = await tokenFor(adminId, adminPerms);
});

afterAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
  await closeRateLimitRedis();
});

describe('P6 — owner-only reset', () => {
  test('(a) Tenant Admin (user.manage bor, owner emas) reset -> 403 user.reset_owner_only', async () => {
    expect(adminPerms).toContain('user.manage');
    const res = await call(adminToken, 'POST', `/users/${staffId}/reset-password`);
    expect(res.status).toBe(403);
    const json = (await res.json()) as { error: { code: string } };
    expect(json.error.code).toBe('user.reset_owner_only');
    // Parol o'zgarmagan
    const [u] = await db.select().from(users).where(eq(users.id, staffId));
    expect(u?.mustChangePassword).toBe(false);
    expect((await login(STAFF_PHONE, STAFF_PASSWORD)).res.status).toBe(200);
  });

  test("(c) owner o'zini tiklay olmaydi -> 400 user.reset_self; begona tenant a'zosi -> 403 user.not_in_tenant", async () => {
    const self = await call(ownerToken, 'POST', `/users/${ownerId}/reset-password`);
    expect(self.status).toBe(400);
    expect(((await self.json()) as { error: { code: string } }).error.code).toBe('user.reset_self');

    const out = await call(ownerToken, 'POST', `/users/${outsiderId}/reset-password`);
    expect(out.status).toBe(403);
    expect(((await out.json()) as { error: { code: string } }).error.code).toBe(
      'user.not_in_tenant',
    );
  });
});

describe('P6 — vaqtinchalik parol oqimi', () => {
  let tempPassword: string;
  let loginAccess: string;
  let loginRefresh: string;
  const warnSpy = spyOn(logger, 'warn');
  const infoSpy = spyOn(logger, 'info');

  test("(b) owner reset -> 200, tempPassword, bayroq, refresh revoked, audit; (h) ochiq parol logda yo'q", async () => {
    // Xodim oldindan login qilgan (refresh token bor)
    const pre = await login(STAFF_PHONE, STAFF_PASSWORD);
    expect(pre.data?.mustChangePassword).toBe(false);

    const res = await call(ownerToken, 'POST', `/users/${staffId}/reset-password`);
    expect(res.status).toBe(200);
    const json = (await res.json()) as { data: { tempPassword: string; userId: string } };
    tempPassword = json.data.tempPassword;
    expect(tempPassword.length).toBeGreaterThanOrEqual(12);

    const [u] = await db.select().from(users).where(eq(users.id, staffId));
    expect(u?.mustChangePassword).toBe(true);

    const live = await db
      .select()
      .from(refreshTokens)
      .where(and(eq(refreshTokens.userId, staffId), sql`${refreshTokens.revokedAt} IS NULL`));
    expect(live.length).toBe(0);

    const audits = await withTx((tx) =>
      tx.execute(
        sql`SELECT action FROM audit_log WHERE resource_id = ${staffId} AND action = 'password_reset_by_owner'`,
      ),
    );
    expect(audits.length).toBe(1);

    // (h) runtime: logger hech qaerda ochiq parolni olmagan
    for (const call of [...warnSpy.mock.calls, ...infoSpy.mock.calls]) {
      expect(JSON.stringify(call)).not.toContain(tempPassword);
    }
    // (h) manba guard
    const src = readFileSync(
      new URL('../../src/modules/users/users.service.ts', import.meta.url),
      'utf8',
    );
    const start = src.indexOf('async function resetUserPassword');
    const end = src.indexOf('async function getProfile');
    const fn = src.slice(start, end);
    // logger chaqiruvining obyekt argumentida parol identifikatori bo'lmasin
    expect(fn).not.toMatch(/logger\.\w+\(\s*\{[^}]*\b(newPassword|tempPassword|password)\b/s);
  });

  test('(d) vaqtinchalik parol bilan login -> mustChangePassword:true, token pwc:true', async () => {
    const { res, data } = await login(STAFF_PHONE, tempPassword);
    expect(res.status).toBe(200);
    expect(data?.mustChangePassword).toBe(true);
    loginAccess = data?.accessToken ?? '';
    loginRefresh = data?.refreshToken ?? '';
    expect((await verifyAccess(loginAccess)).pwc).toBe(true);
  });

  test("(e) pwc token: tenant ma'lumoti va switch-workspace -> 403 auth.password_change_required", async () => {
    // Real kontekstli token (patient.view bor) + pwc -> baribir 403 (pwc darvozasi, permission emas)
    const withCtxPwc = await tokenFor(staffId, ['patient.view'], { pwc: true });
    const blocked = await call(withCtxPwc, 'GET', '/patients');
    expect(blocked.status).toBe(403);
    expect(((await blocked.json()) as { error: { code: string } }).error.code).toBe(
      'auth.password_change_required',
    );
    // Nazorat: xuddi shu token pwc'siz -> 200 (darvoza aynan pwc tufayli)
    const control = await tokenFor(staffId, ['patient.view']);
    expect((await call(control, 'GET', '/patients')).status).toBe(200);

    // Haqiqiy login tokeni bilan workspace tanlash ham 403
    const sw = await call(loginAccess, 'POST', '/auth/switch-workspace', {
      tenantId,
      refreshToken: loginRefresh,
    });
    expect(sw.status).toBe(403);
    expect(((await sw.json()) as { error: { code: string } }).error.code).toBe(
      'auth.password_change_required',
    );
    // /me ruxsat etilgan
    expect((await call(loginAccess, 'GET', '/auth/me')).status).toBe(200);
  });

  test('(f) /auth/refresh yangi access token ham pwc:true', async () => {
    const res = await call(null, 'POST', '/auth/refresh', { refreshToken: loginRefresh });
    expect(res.status).toBe(200);
    const json = (await res.json()) as { data: { accessToken: string; refreshToken: string } };
    expect((await verifyAccess(json.data.accessToken)).pwc).toBe(true);
    loginAccess = json.data.accessToken;
  });

  test('(g) change-password -> 200, bayroq false, yangi parol bilan login mustChangePassword:false', async () => {
    const NEW = 'BrandNewPassword456!';
    const res = await call(loginAccess, 'POST', '/auth/change-password', {
      currentPassword: tempPassword,
      newPassword: NEW,
    });
    expect(res.status).toBe(200);
    const [u] = await db.select().from(users).where(eq(users.id, staffId));
    expect(u?.mustChangePassword).toBe(false);

    const again = await login(STAFF_PHONE, NEW);
    expect(again.res.status).toBe(200);
    expect(again.data?.mustChangePassword).toBe(false);
    expect((await verifyAccess(again.data?.accessToken ?? '')).pwc).toBeFalsy();
  });
});
