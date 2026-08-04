/**
 * Task 7 — `provisionTenantInTx` (REAL DB).
 *
 * `registerTenant` ichidagi mantiq (user → tenant → RLS set_config → filial →
 * rol shablonlari seed → audit) modul darajasidagi umumiy funksiyaga ajratildi.
 * Task 8 (`activate.ts`) uni `createAuthService`siz chaqiradi, shuning uchun
 * funksiya o'z RLS kontekstini o'zi o'rnatishi shart.
 *
 * 🔴 KRITIK qulf: provisioning'dan keyin AYNAN 8 rol shabloni bo'lishi va
 * ularning permission bog'lamalari to'la seed bo'lishi kerak. Bu xato sinfi
 * (rol/permission seed'i chetlab o'tilishi) loyihada uch marta takrorlangan
 * (CLAUDE.md, `project_rbac_role_gaps`) — shuning uchun faqat SONI emas,
 * templateKey to'plami VA `role_permissions` soni ham tekshiriladi.
 *
 * ⚠️ Bu test tenant-scoped jadvallarni o'qiydi (FORCE RLS) — har o'qish
 * `set_config('app.current_tenant_id', ...)` bilan tranzaksiya ichida.
 *
 * Talab: Postgres running (5433), `permissions` katalogi seed qilingan.
 * Ishga tushirish:
 *   cd apps/api && bun test --env-file=../../.env tests/integration/provisioning-tenant.test.ts
 */

import { beforeAll, describe, expect, test } from 'bun:test';
import { ROLE_TEMPLATES } from '@dental/core';
import { auditLog, branches, rolePermissions, roles, tenants, users } from '@dental/db-schema';
import { eq, sql } from 'drizzle-orm';
import { db } from '../../src/db/client.ts';
import { verifyPassword } from '../../src/lib/password.ts';
import { provisionTenantInTx } from '../../src/modules/auth/auth.service.ts';

const OWNER_PASSWORD = 'ProvisionParol123';

type ProvisionResult = {
  userId: string;
  tenantId: string;
  slug: string;
  branchId: string;
};

/** To'liq maydonli provisioning (Task 8 yo'li — vendor bergan filial + audit action). */
let full: ProvisionResult;
/** Minimal provisioning (`registerTenant` yo'li — default filial + default audit action). */
let minimal: ProvisionResult;

/** Tenant-scoped o'qish — FORCE RLS uchun kontekst o'rnatiladi. */
const scoped = <T>(
  tenantId: string,
  fn: (tx: Parameters<Parameters<typeof db.transaction>[0]>[0]) => Promise<T>,
): Promise<T> =>
  db.transaction(async (tx) => {
    await tx.execute(sql`SELECT set_config('app.current_tenant_id', ${tenantId}, true)`);
    return await fn(tx);
  });

beforeAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);

  full = await db.transaction((tx) =>
    provisionTenantInTx(tx, {
      tenantName: 'Test klinika',
      ownerPhone: '901234567',
      ownerFullName: 'Ali Valiyev',
      ownerPassword: OWNER_PASSWORD,
      defaultLanguage: 'uz',
      branchName: 'Chilonzor filiali',
      branchAddress: 'Toshkent, Chilonzor 12',
      branchPhone: '998 (71) 200-11-22',
      auditAction: 'tenant.provisioned',
    }),
  );

  minimal = await db.transaction((tx) =>
    provisionTenantInTx(tx, {
      tenantName: 'Minimal klinika',
      ownerPhone: '+998907654321',
      ownerFullName: 'Vali Aliyev',
      ownerPassword: OWNER_PASSWORD,
      defaultLanguage: 'ru',
    }),
  );
});

describe('provisionTenantInTx — foydalanuvchi va tenant', () => {
  test('telefonni kanonik shaklga keltiradi va parolni hash qiladi', async () => {
    const [user] = await db.select().from(users).where(eq(users.id, full.userId));
    expect(user).toBeDefined();
    expect(user?.phone).toBe('+998901234567');
    expect(user?.fullName).toBe('Ali Valiyev');
    expect(user?.preferredLanguage).toBe('uz');
    // Parol ochiq saqlanmaydi
    expect(user?.passwordHash).not.toBe(OWNER_PASSWORD);
    expect(await verifyPassword(OWNER_PASSWORD, user?.passwordHash ?? '')).toBe(true);
  });

  test("tenant owner_user_id yaratilgan foydalanuvchiga bog'lanadi", async () => {
    const [tenant] = await db.select().from(tenants).where(eq(tenants.id, full.tenantId));
    expect(tenant?.name).toBe('Test klinika');
    expect(tenant?.ownerUserId).toBe(full.userId);
    expect(tenant?.slug).toBe(full.slug);
    expect(tenant?.defaultLanguage).toBe('uz');
  });

  test('slug har provisioning uchun unikal', () => {
    expect(full.slug).not.toBe(minimal.slug);
  });
});

