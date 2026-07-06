import { ok } from '@dental/core';
import { createRoute, OpenAPIHono } from '@hono/zod-openapi';
import type { Database } from '../../db/client.ts';
import type { AuditLogger } from '../../lib/audit-logger.ts';
import { okJson } from '../../lib/openapi.ts';
import { authMiddleware } from '../../middleware/auth.ts';
import { requirePermission } from '../../middleware/require-permission.ts';
import { rlsMiddleware } from '../../middleware/rls.ts';
import { toTenantSettingsDto } from './tenant-settings.mapper.ts';
import {
  tenantSettingsDtoSchema,
  tenantVerticalDtoSchema,
  updateSettingsSchema,
} from './tenant-settings.schema.ts';
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

  // CLI-80: vertical — har tenant a'zosi UI gating uchun o'qiydi (sezgir emas).
  // `requirePermission` YO'Q (faqat auth + RLS). CLI-153 saboq: rolga mos yengil endpoint.
  const verticalRoute = createRoute({
    method: 'get',
    path: '/vertical',
    tags: ['tenant-settings'],
    operationId: 'getTenantVertical',
    responses: okJson(tenantVerticalDtoSchema, 'Tenant vertical (UI gating, no permission)'),
  });

  app.openapi(verticalRoute, async (c) => {
    // CLI-442 #7: `requirePermission` yo'q — workspace tanlanmagan holatda ham chaqirilishi
    // mumkin (activeTenantId yo'q). `getOrCreate` bunday holatda 500 (`No tenant context`)
    // otar edi. Yumshoq default: tenant konteksti yo'q bo'lsa DB'ga tegmasdan schema
    // default'ini ('dental') qaytaramiz.
    const tenantId = c.get('activeTenantId');
    if (!tenantId) return c.json(ok({ vertical: 'dental' as const }), 200);
    const row = await service.getOrCreate(c);
    return c.json(ok({ vertical: row.vertical }), 200);
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
