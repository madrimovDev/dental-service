import { cashierTransactionPhotos } from '@dental/db-schema';
import { Worker } from 'bullmq';
import { eq, lt } from 'drizzle-orm';
import { createAdminDb, type Database } from '../db/client.ts';
import { CASHIER_PHOTO_RETENTION_DAYS } from '../modules/cashier/cashier-photos.schema.ts';
import { env } from './env.ts';
import { logger } from './logger.ts';
import {
  CASHIER_PHOTO_QUEUE_NAME,
  CASHIER_PHOTO_RETENTION_JOB_ID,
  cashierPhotoQueue,
} from './queue.ts';
import { createLocalStorageAdapter, type StorageAdapter } from './storage.ts';

/**
 * FT-06.3 (D-4): kassa rasmlarining 90 kunlik retention'i.
 * `0 22 * * *` UTC = 03:00 Asia/Tashkent (UTC+5, DST yo'q) — kunlik repeatable job
 * (recall/no-show scheduler bilan bir xil naqsh: deploy/Redis flush'da yo'qolmaydi).
 */
export const CASHIER_PHOTO_RETENTION_CRON = '0 22 * * *';

export async function registerCashierPhotoRetentionScheduler(): Promise<void> {
  await cashierPhotoQueue.add(
    'cashier-photo-retention',
    {},
    {
      jobId: CASHIER_PHOTO_RETENTION_JOB_ID,
      repeat: { pattern: CASHIER_PHOTO_RETENTION_CRON },
      removeOnComplete: true,
      removeOnFail: 100,
    },
  );
  logger.info(
    { cron: CASHIER_PHOTO_RETENTION_CRON },
    '🗓️  Cashier photo retention scheduler registered',
  );
}

export type CashierPhotoRetentionDeps = {
  /** RLS-bypass admin connection — cross-tenant sweep (Qaror #23). */
  adminDb: Database;
  storage?: StorageAdapter;
  now?: Date;
  retentionDays?: number;
};
export type CashierPhotoRetentionResult = { deleted: number; failed: number };

/**
 * `captured_at` < now - retentionDays bo'lgan qatorlarni o'chiradi: AVVAL fayl (yo'q bo'lsa —
 * allaqachon o'chirilgan, davom), keyin qator. Fayl o'chirish haqiqiy xato bilan yiqilsa qator
 * SAQLANADI (keyingi kunda qayta uriniladi — sirli fayl yetim qolmaydi). Har qator mustaqil.
 */
export async function processCashierPhotoRetention(
  deps: CashierPhotoRetentionDeps,
): Promise<CashierPhotoRetentionResult> {
  const storage = deps.storage ?? createLocalStorageAdapter();
  const now = deps.now ?? new Date();
  const days = deps.retentionDays ?? CASHIER_PHOTO_RETENTION_DAYS;
  const cutoff = new Date(now.getTime() - days * 86_400_000);

  const stale = await deps.adminDb
    .select({ id: cashierTransactionPhotos.id, objectKey: cashierTransactionPhotos.objectKey })
    .from(cashierTransactionPhotos)
    .where(lt(cashierTransactionPhotos.capturedAt, cutoff));

  const result: CashierPhotoRetentionResult = { deleted: 0, failed: 0 };
  for (const row of stale) {
    try {
      if (row.objectKey && (await storage.exists(row.objectKey))) {
        await storage.remove(row.objectKey);
      }
      await deps.adminDb
        .delete(cashierTransactionPhotos)
        .where(eq(cashierTransactionPhotos.id, row.id));
      result.deleted++;
    } catch (err) {
      result.failed++;
      logger.error({ err, photoId: row.id }, 'Cashier photo retention failed for row');
    }
  }
  return result;
}

export function startCashierPhotoRetentionWorker(): {
  worker: Worker;
  close: () => Promise<void>;
} {
  const { db: adminDb, client: adminClient } = createAdminDb();
  const worker = new Worker(
    CASHIER_PHOTO_QUEUE_NAME,
    async () => {
      const res = await processCashierPhotoRetention({ adminDb });
      logger.info({ ...res }, 'Cashier photo retention finished');
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
