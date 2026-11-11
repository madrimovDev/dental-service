import { OpenAPIHono } from '@hono/zod-openapi';
import type { Deps } from './deps';
import { ApiError } from './lib/errors';
import { clinicRoutes } from './modules/clinic/clinic.routes';
import { internalRoutes } from './modules/internal/internal.routes';
import { labRoutes } from './modules/lab/lab.routes';

/**
 * Lab Hub ilovasi (Bun.serve'siz — testlar `app.request` bilan chaqiradi).
 *  - `/internal/*` — Supervisor → Hub (SUPERVISOR_HUB_TOKEN)
 *  - `/v1/clinic/*` — klinika serveri (hub key)
 *  - `/v1/lab/*` — lab portali (lab user JWT)
 */
export const createApp = (deps: Deps) => {
  const app = new OpenAPIHono();

  app.onError((err, c) => {
    if (err instanceof ApiError) {
      return c.json(
        { error: { code: err.code, ...(err.details ? { details: err.details } : {}) } },
        err.status,
      );
    }
    console.error('[lab-hub] unhandled', err);
    return c.json({ error: { code: 'internal_error' } }, 500);
  });
  app.notFound((c) => c.json({ error: { code: 'not_found' } }, 404));

  app.get('/health', (c) => c.json({ status: 'ok' }));

  app.route('/internal', internalRoutes(deps));
  app.route('/v1/clinic', clinicRoutes(deps));
  app.route('/v1/lab', labRoutes(deps));

  app.doc('/openapi.json', { openapi: '3.0.0', info: { title: 'Lab Hub API', version: '0.1.0' } });

  return app;
};
