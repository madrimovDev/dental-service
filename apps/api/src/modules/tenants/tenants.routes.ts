import { fail, ok } from '@dental/core';
import { createRoute, OpenAPIHono } from '@hono/zod-openapi';
import type { Database } from '../../db/client.ts';
import type { AuditLogger } from '../../lib/audit-logger.ts';
import { errorResponseSchema, okJson } from '../../lib/openapi.ts';
import { authMiddleware } from '../../middleware/auth.ts';
import { requirePermission } from '../../middleware/require-permission.ts';
import { rlsMiddleware } from '../../middleware/rls.ts';
import { toTenantDto } from './tenants.mapper.ts';
import { tenantDtoSchema, transferOwnershipSchema, updateTenantSchema } from './tenants.schema.ts';
import { createTenantsService } from './tenants.service.ts';

export const tenantRoutes = (deps: { db: Database; audit: AuditLogger }) => {
  const app = new OpenAPIHono();
  app.use('*', authMiddleware());
  app.use('*', rlsMiddleware(deps.db));

  const service = createTenantsService(deps);

  // GET /api/tenant — joriy tenant ma'lumotini olish
  const getRoute = createRoute({
    method: 'get',
    path: '/',
    tags: ['tenant'],
    operationId: 'getTenant',
    middleware: [requirePermission('tenant.view')] as const,
    responses: {
      ...okJson(tenantDtoSchema, 'Current tenant'),
      404: {
        content: { 'application/json': { schema: errorResponseSchema } },
        description: 'Tenant not found',
      },
    },
  });

  app.openapi(getRoute, async (c) => {
    const tenant = await service.getCurrent(c);
    if (!tenant) return c.json(fail('tenant.not_found', 'Tenant not found'), 404);
    return c.json(ok(toTenantDto(tenant)), 200);
  });

  // PATCH /api/tenant — tenant nomini / tilini yangilash
  const patchRoute = createRoute({
    method: 'patch',
    path: '/',
    tags: ['tenant'],
    operationId: 'updateTenant',
    middleware: [requirePermission('tenant.edit')] as const,
    request: {
      body: { content: { 'application/json': { schema: updateTenantSchema } } },
    },
    responses: {
      ...okJson(tenantDtoSchema, 'Updated tenant'),
      404: {
        content: { 'application/json': { schema: errorResponseSchema } },
        description: 'Tenant not found',
      },
    },
  });

  app.openapi(patchRoute, async (c) => {
    const body = c.req.valid('json');
    const updated = await service.update(c, body);
    if (!updated) return c.json(fail('tenant.not_found', 'Tenant not found'), 404);
    return c.json(ok(toTenantDto(updated)), 200);
  });

  // POST /api/tenant/transfer-ownership — OWNER-ONLY (explicit in-handler check, no requirePermission)
  const transferOwnershipRoute = createRoute({
    method: 'post',
    path: '/transfer-ownership',
    tags: ['tenant'],
    operationId: 'transferTenantOwnership',
    request: {
      body: { content: { 'application/json': { schema: transferOwnershipSchema } } },
    },
    responses: okJson(tenantDtoSchema, 'Tenant after ownership transfer'),
  });

  app.openapi(transferOwnershipRoute, async (c) => {
    const body = c.req.valid('json');
    const result = await service.transferOwnership(c, body);
    if (!result.ok) {
      const status = result.code === 'tenant.owner_only' ? 403 : 400;
      return c.json(fail(result.code, result.code), status);
    }
    if (!result.tenant) {
      return c.json(fail('tenant.not_found', 'Tenant not found'), 400);
    }
    return c.json(ok(toTenantDto(result.tenant)), 200);
  });

  return app;
};
