import { fail, ok } from '@dental/core';
import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import type { Database } from '../../db/client.ts';
import type { AuditLogger } from '../../lib/audit-logger.ts';
import { apiResponseSchema, errorResponseSchema, okJson } from '../../lib/openapi.ts';
import { authMiddleware } from '../../middleware/auth.ts';
import { requirePermission } from '../../middleware/require-permission.ts';
import { rlsMiddleware } from '../../middleware/rls.ts';
import { toRoleDto, toRoleWithPermissionsDto } from './roles.mapper.ts';
import {
  createRoleSchema,
  roleDeleteResultSchema,
  roleDtoSchema,
  roleIdParamSchema,
  rolePermissionsResultSchema,
  roleWithPermissionsDtoSchema,
  setRolePermissionsSchema,
  updateRoleSchema,
} from './roles.schema.ts';
import { createRolesService } from './roles.service.ts';

/** Standart 404 response — get / patch / put / delete endpoint'lar uchun. */
const notFoundResponse = {
  404: {
    content: { 'application/json': { schema: errorResponseSchema } },
    description: 'Role not found',
  },
};

export const roleRoutes = (deps: { db: Database; audit: AuditLogger }) => {
  const app = new OpenAPIHono();
  app.use('*', authMiddleware());
  app.use('*', rlsMiddleware(deps.db));

  const service = createRolesService({ audit: deps.audit });

  // ─── GET / — list ─────────────────────────────────────────────────────────

  const listRoute = createRoute({
    method: 'get',
    path: '/',
    tags: ['roles'],
    operationId: 'listRoles',
    middleware: [requirePermission('role.view')] as const,
    responses: okJson(z.array(roleDtoSchema), 'List of roles'),
  });

  app.openapi(listRoute, async (c) => {
    const rows = await service.list(c);
    return c.json(ok(rows.map(toRoleDto)), 200);
  });

  // ─── POST / — create ──────────────────────────────────────────────────────

  const createRoleRoute = createRoute({
    method: 'post',
    path: '/',
    tags: ['roles'],
    operationId: 'createRole',
    middleware: [requirePermission('role.manage')] as const,
    request: {
      body: { content: { 'application/json': { schema: createRoleSchema } } },
    },
    responses: {
      201: {
        content: {
          'application/json': { schema: apiResponseSchema(roleWithPermissionsDtoSchema) },
        },
        description: 'Role created',
      },
      400: {
        content: { 'application/json': { schema: errorResponseSchema } },
        description: 'Validation error',
      },
      401: {
        content: { 'application/json': { schema: errorResponseSchema } },
        description: 'Unauthorized',
      },
      403: {
        content: { 'application/json': { schema: errorResponseSchema } },
        description: 'Forbidden',
      },
    },
  });

  app.openapi(createRoleRoute, async (c) => {
    const body = c.req.valid('json');
    const row = await service.create(c, body);
    if (!row) throw new Error('Role creation failed');
    return c.json(ok(toRoleWithPermissionsDto(row)), 201);
  });

  // ─── GET /{id} — get by id ────────────────────────────────────────────────

  const getRoute = createRoute({
    method: 'get',
    path: '/{id}',
    tags: ['roles'],
    operationId: 'getRole',
    middleware: [requirePermission('role.view')] as const,
    request: {
      params: roleIdParamSchema,
    },
    responses: {
      ...okJson(roleWithPermissionsDtoSchema, 'Role with permissions'),
      ...notFoundResponse,
    },
  });

  app.openapi(getRoute, async (c) => {
    const { id } = c.req.valid('param');
    const row = await service.findById(c, id);
    if (!row) return c.json(fail('role.not_found', 'Role not found'), 404);
    return c.json(ok(toRoleWithPermissionsDto(row)), 200);
  });

  // ─── PATCH /{id} — update ─────────────────────────────────────────────────

  const updateRoute = createRoute({
    method: 'patch',
    path: '/{id}',
    tags: ['roles'],
    operationId: 'updateRole',
    middleware: [requirePermission('role.manage')] as const,
    request: {
      params: roleIdParamSchema,
      body: { content: { 'application/json': { schema: updateRoleSchema } } },
    },
    responses: {
      ...okJson(roleWithPermissionsDtoSchema, 'Updated role'),
      ...notFoundResponse,
    },
  });

  app.openapi(updateRoute, async (c) => {
    const { id } = c.req.valid('param');
    const body = c.req.valid('json');
    const row = await service.update(c, id, body);
    if (!row) return c.json(fail('role.not_found', 'Role not found'), 404);
    return c.json(ok(toRoleWithPermissionsDto(row)), 200);
  });

  // ─── PUT /{id}/permissions — set permissions ──────────────────────────────

  const setPermissionsRoute = createRoute({
    method: 'put',
    path: '/{id}/permissions',
    tags: ['roles'],
    operationId: 'setRolePermissions',
    middleware: [requirePermission('role.manage')] as const,
    request: {
      params: roleIdParamSchema,
      body: { content: { 'application/json': { schema: setRolePermissionsSchema } } },
    },
    responses: {
      ...okJson(rolePermissionsResultSchema, 'Role permissions updated'),
      ...notFoundResponse,
    },
  });

  app.openapi(setPermissionsRoute, async (c) => {
    const { id } = c.req.valid('param');
    const body = c.req.valid('json');
    const row = await service.setPermissions(c, id, body.permissions);
    if (!row) return c.json(fail('role.not_found', 'Role not found'), 404);
    return c.json(ok(row), 200);
  });

  // ─── DELETE /{id} — delete ────────────────────────────────────────────────

  const deleteRoute = createRoute({
    method: 'delete',
    path: '/{id}',
    tags: ['roles'],
    operationId: 'deleteRole',
    middleware: [requirePermission('role.manage')] as const,
    request: {
      params: roleIdParamSchema,
    },
    responses: {
      ...okJson(roleDeleteResultSchema, 'Role deleted'),
      ...notFoundResponse,
      403: {
        content: { 'application/json': { schema: errorResponseSchema } },
        description: 'Cannot delete system role',
      },
    },
  });

  app.openapi(deleteRoute, async (c) => {
    const { id } = c.req.valid('param');
    const result = await service.remove(c, id);
    if (!result.ok) {
      const status = result.code === 'role.system_protected' ? 403 : 404;
      return c.json(fail(result.code, result.code), status);
    }
    return c.json(ok({ deleted: true as const }), 200);
  });

  return app;
};
