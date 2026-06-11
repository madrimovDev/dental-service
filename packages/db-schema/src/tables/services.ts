import { sql } from 'drizzle-orm';
import {
  boolean,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { tenants } from './tenants.ts';

/**
 * Service catalog — klinika xizmatlari ro'yxati.
 * Tenant-scoped (RLS yoqilgan).
 *
 * Per-branch pricing alohida service_prices jadvalida.
 */
export const services = pgTable(
  'services',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),

    code: text('code').notNull(), // "PL-001", "FK-002"
    nameUz: text('name_uz').notNull(),
    nameRu: text('name_ru'),
    category: text('category'), // "Terapevtika", "Ortopediya", ...
    durationMinutes: integer('duration_minutes').notNull().default(30),
    requiredRole: text('required_role'), // 'doctor' | 'assistant' | 'technician'
    descriptionUz: text('description_uz'),
    descriptionRu: text('description_ru'),
    isActive: boolean('is_active').notNull().default(true),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [
    unique('services_tenant_code_unique').on(t.tenantId, t.code),
    index('services_tenant_idx').on(t.tenantId),
    index('services_tenant_category_idx').on(t.tenantId, t.category),
    index('services_tenant_deleted_idx').on(t.tenantId, t.deletedAt),
  ],
);

export type Service = typeof services.$inferSelect;
export type ServiceInsert = typeof services.$inferInsert;
