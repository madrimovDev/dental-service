import { sql } from 'drizzle-orm';
import { date, index, numeric, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { branches } from './branches.ts';
import { services } from './services.ts';

/**
 * Per-branch service pricing.
 * Bir xizmat har filialda farqli narxda bo'lishi mumkin.
 * Currency UZS (so'm) default, kelajakda multi-currency.
 */
export const servicePrices = pgTable(
  'service_prices',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    serviceId: uuid('service_id')
      .notNull()
      .references(() => services.id, { onDelete: 'cascade' }),
    branchId: uuid('branch_id')
      .notNull()
      .references(() => branches.id, { onDelete: 'cascade' }),
    price: numeric('price', { precision: 14, scale: 2 }).notNull(),
    currency: text('currency').notNull().default('UZS'),
    validFrom: date('valid_from').notNull().defaultNow(),
    validTo: date('valid_to'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('service_prices_service_branch_idx').on(t.serviceId, t.branchId),
    index('service_prices_branch_idx').on(t.branchId),
  ],
);

export type ServicePrice = typeof servicePrices.$inferSelect;
export type ServicePriceInsert = typeof servicePrices.$inferInsert;
