import { Hono } from 'hono';
import { authRoutes } from './modules/auth/auth.routes';
import { clinicsRoutes } from './modules/clinics/clinics.routes';
import { licensesRoutes } from './modules/licenses/licenses.routes';
import { modulesRoutes } from './modules/modules/modules.routes';

// Hono ilova instansiyasini quradigan factory — Bun.serve'siz, testlar to'g'ridan
// import qilib app.request(...) orqali chaqirishi mumkin.
export const createApp = () => {
  const app = new Hono();

  app.get('/health', (c) => c.json({ status: 'ok' }));

  app.route('/v1', licensesRoutes());
  app.route('/v1/admin/auth', authRoutes());
  app.route('/v1/admin/clinics', clinicsRoutes());
  // modulesRoutes defines '/licenses/:key/modules' internally, so mounting
  // it at '/v1/admin' (not '/v1/admin/modules') yields the brief's intended
  // path PATCH /v1/admin/licenses/:key/modules.
  app.route('/v1/admin', modulesRoutes());

  return app;
};
