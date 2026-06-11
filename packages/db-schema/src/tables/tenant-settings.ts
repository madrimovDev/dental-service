import { sql } from 'drizzle-orm';
import { integer, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';
import { tenants } from './tenants.ts';

/**
 * Tenant settings — har tenant uchun bitta sozlamalar row (get-or-create).
 *
 * - `vertical` — klinika vertikali (default 'dental'; kelajakda kosmetologiya va boshqalar).
 * - `reminderLeadHours` — eslatma vaqti (vizitdan necha soat oldin SMS).
 * - `currency` — valyuta (default 'UZS').
 *
 * R5 prerequisite + orphaned `tenant_settings.*` permission egasi.
 */
export const tenantSettings = pgTable(
  'tenant_settings',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    vertical: text('vertical').notNull().default('dental'),
    reminderLeadHours: integer('reminder_lead_hours').notNull().default(24),
    currency: text('currency').notNull().default('UZS'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique('tenant_settings_tenant_unique').on(t.tenantId)],
);

export type TenantSettings = typeof tenantSettings.$inferSelect;
export type TenantSettingsInsert = typeof tenantSettings.$inferInsert;
