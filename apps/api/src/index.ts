import { createApp } from './app.ts';
import { seedDiagnoses, seedPermissions } from './db/boot-seed.ts';
import { db } from './db/client.ts';
import { env } from './lib/env.ts';
import { logger } from './lib/logger.ts';
import { startReminderWorker } from './lib/reminder-worker.ts';

// Boot seed — idempotent platform catalogs
await seedPermissions(db);
await seedDiagnoses(db);

const app = createApp();

const server = Bun.serve({
  port: env.API_PORT,
  fetch: app.fetch,
});

// BullMQ reminder worker — test'da Redis worker boot qilinmaydi
if (env.NODE_ENV !== 'test') startReminderWorker();

logger.info(`🚀 API listening on http://localhost:${server.port}`);
