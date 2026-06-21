import { logger } from './logger.ts';
import { RECALL_SCAN_JOB_ID, recallQueue } from './queue.ts';

/**
 * Recall kunlik scan cron (B6, RFC-0011 §2.1, Qaror #23).
 * `0 6 * * *` UTC = 11:00 Asia/Tashkent (UTC+5, DST yo'q). Repeatable job —
 * deploy/Redis flush'da yo'qolmaydi (uzoq delayed job'dan farqli).
 */
export const RECALL_SCAN_CRON = '0 6 * * *';

/**
 * Repeatable recall scan job'ini ro'yxatdan o'tkazadi (idempotent —
 * deterministik jobId, qayta boot drift qilmaydi). Boot'da chaqiriladi
 * (NODE_ENV!=='test'). Worker consumption'i alohida (recall-worker.ts).
 */
export async function registerRecallScheduler(): Promise<void> {
  await recallQueue.add(
    'recall-scan',
    {},
    {
      jobId: RECALL_SCAN_JOB_ID,
      repeat: { pattern: RECALL_SCAN_CRON },
      removeOnComplete: true,
      removeOnFail: 100,
    },
  );
  logger.info({ cron: RECALL_SCAN_CRON }, '🗓️  Recall scan scheduler registered');
}
