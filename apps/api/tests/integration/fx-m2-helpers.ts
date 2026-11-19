import { permissions, rolePermissions, roles, userAssignments } from '@dental/db-schema';
import { inArray, sql } from 'drizzle-orm';
import { db } from '../../src/db/client.ts';

/**
 * Real cheklangan rol: `perms` kodlaridan tenant roli + `user_assignments` (branchId=null → tenant-wide).
 * X-2 filial doirasi tayinlovlardan o'qiladi, shuning uchun soxta JWT yetarli emas.
 */
export const seedRoleForUser = async (
  tenantId: string,
  userId: string,
  branchId: string | null,
  perms: string[],
  roleName = `role-${userId.slice(0, 8)}`,
): Promise<void> => {
  const codes = perms.filter((p) => p !== '@owner');
  for (const code of codes) {
    await db
      .insert(permissions)
      .values({ code, category: code.split('.')[0] ?? 'misc' })
      .onConflictDoNothing();
  }
  const permRows = codes.length
    ? await db
        .select({ id: permissions.id })
        .from(permissions)
        .where(inArray(permissions.code, codes))
    : [];
  await db.transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
    const [role] = await tx.insert(roles).values({ tenantId, name: roleName }).returning({
      id: roles.id,
    });
    if (permRows.length) {
      await tx
        .insert(rolePermissions)
        .values(permRows.map((p) => ({ roleId: role!.id, permissionId: p.id })));
    }
    await tx.insert(userAssignments).values({ tenantId, userId, branchId, roleId: role!.id });
  });
};
