import { createApp } from './app.ts';
import { env } from './lib/env.ts';
import { logger } from './lib/logger.ts';

const app = createApp();

const server = Bun.serve({
  port: env.API_PORT,
  fetch: app.fetch,
});

logger.info(`🚀 API listening on http://localhost:${server.port}`);
