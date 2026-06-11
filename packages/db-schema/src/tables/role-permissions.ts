import { index, pgTable, primaryKey, uuid } from 'drizzle-orm/pg-core';
import { permissions } from './permissions.ts';
import { roles } from './roles.ts';

/**
 * Role ↔ Permission many-to-many junction.
 * Roles (tenant-scoped) bog'laydi platform-level permissions'larga.
 */
export const rolePermissions = pgTable(
  'role_permissions',
  {
    roleId: uuid('role_id')
      .notNull()
      .references(() => roles.id, { onDelete: 'cascade' }),
    permissionId: uuid('permission_id')
      .notNull()
      .references(() => permissions.id, { onDelete: 'cascade' }),
  },
  (t) => [
    primaryKey({ columns: [t.roleId, t.permissionId] }),
    index('role_permissions_permission_idx').on(t.permissionId),
  ],
);

export type RolePermission = typeof rolePermissions.$inferSelect;
export type RolePermissionInsert = typeof rolePermissions.$inferInsert;