describe('provisionTenantInTx — filial', () => {
  test('filial nomi, manzili va telefonini qabul qiladi', async () => {
    const [branch] = await scoped(full.tenantId, (tx) =>
      tx.select().from(branches).where(eq(branches.id, full.branchId)),
    );
    expect(branch?.name).toBe('Chilonzor filiali');
    expect(branch?.address).toBe('Toshkent, Chilonzor 12');
    expect(branch?.phone).toBe('+998712001122');
  });

  test('filial nomi berilmasa "Bosh filial" ishlatiladi', async () => {
    const [branch] = await scoped(minimal.tenantId, (tx) =>
      tx.select().from(branches).where(eq(branches.id, minimal.branchId)),
    );
    expect(branch?.name).toBe('Bosh filial');
    expect(branch?.address).toBeNull();
    expect(branch?.phone).toBeNull();
  });
});

describe('provisionTenantInTx — rol shablonlari (KRITIK)', () => {
  test('aynan 8 rol shabloni seed qilinadi', async () => {
    const roleRows = await scoped(full.tenantId, (tx) =>
      tx.select().from(roles).where(eq(roles.tenantId, full.tenantId)),
    );
    expect(roleRows.length).toBe(8);
    expect(roleRows.every((r) => r.isTemplate && r.isSystem)).toBe(true);
    expect(new Set(roleRows.map((r) => r.templateKey))).toEqual(
      new Set(ROLE_TEMPLATES.map((t) => t.templateKey)),
    );
  });

  test("har rol shabloni o'z permission to'plamini to'liq oladi", async () => {
    const rows = await scoped(full.tenantId, (tx) =>
      tx
        .select({ templateKey: roles.templateKey, permissionId: rolePermissions.permissionId })
        .from(roles)
        .innerJoin(rolePermissions, eq(rolePermissions.roleId, roles.id))
        .where(eq(roles.tenantId, full.tenantId)),
    );

    const counts = new Map<string, number>();
    for (const row of rows) {
      const key = row.templateKey ?? '(null)';
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }

    for (const template of ROLE_TEMPLATES) {
      expect(counts.get(template.templateKey) ?? 0).toBe(template.permissions.length);
    }
  });

  test('minimal provisioning ham 8 rol shablonini seed qiladi', async () => {
    const roleRows = await scoped(minimal.tenantId, (tx) =>
      tx.select().from(roles).where(eq(roles.tenantId, minimal.tenantId)),
    );
    expect(roleRows.length).toBe(8);
  });
});

describe('provisionTenantInTx — audit', () => {
  test("audit `after` maydonida parol YO'Q", async () => {
    const rows = await scoped(full.tenantId, (tx) =>
      tx.select().from(auditLog).where(eq(auditLog.tenantId, full.tenantId)),
    );
    expect(rows.length).toBe(1);
    const entry = rows[0];
    expect(entry?.action).toBe('tenant.provisioned');
    expect(entry?.resourceType).toBe('tenant');
    expect(entry?.resourceId).toBe(full.tenantId);
    expect(entry?.userId).toBe(full.userId);
    expect(entry?.before).toBeNull();
    expect(entry?.after).toEqual({ name: 'Test klinika', slug: full.slug });
    expect(JSON.stringify(entry?.after)).not.toContain(OWNER_PASSWORD);
  });

  test('auditAction berilmasa "tenant.registered" yoziladi', async () => {
    const rows = await scoped(minimal.tenantId, (tx) =>
      tx.select().from(auditLog).where(eq(auditLog.tenantId, minimal.tenantId)),
    );
    expect(rows.length).toBe(1);
    expect(rows[0]?.action).toBe('tenant.registered');
  });
});
