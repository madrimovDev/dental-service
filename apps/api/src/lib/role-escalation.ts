import { OWNER_ONLY_PERMISSIONS } from '@dental/core';
import { permissions as permissionsTable, rolePermissions, roles } from '@dental/db-schema';
import { eq } from 'drizzle-orm';
import type { DbOrTx } from '../db/client.ts';

/**
 * P5 — rol eskalatsiyasi himoyasi. Xodim o'zida yo'q huquqni (rol tayinlash yoki
 * rol yaratish/o'zgartirish orqali) boshqasiga ham, o'ziga ham bera olmaydi.
 * Owner (`@owner`) — implicit superuser, cheklanmaydi.
 */
export class RoleEscalationError extends Error {
  readonly code = 'role.escalation';
  constructor(readonly missing: string[]) {
    super(`Role escalation: caller lacks permissions: ${missing.join(', ')}`);
    this.name = 'RoleEscalationError';
  }
}

/** Rolning permission kodlari; rol (RLS orqali ko'rinadigan) yo'q bo'lsa `null`. */
export const loadRolePermissionCodes = async (
  db: DbOrTx,
  roleId: string,
): Promise<string[] | null> => {
  const [role] = await db.select({ id: roles.id }).from(roles).where(eq(roles.id, roleId));
  if (!role) return null;
  const rows = await db
    .select({ code: permissionsTable.code })
    .from(rolePermissions)
    .innerJoin(permissionsTable, eq(rolePermissions.permissionId, permissionsTable.id))
    .where(eq(rolePermissions.roleId, roleId));
  return rows.map((r) => r.code);
};

/** Chaqiruvchi `codes`ning barchasiga ega bo'lishi shart (owner-only kodlar e'tiborsiz). */
export const assertCanGrant = (callerPerms: string[], codes: string[]): void => {
  if (callerPerms.includes('@owner')) return;
  const ownerOnly = OWNER_ONLY_PERMISSIONS as readonly string[];
  const missing = [...new Set(codes)].filter(
    (c) => !ownerOnly.includes(c) && !callerPerms.includes(c),
  );
  if (missing.length > 0) throw new RoleEscalationError(missing);
};
