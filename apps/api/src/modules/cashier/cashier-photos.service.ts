import {
  type CashierPhotoSkippedReason,
  cashierTransactionPhotos,
  cashierTransactions,
  tenantSettings,
} from '@dental/db-schema';
import { eq } from 'drizzle-orm';
import type { Context } from 'hono';
import { getDb } from '../../db/scoped.ts';
import type { AuditLogger } from '../../lib/audit-logger.ts';
import { pgErrorInfo } from '../../lib/pg-error.ts';
import { cashierPhotoKey, deleteObject, presignedGetUrl, uploadObject } from '../../lib/s3.ts';
import type { CashierPhotoDto } from './cashier-photos.schema.ts';

export type SavePhotoInput =
  | { kind: 'file'; body: ArrayBuffer; contentType: string; ext: string }
  | { kind: 'skipped'; reason: CashierPhotoSkippedReason };

export type SavePhotoResult =
  | { ok: true; photo: CashierPhotoDto }
  | { ok: false; reason: 'tx_not_found' | 'disabled' | 'not_payment' | 'exists' };

export const createCashierPhotosService = (deps: { audit: AuditLogger }) => {
  async function isEnabled(c: Context): Promise<boolean> {
    const [row] = await getDb(c)
      .select({ enabled: tenantSettings.cashierPhotoEnabled })
      .from(tenantSettings);
    return row?.enabled ?? false;
  }

  const toDto = async (
    row: typeof cashierTransactionPhotos.$inferSelect,
  ): Promise<CashierPhotoDto> => ({
    id: row.id,
    transactionId: row.transactionId,
    url: row.objectKey ? await presignedGetUrl(row.objectKey) : null,
    skippedReason: (row.skippedReason as CashierPhotoSkippedReason | null) ?? null,
    capturedBy: row.capturedBy,
    capturedAt: row.capturedAt.toISOString(),
  });

  async function save(c: Context, transactionId: string, input: SavePhotoInput) {
    const db = getDb(c);
    const tenantId = c.get('activeTenantId');
    const user = c.get('user');
    if (!tenantId) throw new Error('No tenant context');

    const [tx] = await db
      .select({ type: cashierTransactions.type })
      .from(cashierTransactions)
      .where(eq(cashierTransactions.id, transactionId));
    if (!tx) return { ok: false, reason: 'tx_not_found' } satisfies SavePhotoResult;
    if (!(await isEnabled(c))) return { ok: false, reason: 'disabled' } satisfies SavePhotoResult;
    if (tx.type !== 'payment')
      return { ok: false, reason: 'not_payment' } satisfies SavePhotoResult;

    const [existing] = await db
      .select({ id: cashierTransactionPhotos.id })
      .from(cashierTransactionPhotos)
      .where(eq(cashierTransactionPhotos.transactionId, transactionId));
    if (existing) return { ok: false, reason: 'exists' } satisfies SavePhotoResult;

    const photoId = crypto.randomUUID();
    let objectKey: string | null = null;
    if (input.kind === 'file') {
      objectKey = cashierPhotoKey({ tenantId, transactionId, photoId, ext: input.ext });
      await uploadObject({ key: objectKey, body: input.body, contentType: input.contentType });
    }

    let row: typeof cashierTransactionPhotos.$inferSelect | undefined;
    try {
      [row] = await db
        .insert(cashierTransactionPhotos)
        .values({
          id: photoId,
          tenantId,
          transactionId,
          objectKey,
          capturedBy: user?.id ?? null,
          skippedReason: input.kind === 'skipped' ? input.reason : null,
        })
        .returning();
    } catch (e) {
      if (objectKey) await deleteObject(objectKey).catch(() => {});
      // Poyga: parallel ikkinchi so'rov UNIQUE(transaction_id)ga urildi.
      if (pgErrorInfo(e)?.code === '23505') return { ok: false, reason: 'exists' };
      throw e;
    }
    if (!row) {
      if (objectKey) await deleteObject(objectKey).catch(() => {});
      throw new Error('Insert failed after upload');
    }

    await deps.audit.record(c, {
      action: 'created',
      resourceType: 'cashier_transaction_photo',
      resourceId: row.id,
      after: {
        transactionId,
        captured: objectKey !== null,
        skippedReason: row.skippedReason,
      },
    });
    return { ok: true, photo: await toDto(row) } satisfies SavePhotoResult;
  }

  async function getByTransaction(c: Context, transactionId: string) {
    const [row] = await getDb(c)
      .select()
      .from(cashierTransactionPhotos)
      .where(eq(cashierTransactionPhotos.transactionId, transactionId));
    if (!row) return null;
    await deps.audit.record(c, {
      action: 'viewed',
      resourceType: 'cashier_transaction_photo',
      resourceId: row.id,
      after: { transactionId },
    });
    return toDto(row);
  }

  return { isEnabled, save, getByTransaction };
};

export type CashierPhotosService = ReturnType<typeof createCashierPhotosService>;
