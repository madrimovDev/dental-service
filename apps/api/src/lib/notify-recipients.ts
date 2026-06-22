import { permissions, rolePermissions, tenants, userAssignments } from '@dental/db-schema';
import { and, eq, isNull, or } from 'drizzle-orm';
import type { Context } from 'hono';
import { getDb } from '../db/scoped.ts';

/**
 * Berilgan permission kodiga ega foydalanuvchilarni topadi (bildirishnoma recipient'lari).
 * Owner (`tenants.owner_user_id`) HAR DOIM kiritiladi — u implicit superuser, lekin
 * `role_permissions`'da YO'Q (CLAUDE.md §3.3), shuning uchun alohida UNION qilinadi.
 *
 * Branch qoidasi: `branchId` berilsa — shu filialga yoki tenant-wide (branch NULL)
 * tayinlangan xodimlar; `branchId` null bo'lsa — barcha permission egalari.
 *
 * Tenant izolyatsiyasi: `user_assignments` FORCE RLS (tenant_view) + explicit
 * `tenantId` predikat (defense-in-depth, cross-tenant leak'dan saqlanish).
 *
 * V2-2 (low-stock alert) uchun yozildi; V3-2 (Telegram) ham qayta ishlatadi.
 */
export async function findRecipientsWithPermission(
  c: Context,
  code: string,
  branchId: string | null,
): Promise<string[]> {
  const db = getDb(c);
  const tenantId = c.get('activeTenantId');
  if (!tenantId) return [];

  const branchPredicate = branchId
    ? or(eq(userAssignments.branchId, branchId), isNull(userAssignments.branchId))
    : undefined;

  const rows = await db
    .selectDistinct({ userId: userAssignments.userId })
    .from(userAssignments)
    .innerJoin(rolePermissions, eq(rolePermissions.roleId, userAssignments.roleId))
    .innerJoin(permissions, eq(permissions.id, rolePermissions.permissionId))
    .where(
      and(
        eq(userAssignments.tenantId, tenantId),
        eq(userAssignments.isActive, true),
        eq(permissions.code, code),
        branchPredicate,
      ),
    );

  const recipients = new Set(rows.map((r) => r.userId));

  // Owner — implicit superuser, role_permissions'da yo'q → alohida qo'shamiz.
  const [tenant] = await db
    .select({ ownerUserId: tenants.ownerUserId })
    .from(tenants)
    .where(eq(tenants.id, tenantId));
  if (tenant?.ownerUserId) recipients.add(tenant.ownerUserId);

  return [...recipients];
}
