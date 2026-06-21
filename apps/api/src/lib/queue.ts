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
 * Deterministik job ID — yozilish bo'yicha. Bitta yozilishga bitta eslatma:
 * reschedule'da eski job `remove(jobId)` qilinadi, keyin yangi delay bilan
 * qayta `add` qilinadi. add/remove drift qilmasligi uchun bitta joyda.
 */
export const reminderJobId = (appointmentId: string) => `appointment:${appointmentId}`;
