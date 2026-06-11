import { sql } from 'drizzle-orm';
import { boolean, index, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';
import { tenants } from './tenants.ts';

/**
 * Roles — TENANT darajasida yaratiladi/tahrirlanadi (custom roles v1 da).
 * `is_template` — system role template (Doctor, Nurse, ...) — onboarding'da seed qilinadi.
 * `is_system` — system tomonidan yaratilgan, o'chirilmaydi.
 *
 * ⚠️ Tenant Owner uchun bu jadvalda HEC qanday row YO'Q — owner implicit superuser
 * (hardcoded check `tenants.owner_user_id` orqali).
 */
export const roles = pgTable(
  'roles',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    description: text('description'),
    templateKey: text('template_key'), // system template barqaror key (custom rol → null)
    isTemplate: boolean('is_template').notNull().default(false),
    isSystem: boolean('is_system').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('roles_tenant_name_unique').on(t.tenantId, t.name),
    index('roles_tenant_idx').on(t.tenantId),
  ],
);

export type Role = typeof roles.$inferSelect;
export type RoleInsert = typeof roles.$inferInsert;
