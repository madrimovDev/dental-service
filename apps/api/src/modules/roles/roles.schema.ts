import { z } from '@hono/zod-openapi';

// ─── Request schemas ──────────────────────────────────────────────────────────

export const createRoleSchema = z.object({
  name: z.string().min(2).max(120),
  description: z.string().max(500).optional(),
  permissions: z.array(z.string()).default([]),
});
export type CreateRoleInput = z.infer<typeof createRoleSchema>;

export const updateRoleSchema = z.object({
  name: z.string().min(2).max(120).optional(),
  description: z.string().max(500).optional(),
});
export type UpdateRoleInput = z.infer<typeof updateRoleSchema>;

export const setRolePermissionsSchema = z.object({
  permissions: z.array(z.string()),
});
export type SetRolePermissionsInput = z.infer<typeof setRolePermissionsSchema>;

// ─── Path param ───────────────────────────────────────────────────────────────

/** Path param schema for routes requiring :id */
export const roleIdParamSchema = z
  .object({ id: z.uuid() })
  .openapi({ param: { name: 'id', in: 'path' } });

// ─── Response DTOs ────────────────────────────────────────────────────────────

/**
 * Role DTO — list endpoint (no permissions aggregation).
 * Matches hand-wired `Role` in packages/api-client/src/types.ts.
 */
export const roleDtoSchema = z
  .object({
    id: z.uuid(),
    tenantId: z.uuid(),
    name: z.string().openapi({ example: 'Doctor' }),
    description: z.string().nullable().openapi({ example: 'Medical staff role' }),
    isTemplate: z.boolean().openapi({ example: false }),
    isSystem: z.boolean().openapi({ example: false }),
    createdAt: z.string().openapi({ example: '2026-06-12T10:00:00.000Z' }),
    updatedAt: z.string().openapi({ example: '2026-06-12T10:00:00.000Z' }),
  })
  .openapi('Role');

export type RoleDto = z.infer<typeof roleDtoSchema>;

/**
 * Role DTO with permissions — returned by get/create/update/setPermissions.
 * Matches `Role` with `permissions?: string[]` in api-client types.
 */
export const roleWithPermissionsDtoSchema = z
  .object({
    id: z.uuid(),
    tenantId: z.uuid(),
    name: z.string().openapi({ example: 'Doctor' }),
    description: z.string().nullable().openapi({ example: 'Medical staff role' }),
    isTemplate: z.boolean().openapi({ example: false }),
    isSystem: z.boolean().openapi({ example: false }),
    createdAt: z.string().openapi({ example: '2026-06-12T10:00:00.000Z' }),
    updatedAt: z.string().openapi({ example: '2026-06-12T10:00:00.000Z' }),
    permissions: z.array(z.string()).openapi({ example: ['patient.view', 'appointment.view'] }),
  })
  .openapi('RoleWithPermissions');

export type RoleWithPermissionsDto = z.infer<typeof roleWithPermissionsDtoSchema>;

/** setPermissions response DTO */
export const rolePermissionsResultSchema = z
  .object({
    roleId: z.uuid(),
    permissions: z.array(z.string()).openapi({ example: ['patient.view'] }),
  })
  .openapi('RolePermissionsResult');

export type RolePermissionsResultDto = z.infer<typeof rolePermissionsResultSchema>;

/** DELETE response DTO */
export const roleDeleteResultSchema = z
  .object({
    deleted: z.literal(true),
  })
  .openapi('RoleDeleteResult');
