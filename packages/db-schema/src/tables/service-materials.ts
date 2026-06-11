import { sql } from 'drizzle-orm';
import { index, numeric, pgTable, timestamp, unique, uuid } from 'drizzle-orm/pg-core';
import { services } from './services.ts';
import { stockItems } from './stock-items.ts';
import { tenants } from './tenants.ts';

export const serviceMaterials = pgTable(
  'service_materials',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    serviceId: uuid('service_id')
      .notNull()
      .references(() => services.id, { onDelete: 'cascade' }),
    itemId: uuid('item_id')
      .notNull()
      .references(() => stockItems.id, { onDelete: 'cascade' }),
    qtyPerService: numeric('qty_per_service', { precision: 14, scale: 2 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique('service_materials_unique').on(t.serviceId, t.itemId)],
);

export type ServiceMaterial = typeof serviceMaterials.$inferSelect;
