import { Queue } from 'bullmq';
import { env } from './env.ts';

export type ReminderJob = { tenantId: string; appointmentId: string };

const connection = { url: env.REDIS_URL };

export const reminderQueue = new Queue<ReminderJob>('appointment-reminder', { connection });

/**
 * Recall scheduler queue (B6, RFC-0011 §2.1). Kunlik repeatable job — payload
 * yo'q (trigger faqat). Manba haqiqati DB'da; worker cross-tenant due recall'larni
 * topadi (B7). Repeatable bo'lgani uchun deploy/Redis flush'ga chidamli.
 */
export type RecallScanJob = Record<string, never>;

export const recallQueue = new Queue<RecallScanJob>('recall-scan', { connection });

export const RECALL_QUEUE_NAME = 'recall-scan';
/** Deterministik repeatable jobId — qayta boot'da takror registratsiya drift qilmaydi. */
export const RECALL_SCAN_JOB_ID = 'recall-daily-scan';

/**
 * FX-38 (LA-07): kunlik no-show sweep — payload yo'q repeatable trigger. Manba
 * haqiqati DB'da (`queue.sweepNoShows` tenant bo'yicha o'tmish hal bo'lmaganlarni topadi).
 */
export type NoShowSweepJob = Record<string, never>;

export const NO_SHOW_QUEUE_NAME = 'no-show-sweep';
export const NO_SHOW_SWEEP_JOB_ID = 'no-show-daily-sweep';
export const noShowQueue = new Queue<NoShowSweepJob>(NO_SHOW_QUEUE_NAME, { connection });

/**
 * FT-06.3: kassa rasmi retention — kunlik repeatable trigger (payload yo'q). Manba haqiqati
 * DB'da (`captured_at` < now - 90 kun).
 */
export type CashierPhotoRetentionJob = Record<string, never>;

export const CASHIER_PHOTO_QUEUE_NAME = 'cashier-photo-retention';
export const CASHIER_PHOTO_RETENTION_JOB_ID = 'cashier-photo-daily-retention';
export const cashierPhotoQueue = new Queue<CashierPhotoRetentionJob>(CASHIER_PHOTO_QUEUE_NAME, {
  connection,
});

// Reminder job ID — sof modulda (Redis'siz test qilinadi), shu yerdan qayta eksport.
export { reminderJobId } from './reminder-job-id.ts';
