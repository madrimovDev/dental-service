import { Hono } from 'hono';
import { licensesRoutes } from './modules/licenses/licenses.routes';

// Hono ilova instansiyasini quradigan factory — Bun.serve'siz, testlar to'g'ridan
// import qilib app.request(...) orqali chaqirishi mumkin.
//
// Task 4 shu yerga qo'shadi:
//   app.route('/v1/admin/auth', authRoutes())
//   app.route('/v1/admin/clinics', clinicsRoutes())
//   app.route('/v1/admin/modules', modulesRoutes())
export const createApp = () => {
  const app = new Hono();

  app.get('/health', (c) => c.json({ status: 'ok' }));

  app.route('/v1', licensesRoutes());

  return app;
};
