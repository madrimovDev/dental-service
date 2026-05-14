import { ok } from '@dental/core';
import { Hono } from 'hono';
import type { Database } from '../../db/client.ts';
import { createHealthService } from './health.service.ts';

export const healthRoutes = (deps: { db: Database }) => {
  const app = new Hono();
  const service = createHealthService(deps);

  app.get('/', async (c) => {
    const dbStatus = await service.checkDb();
    return c.json(
      ok({
        ok: true as const,
        db: dbStatus,
        ts: new Date().toISOString(),
      }),
    );
  });

  return app;
};
