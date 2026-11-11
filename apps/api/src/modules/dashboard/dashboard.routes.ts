import { fail, ok } from '@dental/core';
import { createRoute, OpenAPIHono } from '@hono/zod-openapi';
import type { Database } from '../../db/client.ts';
import { okJson } from '../../lib/openapi.ts';
import { authMiddleware } from '../../middleware/auth.ts';
import { requirePermission } from '../../middleware/require-permission.ts';
import { rlsMiddleware } from '../../middleware/rls.ts';
import { doctorPendingDtoSchema } from './dashboard.schema.ts';
import { createDashboardService } from './dashboard.service.ts';

export const dashboardRoutes = (deps: { db: Database }) => {
  const app = new OpenAPIHono();
  app.use('*', authMiddleware());
  app.use('*', rlsMiddleware(deps.db));
  const service = createDashboardService();

  const route = createRoute({
    method: 'get',
    path: '/doctor-pending',
    tags: ['dashboard'],
    operationId: 'getDoctorPending',
    middleware: [
      requirePermission('appointment.view'),
      requirePermission('medical_record.view'),
    ] as const,
    responses: okJson(doctorPendingDtoSchema, "Shifokordan kutilayotgan ishlar (faqat o'zi uchun)"),
  });

  app.openapi(route, async (c) => {
    const userId = (c.get('user') as { id: string } | undefined)?.id;
    if (!userId) return c.json(fail('auth.required', 'Authentication required'), 401);
    const perms = (c.get('accessClaims') as { perms?: string[] } | undefined)?.perms ?? [];
    const canLab = perms.includes('lab_order.view') || perms.includes('@owner');
    return c.json(ok(await service.doctorPending(c, userId, canLab)), 200);
  });

  return app;
};
