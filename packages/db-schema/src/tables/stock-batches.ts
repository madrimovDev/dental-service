import { sql } from 'drizzle-orm';
import { index, numeric, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { stockItems } from './stock-items.ts';
import { tenants } from './tenants.ts';

/**
 * Stock batch — ombor partiyasini qabul qilish yozuvi (V2-2): supplier/batch#/expiry/cost.
 * ⚠️ LIGHTWEIGHT model (Qaror #31): `stock_items.quantity` yagona on-hand manbai bo'lib
 * qoladi; batch = QABUL yozuvi (FIFO batch-level deduction YO'Q). Demak expiry — qabul
 * yozuvi ogohlantirishi (muddati o'tgan partiya qabul qilingani), aniq "javonda 5 dona
 * muddati o'tgan" emas. Stomatologiya uchun yetarli. Qabul qilinganda `qtyReceived`
 * miqdor uchun 'in' stock movement yaratiladi (quantity bittada manba bo'lib qoladi).
 */
export const stockBatches = pgTable(
  'stock_batches',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    itemId: uuid('item_id')
      .notNull()
      .references(() => stockItems.id, { onDelete: 'cascade' }),
    supplierName: text('supplier_name'),
    batchNumber: text('batch_number'),
    expiryDate: timestamp('expiry_date', { withTimezone: true }),
    costPerUnit: numeric('cost_per_unit', { precision: 14, scale: 2 }),
    qtyReceived: numeric('qty_received', { precision: 14, scale: 2 }).notNull(),
    receivedAt: timestamp('received_at', { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('stock_batches_item_idx').on(t.itemId),
    index('stock_batches_tenant_expiry_idx').on(t.tenantId, t.expiryDate),
  ],
);

export type StockBatch = typeof stockBatches.$inferSelect;
