/**
 * FT-04.1 (D-1) — yangi permission `discount.give` («Chegirma bera oladi»).
 *
 *  - Katalogda bor; shablonlar: Tenant Admin, Branch Manager, Receptionist (boshqa tizim
 *    rollarida YO'Q — Doctor'ga rol muharririda qo'lda yoqiladi).
 *  - Yangi tenant provisioning'ida shu uch tizim roliga real DB'da tushadi.
 *  - Mavjud tenantlar uchun backfill migratsiyasi 0070 (idempotent, custom rollarga tegmaydi).
 *  - Rol muharriri (PUT /api/roles/{id}/permissions) toggle'ni qabul qiladi — REAL cheklangan
 *    permset (Tenant Admin shabloni, `@owner` EMAS) bilan; `discount.give`siz `role.manage`
 *    egasi uni bera olmaydi (P5 eskalatsiya → 403).
 *
 *   cd apps/api && bun test tests/integration/ft-04-discount-give-permission.test.ts --env-file=../../.env --timeout 30000
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { PERMISSIONS, ROLE_TEMPLATES } from '@dental/core';
import {
  permissions as permissionsTable,
  rolePermissions,
  roles,
  userAssignments,
  users,
} from '@dental/db-schema';
import { eq, inArray, sql } from 'drizzle-orm';
import { createApp } from '../../src/app.ts';
import { createAdminDb, db } from '../../src/db/client.ts';
import { signAccess } from '../../src/lib/jwt.ts';
import { provisionTenantInTx } from '../../src/modules/auth/auth.service.ts';

const CODE = 'discount.give';
const GRANTED = ['branch_manager', 'receptionist', 'tenant_admin'];
const admin = createAdminDb();
const tenantIds: string[] = [];

const migrationStatements = (): string[] =>
  readFileSync(new URL('../../drizzle/0070_ft04_discount.sql', import.meta.url), 'utf8')
    .split('--> statement-breakpoint')
    .map((s) =>
      s
        .split('\n')
        .filter((l) => !l.trim().startsWith('--'))
        .join('\n')
        .trim(),
    )
    .filter((s) => s.length > 0);

const runMigration = async () => {
  for (const stmt of migrationStatements()) await admin.db.execute(sql.raw(stmt));
};

const seedCatalog = async () => {
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
};

/** discount.give bog'langan rollar: (tenant_id, template_key, is_system) */
const holders = async () =>
  (await admin.db.execute(sql`
    SELECT r.tenant_id, r.template_key, r.is_system, r.name
    FROM roles r
    JOIN role_permissions rp ON rp.role_id = r.id
    JOIN permissions p ON p.id = rp.permission_id
    WHERE p.code = 'discount.give'
    ORDER BY r.template_key
  `)) as unknown as {
    tenant_id: string;
    template_key: string | null;
    is_system: boolean;
    name: string;
  }[];

const withTx = <T>(
  tenantId: string,
  fn: (tx: Parameters<Parameters<typeof db.transaction>[0]>[0]) => Promise<T>,
) =>
  db.transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
    return fn(tx);
  });

const templatePerms = (key: string): string[] => {
  const t = ROLE_TEMPLATES.find((x) => x.templateKey === key);
  if (!t) throw new Error(`template not found: ${key}`);
  return [...t.permissions];
};

beforeAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
  await seedCatalog();
  for (const [name, phone] of [
    ['FT04 A', '+998900704001'],
    ['FT04 B', '+998900704002'],
  ] as const) {
    const res = await db.transaction((tx) =>
      provisionTenantInTx(tx, {
        tenantName: name,
        ownerPhone: phone,
        ownerFullName: `Owner ${name}`,
        ownerPassword: 'Passw0rd!x',
        defaultLanguage: 'uz',
      }),
    );
    tenantIds.push(res.tenantId);
  }
});

afterAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
  await seedCatalog(); // boshqa testlar uchun katalog to'liq qolsin
  await admin.client.end();
});

describe('FT-04.1 — discount.give katalog + shablonlar', () => {
  test("katalogda bor, rol muharriri yorlig'i «Chegirma bera oladi»", () => {
    const p = PERMISSIONS.find((x) => x.code === CODE);
    expect(p).toBeDefined();
    expect(p?.descriptionUz).toBe('Chegirma bera oladi');
    expect(p?.descriptionRu).toBeTruthy();
  });

  test('shablonlar: faqat Tenant Admin, Branch Manager, Receptionist', () => {
    const withCode = ROLE_TEMPLATES.filter((t) =>
      (t.permissions as readonly string[]).includes(CODE),
    )
      .map((t) => t.templateKey)
      .sort();
    expect(withCode).toEqual(GRANTED);
  });

  test("yangi tenant provisioning'ida uch tizim roliga real DB'da tushadi", async () => {
    const rows = await holders();
    for (const tid of tenantIds) {
      const keys = rows
        .filter((r) => r.tenant_id === tid)
        .map((r) => r.template_key)
        .sort();
      expect(keys).toEqual(GRANTED);
    }
  });
});

