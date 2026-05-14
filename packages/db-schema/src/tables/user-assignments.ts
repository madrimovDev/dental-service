import { sql } from 'drizzle-orm';
import { boolean, index, pgTable, timestamp, uuid } from 'drizzle-orm/pg-core';
import { branches } from './branches.ts';
import { roles } from './roles.ts';
import { tenants } from './tenants.ts';
import { users } from './users.ts';

/**
 * Cross-tenant user assignment: kim qaysi tenant'da qaysi rol bilan ishlaydi.
 *
 * - `user_id` platform-level
 * - `tenant_id` — tenant binding (RBAC)
 * - `branch_id` NULL → tenant-wide rol (masalan, Tenant Admin barcha filiallarda)
 * - `branch_id` mavjud → faqat shu filialda
 *
 * Bir foydalanuvchi ko'p tenant + ko'p branch'da assignment'larga ega bo'lishi mumkin.
 * Slack/Notion modeli: login bitta, workspace switch orqali active context tanlanadi.
 */
export const userAssignments = pgTable(
  'user_assignments',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    branchId: uuid('branch_id').references(() => branches.id, { onDelete: 'cascade' }), // NULL = tenant-wide
    roleId: uuid('role_id')
      .notNull()
      .references(() => roles.id, { onDelete: 'restrict' }),
    validFrom: timestamp('valid_from', { withTimezone: true }).notNull().defaultNow(),
    validTo: timestamp('valid_to', { withTimezone: true }),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('user_assignments_user_tenant_idx').on(t.userId, t.tenantId),
    index('user_assignments_tenant_idx').on(t.tenantId),
    index('user_assignments_active_idx').on(t.isActive),
  ],
);

export type UserAssignment = typeof userAssignments.$inferSelect;
export type UserAssignmentInsert = typeof userAssignments.$inferInsert;
