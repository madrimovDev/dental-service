import { ok } from '@dental/core';
import { Hono } from 'hono';
import type { Database } from '../../../db/client.ts';
import { requirePermission } from '../../../middleware/require-permission.ts';
import { createDiagnosesService } from './diagnoses.service.ts';

export const diagnosesRoutes = (deps: { db: Database }) => {
  const app = new Hono();
  const service = createDiagnosesService(deps);

  app.get('/diagnoses', requirePermission('medical_record.view'), async (c) => {
    const search = c.req.query('search') ?? undefined;
    return c.json(ok(await service.list(search)));
  });

  return app;
};