describe('FT-04.1 — backfill migratsiyasi 0070', () => {
  test("mavjud tenantlarning TA/BM/Receptionist tizim rollariga qo'shiladi; custom va boshqa rollarga emas; idempotent", async () => {
    // Migratsiyadan oldingi holat: permission qatori ham, bog'lanishlar ham yo'q.
    await admin.db.execute(sql`
      DELETE FROM role_permissions WHERE permission_id IN
        (SELECT id FROM permissions WHERE code = 'discount.give')
    `);
    await admin.db.execute(sql`DELETE FROM permissions WHERE code = 'discount.give'`);
    await admin.db.execute(
      sql`INSERT INTO roles (tenant_id, name, is_system) VALUES (${tenantIds[0]}, 'Custom FT04', false)`,
    );
    expect(await holders()).toHaveLength(0);

    await runMigration();
    await runMigration(); // idempotent

    const perm = (await admin.db.execute(
      sql`SELECT code, category, description_uz FROM permissions WHERE code = 'discount.give'`,
    )) as unknown as { code: string; category: string; description_uz: string }[];
    expect(perm).toHaveLength(1);
    expect(perm[0]?.description_uz).toBe('Chegirma bera oladi');

    const rows = await holders();
    expect(rows.every((r) => r.is_system)).toBe(true);
    expect(rows.some((r) => r.name === 'Custom FT04')).toBe(false);
    for (const tid of tenantIds) {
      const keys = rows
        .filter((r) => r.tenant_id === tid)
        .map((r) => r.template_key)
        .sort();
      expect(keys).toEqual(GRANTED); // dublikat yo'q, doctor/accountant/... yo'q
    }
  });
});

describe('FT-04.1 — rol muharriri toggle (real cheklangan permset)', () => {
  let tenantId: string;
  let customRoleId: string;
  let adminToken: string;
  let roleMgrToken: string;

  const call = (token: string, method: string, path: string, body?: unknown) =>
    createApp().request(`/api${path}`, {
      method,
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: body === undefined ? undefined : JSON.stringify(body),
    });

  const permsOfRole = (roleId: string) =>
    withTx(tenantId, (tx) =>
      tx
        .select({ code: permissionsTable.code })
        .from(rolePermissions)
        .innerJoin(permissionsTable, eq(rolePermissions.permissionId, permissionsTable.id))
        .where(eq(rolePermissions.roleId, roleId))
        .then((r) => r.map((x) => x.code)),
    );

  beforeAll(async () => {
    tenantId = tenantIds[0] as string;
    const mkUser = async (phone: string, fullName: string) => {
      const [u] = await db
        .insert(users)
        .values({ phone, passwordHash: 'x', fullName })
        .returning({ id: users.id });
      if (!u) throw new Error('user insert failed');
      return u.id;
    };
    const adminUserId = await mkUser('+998900704011', 'Admin FT04');
    const roleMgrUserId = await mkUser('+998900704012', 'RoleMgr FT04');

    const adminPerms = templatePerms('tenant_admin');
    const roleMgrPerms = ['role.view', 'role.manage', 'patient.view'];

    await withTx(tenantId, async (tx) => {
      const [taRole] = await tx
        .select({ id: roles.id })
        .from(roles)
        .where(eq(roles.templateKey, 'tenant_admin'));
      if (!taRole) throw new Error('tenant_admin role missing');
      await tx.insert(userAssignments).values({
        userId: adminUserId,
        tenantId,
        roleId: taRole.id,
        branchId: null,
        isActive: true,
        acceptedAt: new Date(),
      });
      const [custom] = await tx
        .insert(roles)
        .values({ tenantId, name: 'Shifokor+chegirma' })
        .returning({ id: roles.id });
      if (!custom) throw new Error('custom role insert failed');
      customRoleId = custom.id;
      const perms = await tx
        .select({ id: permissionsTable.id })
        .from(permissionsTable)
        .where(inArray(permissionsTable.code, ['patient.view']));
      await tx
        .insert(rolePermissions)
        .values(perms.map((p) => ({ roleId: custom.id, permissionId: p.id })));
    });

    const sign = async (sub: string, perms: string[]) =>
      (await signAccess({ sub, atid: tenantId, abid: null, perms, roleKey: 'x', lang: 'uz' }))
        .token;
    expect(adminPerms).not.toContain('@owner');
    adminToken = await sign(adminUserId, adminPerms);
    roleMgrToken = await sign(roleMgrUserId, roleMgrPerms);
  });

  test('GET /permissions katalogi discount.give ni qaytaradi (toggle manbai)', async () => {
    const res = await call(adminToken, 'GET', '/permissions');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { code: string; descriptionUz: string | null }[] };
    const p = body.data.find((x) => x.code === CODE);
    expect(p?.descriptionUz).toBe('Chegirma bera oladi');
  });

  test("discount.give'siz role.manage egasi uni bera olmaydi → 403 role.escalation", async () => {
    const res = await call(roleMgrToken, 'PUT', `/roles/${customRoleId}/permissions`, {
      permissions: ['patient.view', CODE],
    });
    expect(res.status).toBe(403);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe('role.escalation');
    expect(await permsOfRole(customRoleId)).not.toContain(CODE);
  });

  test("Tenant Admin (shablon permset) custom rolga toggle'ni yoqadi va o'chiradi", async () => {
    const on = await call(adminToken, 'PUT', `/roles/${customRoleId}/permissions`, {
      permissions: ['patient.view', CODE],
    });
    expect(on.status).toBe(200);
    expect((await permsOfRole(customRoleId)).sort()).toEqual([CODE, 'patient.view'].sort());

    const off = await call(adminToken, 'PUT', `/roles/${customRoleId}/permissions`, {
      permissions: ['patient.view'],
    });
    expect(off.status).toBe(200);
    expect(await permsOfRole(customRoleId)).toEqual(['patient.view']);
  });
});
