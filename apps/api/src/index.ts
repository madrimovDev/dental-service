import { createApp } from './app.ts';
import { seedPermissions } from './db/boot-seed.ts';
import { db } from './db/client.ts';
import { env } from './lib/env.ts';
import { logger } from './lib/logger.ts';

// Boot seed — idempotent permissions catalog
await seedPermissions(db);

const app = createApp();

const server = Bun.serve({
  port: env.API_PORT,
  fetch: app.fetch,
});

logger.info(`🚀 API listening on http://localhost:${server.port}`);
