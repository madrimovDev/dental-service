import { createApp } from './app.ts';
import { seedDiagnoses, seedPermissions } from './db/boot-seed.ts';
import { db, dbClient } from './db/client.ts';
import { env } from './lib/env.ts';
import { logger } from './lib/logger.ts';
import { reminderQueue } from './lib/queue.ts';
import { startReminderWorker } from './lib/reminder-worker.ts';
import { initSentry } from './lib/sentry.ts';

// Error tracking (no-op when SENTRY_DSN unset).
initSentry('api');

// Boot seed — idempotent platform catalogs
await seedPermissions(db);
await seedDiagnoses(db);

const app = createApp();

const server = Bun.serve({
  port: env.API_PORT,
  fetch: app.fetch,
});

// BullMQ reminder worker.
// - test: never boot (no Redis worker in tests)
// - prod: gated by RUN_REMINDER_WORKER (api service sets it false; the dedicated
//   `worker` process owns the queue consumer — see worker.ts / D6)
// - dev: defaults to true so a single `bun dev` runs everything
const inProcessWorker =
  env.NODE_ENV !== 'test' && env.RUN_REMINDER_WORKER ? startReminderWorker() : null;

logger.info(`🚀 API listening on http://localhost:${server.port}`);

// Graceful shutdown (CLI-237 / D6): on SIGTERM/SIGINT, stop accepting new
// connections, drain in-flight requests, then close DB + queue/worker so rolling
// deploys don't cut in-flight requests/transactions.
let shuttingDown = false;
async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, 'API shutting down — draining…');
  try {
    // stop() rejects new conns + waits for in-flight requests to finish.
    await server.stop();
    if (inProcessWorker) await inProcessWorker.close();
    await reminderQueue.close();
    await dbClient.end({ timeout: 5 });
  } catch (err) {
    logger.error({ err }, 'Error during shutdown');
  } finally {
    process.exit(0);
  }
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
