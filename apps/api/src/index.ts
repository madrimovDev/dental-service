// `api.exe migrate` — Local Desktop first-run (apps/desktop/src/first-run.ts)
// bootstraps a fresh Postgres and needs to run migrations before the server
// can boot. Production only compiles THIS file into a single binary (`bun
// build --compile --outfile api.exe src/index.ts`) — there's no separate
// migrate.ts executable to invoke, so this file must handle both modes.
// Everything below is a DYNAMIC import specifically so `env.ts` (which
// validates the FULL runtime env schema — JWT_SECRET, WEB_ORIGIN, etc. — at
// import time) never loads in migrate mode; `db/migrate.ts` only needs
// DATABASE_ADMIN_URL/DATABASE_URL, deliberately (see its own comment).
export {}; // forces module mode — no static imports left, top-level await needs one

if (process.argv[2] === 'migrate') {
  await import('./db/migrate.ts');
} else {
  const { createApp } = await import('./app.ts');
  const { seedDiagnoses, seedPermissions } = await import('./db/boot-seed.ts');
  const { db, dbClient } = await import('./db/client.ts');
  const { env } = await import('./lib/env.ts');
  const { logger } = await import('./lib/logger.ts');
  const { recallQueue, reminderQueue } = await import('./lib/queue.ts');
  const { registerRecallScheduler } = await import('./lib/recall-scheduler.ts');
  const { startRecallWorker } = await import('./lib/recall-worker.ts');
  const { startReminderWorker } = await import('./lib/reminder-worker.ts');
  const { initSentry } = await import('./lib/sentry.ts');

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

  // Epic B: recall scan worker + daily scheduler. Same gating as the reminder
  // worker — dev (RUN_REMINDER_WORKER=true) runs everything in one `bun dev`; prod
  // api sets it false and the dedicated worker process owns the queue (worker.ts).
  const inProcessRecall =
    env.NODE_ENV !== 'test' && env.RUN_REMINDER_WORKER ? startRecallWorker() : null;
  if (inProcessRecall) await registerRecallScheduler();

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
      if (inProcessRecall) await inProcessRecall.close();
      await reminderQueue.close();
      await recallQueue.close();
      await dbClient.end({ timeout: 5 });
    } catch (err) {
      logger.error({ err }, 'Error during shutdown');
    } finally {
      process.exit(0);
    }
  }

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}
