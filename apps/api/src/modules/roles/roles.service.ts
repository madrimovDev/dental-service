import { OWNER_ONLY_PERMISSIONS } from '@dental/core';
import { permissions as permissionsTable, rolePermissions, roles } from '@dental/db-schema';
import { and, eq, inArray } from 'drizzle-orm';
import type { Context } from 'hono';
import { getDb } from '../../db/scoped.ts';
import type { AuditLogger } from '../../lib/audit-logger.ts';
import type { CreateRoleInput, UpdateRoleInput } from './roles.schema.ts';

const filterOwnerOnly = (codes: string[]): string[] =>
  codes.filter((c) => !(OWNER_ONLY_PERMISSIONS as readonly string[]).includes(c));

export const createRolesService = (deps: { audit: AuditLogger }) => {
  async function list(c: Context) {
    const db = getDb(c);
    return db.select().from(roles).orderBy(roles.name);
  }

  async function findById(c: Context, id: string) {
    const db = getDb(c);
    const [role] = await db.select().from(roles).where(eq(roles.id, id));
    if (!role) return null;

    const perms = await db
      .select({ code: permissionsTable.code })
      .from(rolePermissions)
      .innerJoin(permissionsTable, eq(rolePermissions.permissionId, permissionsTable.id))
      .where(eq(rolePermissions.roleId, id));

    return { ...role, permissions: perms.map((p) => p.code) };
  }

  async function create(c: Context, input: CreateRoleInput) {
    const db = getDb(c);
    const tenantId = c.get('activeTenantId');
    if (!tenantId) throw new Error('No tenant context');

    const allowedCodes = filterOwnerOnly(input.permissions);

    const [role] = await db
      .insert(roles)
      .values({
        tenantId,
        name: input.name,
        description: input.description ?? null,
        isTemplate: false,
        isSystem: false,
      })
      .returning();

    if (!role) return null;

    if (allowedCodes.length > 0) {
      const perms = await db
        .select({ id: permissionsTable.id })
        .from(permissionsTable)
        .where(inArray(permissionsTable.code, allowedCodes));

      if (perms.length > 0) {
        await db
          .insert(rolePermissions)
          .values(perms.map((p) => ({ roleId: role.id, permissionId: p.id })));
      }
    }

    await deps.audit.record(c, {
      action: 'created',
      resourceType: 'role',
      resourceId: role.id,
      after: { ...role, permissions: allowedCodes },
    });

    return findById(c, role.id);
  }

  async function update(c: Context, id: string, input: UpdateRoleInput) {
    const db = getDb(c);
    const before = await findById(c, id);
    if (!before) return null;

    if (before.isSystem) {
      // System rolelarni asosiy ma'lumotini tahrirlash mumkin, lekin permissions
      // alohida endpoint orqali (xavfsizlik)
    }

    const [updated] = await db
      .update(roles)
      .set({ ...input, updatedAt: new Date() })
      .where(eq(roles.id, id))
      .returning();

    if (updated) {
      await deps.audit.record(c, {
        action: 'updated',
        resourceType: 'role',
        resourceId: id,
        before,
        after: updated,
      });
    }

    return findById(c, id);
  }

  async function setPermissions(c: Context, id: string, codes: string[]) {
    const db = getDb(c);
    const role = await findById(c, id);
    if (!role) return null;

    const allowedCodes = filterOwnerOnly(codes);
    const beforePerms = role.permissions;

    return db.transaction(async (tx) => {
      // Replace strategy: delete all + insert
      await tx.delete(rolePermissions).where(eq(rolePermissions.roleId, id));

      if (allowedCodes.length > 0) {
        const perms = await tx
          .select({ id: permissionsTable.id })
          .from(permissionsTable)
          .where(inArray(permissionsTable.code, allowedCodes));

        if (perms.length > 0) {
          await tx
            .insert(rolePermissions)
            .values(perms.map((p) => ({ roleId: id, permissionId: p.id })));
        }
      }

      await deps.audit.record(c, {
        action: 'permissions_updated',
        resourceType: 'role',
        resourceId: id,
        before: { permissions: beforePerms },
        after: { permissions: allowedCodes },
      });

      return { roleId: id, permissions: allowedCodes };
    });
  }

  async function remove(c: Context, id: string) {
    const db = getDb(c);
    const role = await findById(c, id);
    if (!role) return { ok: false as const, code: 'role.not_found' };
    if (role.isSystem) {
      return { ok: false as const, code: 'role.system_protected' };
    }

    // FK CASCADE rolePermissions ham o'chiriladi
    await db.delete(roles).where(and(eq(roles.id, id), eq(roles.isSystem, false)));

    await deps.audit.record(c, {
      action: 'deleted',
      resourceType: 'role',
      resourceId: id,
      before: role,
    });

    return { ok: true as const };
  }

  return { list, findById, create, update, setPermissions, remove };
};

export type RolesService = ReturnType<typeof createRolesService>;
