import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { db } from './db/client.ts';
import { env } from './lib/env.ts';
import { errorHandler } from './middleware/error-handler.ts';
import { requestId } from './middleware/request-id.ts';
import { authRoutes } from './modules/auth/index.ts';
import { healthRoutes } from './modules/health/index.ts';

export const createApp = () => {
  const app = new Hono();

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

  // Error handler
  app.onError(errorHandler);

  return app;
};
