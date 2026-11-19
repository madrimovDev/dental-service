import { permissions, rolePermissions, roles, userAssignments } from '@dental/db-schema';
import { inArray } from 'drizzle-orm';
import type { db } from '../../src/db/client.ts';

/**
 * Test yordamchisi (X-2 / FX-53): `loadBranchScope` JWT emas, `user_assignments` →
 * `role_permissions` bo'yicha hisoblaydi. JWT-only tokenli testlarga tenant-wide
 * tayinlov + rol permission'lari beradi. Tenant-RLS tx ichida chaqiriladi.
 */
export async function grantTenantWide(
  tx: typeof db,
  tenantId: string,
  userId: string,
  codes: string[],
  roleName = 'Registrator',
) {
  for (const code of codes) {
    await tx
      .insert(permissions)
      .values({ code, category: code.split('.')[0] ?? 'misc' })
      .onConflictDoNothing();
  }
  const perms = await tx
    .select({ id: permissions.id })
    .from(permissions)
    .where(inArray(permissions.code, codes));
  const [role] = await tx
    .insert(roles)
    .values({ tenantId, name: roleName })
    .returning({ id: roles.id });
  await tx
    .insert(rolePermissions)
    .values(perms.map((p) => ({ roleId: role!.id, permissionId: p.id })));
  await tx.insert(userAssignments).values({
    tenantId,
    userId,
    branchId: null,
    roleId: role!.id,
    isActive: true,
    acceptedAt: new Date(),
  });
}
