/**
 * FX-116 review — mavjud (oldin provisioning qilingan) tenant: tizim Branch Manager roli eski
 * shablon bilan payroll.view/payroll.manage'ga ega. Backfill migratsiyasi
 * (`drizzle/0064_fx116_bm_payroll_backfill.sql`) REAL DB'da qo'llanadi (admin ulanish — migrate
 * kabi), keyin BM rolining DB'dagi permset'i bilan HAQIQIY HTTP (`createApp()`) payroll
 * endpoint'lari 403. Accountant tizim roli va payroll'li maxsus rol tegilmaydi.
 *
 *   cd apps/api && bun test --env-file=../../.env --timeout 30000 tests/integration/fx-116-bm-payroll-backfill.test.ts
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PERMISSIONS } from '@dental/core';
import {
  permissions as permissionsTable,
  rolePermissions,
  roles,
  userAssignments,
  users,
} from '@dental/db-schema';
import { and, eq, inArray, sql } from 'drizzle-orm';
import postgres from 'postgres';
import { createApp } from '../../src/app.ts';
import { db } from '../../src/db/client.ts';
import { signAccess } from '../../src/lib/jwt.ts';
import { loadRolePermissionCodes } from '../../src/lib/role-escalation.ts';
import { provisionTenantInTx } from '../../src/modules/auth/auth.service.ts';

const MIGRATION = join(import.meta.dir, '../../drizzle/0064_fx116_bm_payroll_backfill.sql');
const PAYROLL = ['payroll.view', 'payroll.manage'];

let tenantId: string;
let bmRoleId: string;
let accRoleId: string;
let customRoleId: string;

const withTenant = <T>(fn: (tx: typeof db) => Promise<T>): Promise<T> =>
  db.transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
    return fn(tx as unknown as typeof db);
  });

const roleIdByKey = (key: string) =>
  withTenant(async (tx) => {
    const [r] = await tx
      .select({ id: roles.id })
      .from(roles)
      .where(and(eq(roles.templateKey, key), eq(roles.isSystem, true)));
    if (!r) throw new Error(`role ${key} not seeded`);
    return r.id;
  });

const codesOf = (roleId: string) =>
  withTenant(async (tx) => (await loadRolePermissionCodes(tx, roleId)) ?? []);

const userByRole: Record<string, string> = {};

const callAs = async (roleId: string, method: string, path: string, body?: unknown) => {
  const perms = await codesOf(roleId);
  const { token } = await signAccess({
    sub: userByRole[roleId] as string,
    atid: tenantId,
    abid: null,
    perms,
    roleKey: 'branch_manager',
    lang: 'uz',
  });
  const res = await createApp().request(`/api${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${token}`,
      'x-real-ip': `10.116.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return res;
};

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
  const res = await db.transaction((tx) =>
    provisionTenantInTx(tx, {
      tenantName: 'FX116 Legacy',
      ownerPhone: '+998900116000',
      ownerFullName: 'Owner FX116',
      ownerPassword: 'Passw0rd!x',
      defaultLanguage: 'uz',
    }),
  );
  tenantId = res.tenantId;
  bmRoleId = await roleIdByKey('branch_manager');
  accRoleId = await roleIdByKey('accountant');

  const payrollPermIds = (
    await db
      .select({ id: permissionsTable.id })
      .from(permissionsTable)
      .where(inArray(permissionsTable.code, PAYROLL))
  ).map((r) => r.id);

  await withTenant(async (tx) => {
    // Eski shablon holati: tizim BM roli payroll.* ga ega (FX-116'dan oldin provisioning qilingan).
    await tx
      .insert(rolePermissions)
      .values(payrollPermIds.map((permissionId) => ({ roleId: bmRoleId, permissionId })))
      .onConflictDoNothing();
    // Maxsus (custom) rol — owner ongli ravishda payroll bergan; backfill tegmasligi kerak.
    const [custom] = await tx
      .insert(roles)
      .values({ tenantId, name: 'Moliya mudiri (custom)' })
      .returning({ id: roles.id });
    customRoleId = custom!.id;
    await tx
      .insert(rolePermissions)
      .values(payrollPermIds.map((permissionId) => ({ roleId: customRoleId, permissionId })));
  });

  // Haqiqiy xodimlar (audit_log FK) — BM filialga, Accountant tenant-wide.
  for (const [roleId, phone, branchId] of [
    [bmRoleId, '+998900116001', res.branchId],
    [accRoleId, '+998900116002', null],
  ] as const) {
    const [u] = await db
      .insert(users)
      .values({ phone, passwordHash: 'x', fullName: phone })
      .returning({ id: users.id });
    userByRole[roleId] = u!.id;
    await withTenant((tx) =>
      tx.insert(userAssignments).values({
        tenantId,
        userId: u!.id,
        roleId,
        branchId,
        isActive: true,
        acceptedAt: new Date(),
      }),
    );
  }
});

afterAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
});

describe('FX-116 backfill — mavjud tenant tizim BM roli', () => {
  test('migratsiyadan OLDIN: eski BM roli payroll.* ga ega va GET /payroll/runs 200 (teshik)', async () => {
    expect(await codesOf(bmRoleId)).toEqual(expect.arrayContaining(PAYROLL));
    const r = await callAs(bmRoleId, 'GET', '/payroll/runs');
    expect(r.status).toBe(200);
  });

  test('migratsiya qo‘llangach: BM payroll endpoint’larida 403; boshqa BM ruxsatlari saqlanadi', async () => {
    const admin = postgres(process.env.DATABASE_ADMIN_URL as string, { max: 1 });
    try {
      await admin.unsafe(readFileSync(MIGRATION, 'utf8'));
      // idempotent: qayta qo'llash xato bermaydi
      await admin.unsafe(readFileSync(MIGRATION, 'utf8'));
    } finally {
      await admin.end();
    }

    const bmCodes = await codesOf(bmRoleId);
    for (const code of PAYROLL) expect(bmCodes).not.toContain(code);
    expect(bmCodes).toContain('expense.view');

    expect((await callAs(bmRoleId, 'GET', '/payroll/runs')).status).toBe(403);
    expect((await callAs(bmRoleId, 'GET', '/payroll/staff-names')).status).toBe(403);
    expect(
      (
        await callAs(bmRoleId, 'POST', '/payroll/runs', {
          periodStart: '2026-10-01',
          periodEnd: '2026-10-31',
        })
      ).status,
    ).toBe(403);
  });

  test('Accountant tizim roli va payroll’li maxsus rol tegilmaydi', async () => {
    expect(await codesOf(accRoleId)).toEqual(expect.arrayContaining(PAYROLL));
    expect(await codesOf(customRoleId)).toEqual(expect.arrayContaining(PAYROLL));
    expect((await callAs(accRoleId, 'GET', '/payroll/runs')).status).toBe(200);
  });
});
