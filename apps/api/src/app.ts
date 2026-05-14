import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { db } from './db/client.ts';
import { createAuditLogger } from './lib/audit-logger.ts';
import { env } from './lib/env.ts';
import { errorHandler } from './middleware/error-handler.ts';
import { requestId } from './middleware/request-id.ts';
import { authRoutes } from './modules/auth/index.ts';
import { branchRoutes } from './modules/branches/index.ts';
import { healthRoutes } from './modules/health/index.ts';
import { permissionRoutes } from './modules/permissions/index.ts';
import { roleRoutes } from './modules/roles/index.ts';
import { tenantRoutes } from './modules/tenants/index.ts';
import { userRoutes } from './modules/users/index.ts';

export const createApp = () => {
  const app = new Hono();
  const audit = createAuditLogger({ db });

  // Global middleware
  app.use('*', requestId());
  app.use(
    '*',
    cors({
      origin: env.WEB_ORIGIN,
      credentials: true,
    }),
  );

  // Public routes
  app.route('/api/health', healthRoutes({ db }));
  app.route('/api/auth', authRoutes({ db }));

  // Authenticated routes (auth + RLS middleware har module ichida mount qilingan)
  app.route('/api/permissions', permissionRoutes({ db }));
  app.route('/api/tenant', tenantRoutes({ db, audit }));
  app.route('/api/branches', branchRoutes({ db, audit }));
  app.route('/api/roles', roleRoutes({ db, audit }));
  app.route('/api/users', userRoutes({ db, audit }));

  // Error handler
  app.onError(errorHandler);

  return app;
};
