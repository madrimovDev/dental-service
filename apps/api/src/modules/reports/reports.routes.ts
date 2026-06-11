import { ok } from '@dental/core';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { Database } from '../../db/client.ts';
import { authMiddleware } from '../../middleware/auth.ts';
import { requirePermission } from '../../middleware/require-permission.ts';
import { rlsMiddleware } from '../../middleware/rls.ts';
import { reportRangeSchema } from './reports.schema.ts';
import { createReportsService } from './reports.service.ts';

export const reportsRoutes = (deps: { db: Database }) => {
  const app = new Hono();
  app.use('*', authMiddleware());
  app.use('*', rlsMiddleware(deps.db));

  const service = createReportsService();

  const parseRange = (c: import('hono').Context) => {
    const parsed = reportRangeSchema.safeParse(Object.fromEntries(new URL(c.req.url).searchParams));
    if (!parsed.success) throw new HTTPException(400, { message: 'Invalid range' });
    return parsed.data;
  };

  app.get('/revenue', requirePermission('report.view'), async (c) =>
    c.json(ok(await service.revenue(c, parseRange(c)))),
  );
  app.get('/appointments', requirePermission('report.view'), async (c) =>
    c.json(ok(await service.appointmentStats(c, parseRange(c)))),
  );
  app.get('/doctors', requirePermission('report.view'), async (c) =>
    c.json(ok(await service.doctorWorkload(c, parseRange(c)))),
  );
  app.get('/treatment-plans', requirePermission('report.view'), async (c) =>
    c.json(ok(await service.planCompletion(c, parseRange(c)))),
  );

  return app;
};
