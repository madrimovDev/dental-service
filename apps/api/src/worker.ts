/**
 * Dedicated BullMQ worker process (CLI-237 / D6).
 *
 * Runs the appointment-reminder queue consumer OUT of the API process. In prod,
 * the api service sets RUN_REMINDER_WORKER=false so only this process consumes
 * the queue (one consumer, no per-replica duplication / wasted resources). The
 * producer (`reminderQueue` in lib/queue.ts) stays in the API — appointments
 * still enqueue jobs there.
 *
 * Run: `bun run src/worker.ts` (prod) / `bun run worker` (dev, with --env-file).
 */
import { initSentry } from './lib/sentry.ts';

// Initialize Sentry first so worker errors are captured (no-op when no DSN).
initSentry('worker');

const { dbClient } = await import('./db/client.ts');
const { logger } = await import('./lib/logger.ts');
const { startReminderWorker } = await import('./lib/reminder-worker.ts');

const worker = startReminderWorker();

worker.on('ready', () => logger.info('🛠️  Reminder worker ready'));
worker.on('failed', (job, err) => logger.error({ err, jobId: job?.id }, 'Reminder job failed'));

logger.info('🛠️  Reminder worker process started');

// Graceful shutdown: stop accepting jobs, finish in-flight, close DB pool.
let shuttingDown = false;
async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, 'Worker shutting down — draining…');
  try {
    await worker.close(); // waits for in-flight jobs, then closes the Redis conn
    await dbClient.end({ timeout: 5 });
  } catch (err) {
    logger.error({ err }, 'Error during worker shutdown');
  } finally {
    process.exit(0);
  }
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
