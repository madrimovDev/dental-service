import { sql } from 'drizzle-orm';
import { check, index, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { cashierTransactions } from './cashier.ts';
import { tenants } from './tenants.ts';
import { users } from './users.ts';

/**
 * FT-06.3 (D-4): to'lovdan keyin kassada olingan rasm (to'lovchi/chek tasdig'i).
 * Tenant sozlamasi `cashier_photo_enabled` (standart o'chiq) yoqilgandagina yoziladi.
 *
 *  - `object_key` — `tenants/{tid}/cashier-photos/{txId}/{id}.{ext}`; kamera ruxsat bermasa /
 *    ishlamasa `NULL` va `skipped_reason` to'ldiriladi (CHECK: ikkalasidan biri shart).
 *  - Bitta to'lovga bitta yozuv (UNIQUE transaction_id).
 *  - 90 kundan keyin kunlik worker faylni va qatorni o'chiradi (retention).
 *  - Ko'rish: `cashier.photo.view` (owner, Tenant Admin).
 */
export const CASHIER_PHOTO_SKIPPED_REASONS = [
  'permission_denied',
  'no_camera',
  'user_skipped',
  'error',
] as const;
export type CashierPhotoSkippedReason = (typeof CASHIER_PHOTO_SKIPPED_REASONS)[number];

export const cashierTransactionPhotos = pgTable(
  'cashier_transaction_photos',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    transactionId: uuid('transaction_id')
      .notNull()
      .references(() => cashierTransactions.id, { onDelete: 'cascade' }),
    objectKey: text('object_key'),
    capturedBy: uuid('captured_by').references(() => users.id, { onDelete: 'set null' }),
    capturedAt: timestamp('captured_at', { withTimezone: true }).notNull().defaultNow(),
    skippedReason: text('skipped_reason'),
  },
  (t) => [
    uniqueIndex('cashier_tx_photos_tx_uq').on(t.transactionId),
    index('cashier_tx_photos_tenant_captured_idx').on(t.tenantId, t.capturedAt),
    check(
      'cashier_tx_photos_key_or_reason_chk',
      sql`${t.objectKey} IS NOT NULL OR ${t.skippedReason} IS NOT NULL`,
    ),
  ],
);

export type CashierTransactionPhoto = typeof cashierTransactionPhotos.$inferSelect;
export type CashierTransactionPhotoInsert = typeof cashierTransactionPhotos.$inferInsert;
