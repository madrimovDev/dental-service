/**
 * FX-72 — o'lik permission'lar (staff.view/invite/edit/delete, user.deactivate): hech bir
 * endpoint/ekranda tekshirilmaydi, lekin rol quruvchida tanlanardi (soxta xavfsizlik hissi).
 * Katalog va rol shablonlaridan olib tashlandi; boot-seed bazadagi eskirgan qatorlarni
 * (role_permissions bilan birga) tozalaydi. Real DB (app roli) bilan.
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { PERMISSIONS, ROLE_TEMPLATES } from '@dental/core';
import {
  permissions as permissionsTable,
  rolePermissions,
  roles,
  tenants,
  users,
} from '@dental/db-schema';
import { eq, inArray, sql } from 'drizzle-orm';
import { seedPermissions } from '../../src/db/boot-seed.ts';
import { db } from '../../src/db/client.ts';

const DEAD = ['staff.view', 'staff.invite', 'staff.edit', 'staff.delete', 'user.deactivate'];
let tenantId: string;
let roleId: string;

beforeAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
  await db.execute(sql`DELETE FROM permissions`);
  await seedPermissions(db);
  // Eski o'rnatmadan qolgan holat: bazada o'lik kodlar + ularga bog'langan rol.
  for (const code of DEAD) {
    await db
      .insert(permissionsTable)
      .values({ code, category: 'staff', descriptionUz: code, descriptionRu: code })
      .onConflictDoNothing();
  }
  const [u] = await db
    .insert(users)
    .values({ phone: '+998900072001', passwordHash: 'x', fullName: 'Owner' })
    .returning({ id: users.id });
  const [t] = await db
    .insert(tenants)
    .values({ name: 'FX72', slug: 'fx72', ownerUserId: u!.id })
    .returning({ id: tenants.id });
  tenantId = t!.id;
  await db.transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
    const [r] = await tx
      .insert(roles)
      .values({ tenantId, name: 'Eski rol' })
      .returning({ id: roles.id });
    roleId = r!.id;
    const perms = await tx
      .select({ id: permissionsTable.id })
      .from(permissionsTable)
      .where(inArray(permissionsTable.code, [...DEAD, 'patient.view']));
    await tx.insert(rolePermissions).values(perms.map((p) => ({ roleId, permissionId: p.id })));
  });
});

afterAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
});

describe('FX-72 — o`lik permission kodlari', () => {
  test('katalogda va rol shablonlarida yo`q', () => {
    const codes = new Set(PERMISSIONS.map((p) => p.code as string));
    for (const code of DEAD) expect(codes.has(code)).toBe(false);
    for (const tpl of ROLE_TEMPLATES) {
      for (const code of DEAD)
        expect((tpl.permissions as readonly string[]).includes(code)).toBe(false);
    }
  });

  test('boot-seed bazadagi eskirgan kodlarni va ularning rol bog`lamalarini tozalaydi', async () => {
    await seedPermissions(db);
    const left = await db
      .select({ code: permissionsTable.code })
      .from(permissionsTable)
      .where(inArray(permissionsTable.code, DEAD));
    expect(left).toEqual([]);
    // Haqiqiy kod saqlanadi, rol bog'lamasi faqat u uchun qoladi.
    const rows = await db.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
      return tx
        .select({ code: permissionsTable.code })
        .from(rolePermissions)
        .innerJoin(permissionsTable, eq(permissionsTable.id, rolePermissions.permissionId))
        .where(eq(rolePermissions.roleId, roleId));
    });
    expect(rows.map((r) => r.code)).toEqual(['patient.view']);
  });
});
