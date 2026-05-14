import { sql } from 'drizzle-orm';
import { index, pgTable, text, uuid } from 'drizzle-orm/pg-core';

/**
 * Permissions katalog — PLATFORM darajasida belgilanadi.
 * ⚠️ Tenant'lar yangi permission qo'sha olmaydi — faqat mavjudlardan rollar yig'adi.
 * Source of truth: `packages/core/src/permissions.ts` (`PERMISSIONS` as const).
 * Seed har boot'da idempotent (ON CONFLICT DO UPDATE).
 */
export const permissions = pgTable(
  'permissions',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    code: text('code').notNull().unique(), // 'patient.view', 'cashier.refund'
    category: text('category').notNull(), // 'patient', 'cashier', ...
    descriptionUz: text('description_uz'),
    descriptionRu: text('description_ru'),
  },
  (t) => [index('permissions_category_idx').on(t.category)],
);

export type Permission = typeof permissions.$inferSelect;
export type PermissionInsert = typeof permissions.$inferInsert;
