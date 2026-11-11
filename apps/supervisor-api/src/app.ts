import { Hono } from 'hono';
import { authRoutes } from './modules/auth/auth.routes';
import { clinicsRoutes } from './modules/clinics/clinics.routes';
import { hubInternalRoutes } from './modules/hub/hub-internal.routes';
import { labsRoutes } from './modules/labs/labs.routes';
import { licensesRoutes } from './modules/licenses/licenses.routes';
import { modulesRoutes } from './modules/modules/modules.routes';
import { saasRoutes } from './modules/saas/saas.routes';

// Hono ilova instansiyasini quradigan factory — Bun.serve'siz, testlar to'g'ridan
// import qilib app.request(...) orqali chaqirishi mumkin.
export const createApp = (opts: { hubFetch?: typeof fetch } = {}) => {
  const app = new Hono();

  app.get('/health', (c) => c.json({ status: 'ok' }));

  app.route('/v1', licensesRoutes());
  app.route('/v1/admin/auth', authRoutes());
  app.route('/v1/admin/clinics', clinicsRoutes());
  // modulesRoutes defines '/licenses/:key/modules' internally, so mounting
  // it at '/v1/admin' (not '/v1/admin/modules') yields the brief's intended
  // path PATCH /v1/admin/licenses/:key/modules.
  app.route('/v1/admin', modulesRoutes());
  // Lab Hub (2026-11-12): admin «Laboratoriyalar» proksisi + Hub → Supervisor ichki verify.
  app.route('/v1/admin/labs', labsRoutes({ fetch: opts.hubFetch }));
  app.route('/internal', hubInternalRoutes());

  // L8: SaaS apps/api xizmati uchun ichki API (SUPERVISOR_SAAS_TOKEN).
  app.route('/internal/saas', saasRoutes());

  return app;
};
