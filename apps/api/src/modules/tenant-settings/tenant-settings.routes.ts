import { ok } from '@dental/core';
import { createRoute, OpenAPIHono } from '@hono/zod-openapi';
import type { Database } from '../../db/client.ts';
import type { AuditLogger } from '../../lib/audit-logger.ts';
import { okJson } from '../../lib/openapi.ts';
import { authMiddleware } from '../../middleware/auth.ts';
import { requirePermission } from '../../middleware/require-permission.ts';
import { rlsMiddleware } from '../../middleware/rls.ts';
import { toTenantSettingsDto } from './tenant-settings.mapper.ts';
import { tenantSettingsDtoSchema, updateSettingsSchema } from './tenant-settings.schema.ts';
import { createTenantSettingsService } from './tenant-settings.service.ts';

export const tenantSettingsRoutes = (deps: { db: Database; audit: AuditLogger }) => {
  const app = new OpenAPIHono();
  app.use('*', authMiddleware());
  app.use('*', rlsMiddleware(deps.db));

  const service = createTenantSettingsService({ audit: deps.audit });

  const getRoute = createRoute({
    method: 'get',
    path: '/',
    tags: ['tenant-settings'],
    operationId: 'getTenantSettings',
    middleware: [requirePermission('tenant_settings.view')] as const,
    responses: okJson(tenantSettingsDtoSchema, 'Tenant settings (get-or-create)'),
  });

  app.openapi(getRoute, async (c) => {
    const row = await service.getOrCreate(c);
    return c.json(ok(toTenantSettingsDto(row)), 200);
  });

  const patchRoute = createRoute({
    method: 'patch',
    path: '/',
    tags: ['tenant-settings'],
    operationId: 'updateTenantSettings',
    middleware: [requirePermission('tenant_settings.edit')] as const,
    request: {
      body: { content: { 'application/json': { schema: updateSettingsSchema } } },
    },
    responses: okJson(tenantSettingsDtoSchema, 'Updated tenant settings'),
  });

  app.openapi(patchRoute, async (c) => {
    const body = c.req.valid('json');
    const row = await service.update(c, body);
    return c.json(ok(toTenantSettingsDto(row)), 200);
  });

  return app;
};
