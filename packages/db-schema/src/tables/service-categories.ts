import { sql } from 'drizzle-orm';
import { index, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';
import { tenants } from './tenants.ts';

/**
 * Service categories — xizmat kategoriyalari katalogi.
 * Tenant-scoped (RLS yoqilgan). services.category_id shu jadvalga ishora qiladi.
 */
export const serviceCategories = pgTable(
  'service_categories',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    nameRu: text('name_ru'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('service_categories_tenant_name_unique').on(t.tenantId, t.name),
    index('service_categories_tenant_idx').on(t.tenantId),
  ],
);

export type ServiceCategory = typeof serviceCategories.$inferSelect;
export type ServiceCategoryInsert = typeof serviceCategories.$inferInsert;
