import { ok } from '@dental/core';
import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import type { Database } from '../../db/client.ts';
import { okJson } from '../../lib/openapi.ts';
import { authMiddleware } from '../../middleware/auth.ts';
import { requirePermission } from '../../middleware/require-permission.ts';
import { rlsMiddleware } from '../../middleware/rls.ts';
import { toAuditLogEntryDto } from './audit.mapper.ts';
import {
  auditListQuerySchema,
  auditListResponseDtoSchema,
  auditRecentItemDtoSchema,
} from './audit.schema.ts';
import { createAuditService } from './audit.service.ts';

export const auditRoutes = (deps: { db: Database }) => {
  const app = new OpenAPIHono();
  app.use('*', authMiddleware());
  app.use('*', rlsMiddleware(deps.db));

  const service = createAuditService();

  const listRoute = createRoute({
    method: 'get',
    path: '/',
    tags: ['audit'],
    operationId: 'listAuditLog',
    middleware: [requirePermission('audit_log.view')] as const,
    request: {
      query: auditListQuerySchema,
    },
    responses: okJson(auditListResponseDtoSchema, 'Paginated audit log entries'),
  });

  app.openapi(listRoute, async (c) => {
    const q = c.req.valid('query');
    const result = await service.list(c, q);
    return c.json(
      ok({
        data: result.data.map(toAuditLogEntryDto),
        meta: result.meta,
      }),
      200,
    );
  });

  const recentRoute = createRoute({
    method: 'get',
    path: '/recent',
    tags: ['audit'],
    operationId: 'getRecentActivity',
    middleware: [requirePermission('audit_log.view')] as const,
    responses: okJson(z.array(auditRecentItemDtoSchema), 'Recent activity (metadata-only)'),
  });

  app.openapi(recentRoute, async (c) => {
    return c.json(ok(await service.recent(c)), 200);
  });

  return app;
};
