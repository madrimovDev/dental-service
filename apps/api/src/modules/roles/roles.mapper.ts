import type { Role } from '@dental/db-schema';
import type { RoleDto, RoleWithPermissionsDto } from './roles.schema.ts';

/** DB row (Date timestamps) → RoleDto (ISO strings). List endpoint shape (no permissions). */
export const toRoleDto = (row: Role): RoleDto => ({
  id: row.id,
  tenantId: row.tenantId,
  name: row.name,
  description: row.description ?? null,
  isTemplate: row.isTemplate,
  isSystem: row.isSystem,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
});

/**
 * Service findById result (DB row + permissions[]) → RoleWithPermissionsDto.
 * Used by get/create/update/setPermissions endpoints.
 */
export const toRoleWithPermissionsDto = (
  row: Role & { permissions: string[] },
): RoleWithPermissionsDto => ({
  id: row.id,
  tenantId: row.tenantId,
  name: row.name,
  description: row.description ?? null,
  isTemplate: row.isTemplate,
  isSystem: row.isSystem,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
  permissions: row.permissions,
});
