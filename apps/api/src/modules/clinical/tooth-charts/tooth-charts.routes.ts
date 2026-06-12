import { ok } from '@dental/core';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { AuditLogger } from '../../../lib/audit-logger.ts';
import { requirePermission } from '../../../middleware/require-permission.ts';
import { createToothChartSchema } from './tooth-charts.schema.ts';
import { createToothChartsService } from './tooth-charts.service.ts';

export const toothChartsRoutes = (deps: { audit: AuditLogger }) => {
  const app = new Hono();
  const service = createToothChartsService(deps);

  app.get(
    '/patients/:patientId/tooth-charts',
    requirePermission('medical_record.view'),
    async (c) => {
      return c.json(ok(await service.list(c, c.req.param('patientId'))));
    },
  );

  app.get(
    '/patients/:patientId/tooth-charts/latest',
    requirePermission('medical_record.view'),
    async (c) => {
      const chart = await service.getLatest(c, c.req.param('patientId'));
      if (!chart) return c.json(ok(null));
      return c.json(ok(chart));
    },
  );

  app.post('/tooth-charts', requirePermission('medical_record.edit'), async (c) => {
    const body = createToothChartSchema.safeParse(await c.req.json());
    if (!body.success) throw new HTTPException(400, { message: 'Invalid input' });
    const chart = await service.create(c, body.data);
    return c.json(ok(chart), 201);
  });

  return app;
};
