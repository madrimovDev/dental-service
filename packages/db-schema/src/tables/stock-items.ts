import { sql } from 'drizzle-orm';
import { index, numeric, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { branches } from './branches.ts';
import { tenants } from './tenants.ts';

export const stockItems = pgTable(
  'stock_items',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    branchId: uuid('branch_id').references(() => branches.id, { onDelete: 'set null' }),
    name: text('name').notNull(),
    unit: text('unit').notNull(),
    quantity: numeric('quantity', { precision: 14, scale: 2 }).notNull().default('0'),
    minThreshold: numeric('min_threshold', { precision: 14, scale: 2 }).notNull().default('0'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('stock_items_tenant_idx').on(t.tenantId)],
);

export type StockItem = typeof stockItems.$inferSelect;
