import { tenants } from '@dental/db-schema';
import { Worker } from 'bullmq';
import { createAdminDb, type Database, type DbOrTx } from '../db/client.ts';
import { withTenant as defaultWithTenant } from '../db/scoped.ts';
import { createAppointmentsService } from '../modules/appointments/index.ts';
import { createNoShowStrikesService } from '../modules/no-show-strikes/index.ts';
import { createQueueService } from '../modules/queue/index.ts';
import { createRecallsService } from '../modules/recalls/index.ts';
import { createScheduleService } from '../modules/schedule/index.ts';
import { createAuditLogger } from './audit-logger.ts';
import { env } from './env.ts';
import { logger } from './logger.ts';
import { NO_SHOW_QUEUE_NAME, NO_SHOW_SWEEP_JOB_ID, noShowQueue } from './queue.ts';
import { createReminderScheduler } from './reminder-scheduler.ts';
import { createBotContext } from './telegram/bot-context.ts';

/**
 * FX-38 (LA-07): kunlik no-show sweep.
 * `30 19 * * *` UTC = 00:30 Asia/Tashkent (UTC+5, DST yo'q). `sweepNoShows` faqat
 * BUGUNGI kun boshidan OLDINGI yozilish/ticket'larga tegadi — shuning uchun
 * Toshkent yarim tunidan keyin ishlaydi (kechagi kun tugagan). Repeatable job —
 * deploy/Redis flush'da yo'qolmaydi (recall-scheduler bilan bir xil naqsh).
 */
export const NO_SHOW_SWEEP_CRON = '30 19 * * *';

export async function registerNoShowScheduler(): Promise<void> {
  await noShowQueue.add(
    'no-show-sweep',
    {},
    {
      jobId: NO_SHOW_SWEEP_JOB_ID,
      repeat: { pattern: NO_SHOW_SWEEP_CRON },
      removeOnComplete: true,
      removeOnFail: 100,
    },
  );
  logger.info({ cron: NO_SHOW_SWEEP_CRON }, '🗓️  No-show sweep scheduler registered');
}

export type NoShowSweepDeps = {
  /** RLS-bypass admin connection — faqat tenant ID ro'yxati uchun (Qaror #23). */
  adminDb: Database;
  /** Tenant-scoped tx ochuvchi (RLS context) — odatda `withTenant`. */
  withTenant?: <T>(tenantId: string, fn: (tx: DbOrTx) => Promise<T>) => Promise<T>;
};

export type NoShowSweepResult = { tenants: number; swept: number; failed: number };

/** Sweep uchun service'lar (HTTP `app.ts`dan mustaqil — bot deps naqshi). */
function createSweepQueueService(adminDb: Database) {
  const audit = createAuditLogger({ db: adminDb });
  const schedule = createScheduleService({ audit });
  const recall = createRecallsService({ audit });
  const noShowStrike = createNoShowStrikesService({ audit });
  const reminders = async () => createReminderScheduler((await import('./queue.ts')).reminderQueue);
  let queueService: ReturnType<typeof createQueueService> | undefined;
  const appointments = createAppointmentsService({
    audit,
    schedule,
    recall,
    noShowStrike,
    queue: {
      closeLinkedOpenTicket: (c, appointmentId, ticketStatus) =>
        queueService?.closeLinkedOpenTicket(c, appointmentId, ticketStatus) ?? Promise.resolve(),
    },
    enqueueReminder: async (tenantId, appointmentId, delayMs) =>
      (await reminders()).enqueueReminder(tenantId, appointmentId, delayMs),
    removeReminder: async (appointmentId) => (await reminders()).removeReminder(appointmentId),
  });
  queueService = createQueueService({ audit, appointments });
  return queueService;
}

/**
 * Barcha tenantlar uchun `queue.sweepNoShows` (har tenant o'z tx/RLS kontekstida,
 * mustaqil try/catch — bitta tenant xatosi qolganlarni to'xtatmaydi).
 */
export async function processNoShowSweep(deps: NoShowSweepDeps): Promise<NoShowSweepResult> {
  const run = deps.withTenant ?? defaultWithTenant;
  const queue = createSweepQueueService(deps.adminDb);
  const rows = await deps.adminDb.select({ id: tenants.id }).from(tenants);
  const result: NoShowSweepResult = { tenants: rows.length, swept: 0, failed: 0 };

  for (const { id } of rows) {
    try {
      result.swept += await run(id, (tx) => queue.sweepNoShows(createBotContext(tx, id)));
    } catch (err) {
      result.failed++;
      logger.error({ err, tenantId: id }, 'No-show sweep failed for tenant');
    }
  }
  return result;
}

export function startNoShowWorker(): { worker: Worker; close: () => Promise<void> } {
  const { db: adminDb, client: adminClient } = createAdminDb();
  const worker = new Worker(
    NO_SHOW_QUEUE_NAME,
    async () => {
      const res = await processNoShowSweep({ adminDb });
      logger.info({ ...res }, 'No-show sweep finished');
    },
    { connection: { url: env.REDIS_URL } },
  );
  return {
    worker,
    close: async () => {
      await worker.close();
      await adminClient.end({ timeout: 5 });
    },
  };
}
