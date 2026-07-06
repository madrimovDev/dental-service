import { fail, ok } from '@dental/core';
import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import type { Database } from '../../db/client.ts';
import type { AuditLogger } from '../../lib/audit-logger.ts';
import { apiResponseSchema, errorResponseSchema, okJson } from '../../lib/openapi.ts';
import { authMiddleware } from '../../middleware/auth.ts';
import { requirePermission } from '../../middleware/require-permission.ts';
import { rlsMiddleware } from '../../middleware/rls.ts';
import { toBranchDto } from './branches.mapper.ts';
import {
  branchDeleteResultSchema,
  branchDtoSchema,
  branchIdParamSchema,
  createBranchSchema,
  updateBranchSchema,
} from './branches.schema.ts';
import { createBranchesService } from './branches.service.ts';

/** Standart 404 response — get / patch / delete endpoint'lar uchun. */
const notFoundResponse = {
  404: {
    content: { 'application/json': { schema: errorResponseSchema } },
    description: 'Branch not found',
  },
};

export const branchRoutes = (deps: { db: Database; audit: AuditLogger }) => {
  const app = new OpenAPIHono();
  app.use('*', authMiddleware());
  app.use('*', rlsMiddleware(deps.db));

  const service = createBranchesService({ audit: deps.audit });

  // ─── GET / — list ────────────────────────────────────────────────────────

  const listRoute = createRoute({
    method: 'get',
    path: '/',
    tags: ['branches'],
    operationId: 'listBranches',
    middleware: [requirePermission('branch.view')] as const,
    responses: okJson(z.array(branchDtoSchema), 'List of branches'),
  });

  app.openapi(listRoute, async (c) => {
    const rows = await service.list(c);
    return c.json(ok(rows.map(toBranchDto)), 200);
  });

  // ─── POST / — create ─────────────────────────────────────────────────────

  const createBranchRoute = createRoute({
    method: 'post',
    path: '/',
    tags: ['branches'],
    operationId: 'createBranch',
    middleware: [requirePermission('branch.create')] as const,
    request: {
      body: { content: { 'application/json': { schema: createBranchSchema } } },
    },
    responses: {
      201: {
        content: { 'application/json': { schema: apiResponseSchema(branchDtoSchema) } },
        description: 'Branch created',
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

  app.openapi(createBranchRoute, async (c) => {
    const body = c.req.valid('json');
    const row = await service.create(c, body);
    if (!row) throw new Error('Branch creation failed');
    return c.json(ok(toBranchDto(row)), 201);
  });

  // ─── GET /{id} — get by id ───────────────────────────────────────────────

  const getRoute = createRoute({
    method: 'get',
    path: '/{id}',
    tags: ['branches'],
    operationId: 'getBranch',
    middleware: [requirePermission('branch.view')] as const,
    request: {
      params: branchIdParamSchema,
    },
    responses: { ...okJson(branchDtoSchema, 'Branch'), ...notFoundResponse },
  });

  app.openapi(getRoute, async (c) => {
    const { id } = c.req.valid('param');
    const row = await service.findById(c, id);
    if (!row) return c.json(fail('branch.not_found', 'Branch not found'), 404);
    return c.json(ok(toBranchDto(row)), 200);
  });

  // ─── PATCH /{id} — update ────────────────────────────────────────────────

  const updateRoute = createRoute({
    method: 'patch',
    path: '/{id}',
    tags: ['branches'],
    operationId: 'updateBranch',
    middleware: [requirePermission('branch.edit')] as const,
    request: {
      params: branchIdParamSchema,
      body: { content: { 'application/json': { schema: updateBranchSchema } } },
    },
    responses: { ...okJson(branchDtoSchema, 'Updated branch'), ...notFoundResponse },
  });

  app.openapi(updateRoute, async (c) => {
    const { id } = c.req.valid('param');
    const body = c.req.valid('json');
    const row = await service.update(c, id, body);
    if (!row) return c.json(fail('branch.not_found', 'Branch not found'), 404);
    return c.json(ok(toBranchDto(row)), 200);
  });

  // ─── DELETE /{id} — soft delete ──────────────────────────────────────────

  const deleteRoute = createRoute({
    method: 'delete',
    path: '/{id}',
    tags: ['branches'],
    operationId: 'deleteBranch',
    middleware: [requirePermission('branch.delete')] as const,
    request: {
      params: branchIdParamSchema,
    },
    responses: {
      ...okJson(branchDeleteResultSchema, 'Branch deleted'),
      ...notFoundResponse,
      409: {
        content: { 'application/json': { schema: errorResponseSchema } },
        description: 'Branch has active dependencies (staff / future appointments)',
      },
    },
  });

  app.openapi(deleteRoute, async (c) => {
    const { id } = c.req.valid('param');
    const result = await service.remove(c, id);
    if (!result) return c.json(fail('branch.not_found', 'Branch not found'), 404);
    if (!result.ok) {
      return c.json(
        fail('branch.has_dependencies', 'Branch has active staff or upcoming appointments'),
        409,
      );
    }
    return c.json(ok({ deleted: true as const, id: result.branch.id }), 200);
  });

  return app;
};
