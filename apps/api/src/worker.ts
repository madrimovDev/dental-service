/**
 * Dedicated BullMQ worker process (CLI-237 / D6).
 *
 * Runs the queue consumers OUT of the API process:
 *  - appointment-reminder (M9/M12)
 *  - recall-scan (Epic B, B6/B7) + registers the daily repeatable scheduler.
 *
 * In prod, the api service sets RUN_REMINDER_WORKER=false so only this process
 * consumes the queues (one consumer, no per-replica duplication). Producers
 * (`reminderQueue`/`recallQueue`) stay in the API. The recall worker uses the
 * ADMIN connection for the cross-tenant scan (Qaror #23) — built inside
 * startRecallWorker, separate from the app pool.
 *
 * Run: `bun run src/worker.ts` (prod) / `bun run worker` (dev, with --env-file).
 */
import { initSentry } from './lib/sentry.ts';

// Initialize Sentry first so worker errors are captured (no-op when no DSN).
initSentry('worker');

const { dbClient } = await import('./db/client.ts');
const { logger } = await import('./lib/logger.ts');
const { startReminderWorker } = await import('./lib/reminder-worker.ts');
const { startRecallWorker } = await import('./lib/recall-worker.ts');
const { registerRecallScheduler } = await import('./lib/recall-scheduler.ts');

const worker = startReminderWorker();
worker.on('ready', () => logger.info('🛠️  Reminder worker ready'));
worker.on('failed', (job, err) => logger.error({ err, jobId: job?.id }, 'Reminder job failed'));

// Epic B: recall scan consumer + daily repeatable scheduler registration. The
// scheduler lives with the consumer (dedicated worker process owns the queue).
const recall = startRecallWorker();
recall.worker.on('ready', () => logger.info('🛠️  Recall worker ready'));
recall.worker.on('failed', (job, err) =>
  logger.error({ err, jobId: job?.id }, 'Recall scan job failed'),
);
await registerRecallScheduler();

logger.info('🛠️  Worker process started (reminder + recall)');

// Graceful shutdown: stop accepting jobs, finish in-flight, close DB pools.
let shuttingDown = false;
async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, 'Worker shutting down — draining…');
  try {
    await worker.close(); // waits for in-flight jobs, then closes the Redis conn
    await recall.close(); // closes recall worker + admin db pool
    await dbClient.end({ timeout: 5 });
  } catch (err) {
    logger.error({ err }, 'Error during worker shutdown');
  } finally {
    process.exit(0);
  }
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
