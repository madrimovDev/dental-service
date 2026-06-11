import { sql } from 'drizzle-orm';
import { date, numeric, pgEnum, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';
import { tenants } from './tenants.ts';
import { users } from './users.ts';

export const employmentStatusEnum = pgEnum('employment_status', ['active', 'on_leave', 'inactive']);

export const staffProfiles = pgTable(
  'staff_profiles',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    specialty: text('specialty'),
    employmentStatus: employmentStatusEnum('employment_status').notNull().default('active'),
    startedAt: date('started_at'),
    baseSalary: numeric('base_salary', { precision: 14, scale: 2 }).notNull().default('0'),
    commissionPercent: numeric('commission_percent', { precision: 5, scale: 2 })
      .notNull()
      .default('0'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique('staff_profiles_tenant_user_unique').on(t.tenantId, t.userId)],
);

export type StaffProfile = typeof staffProfiles.$inferSelect;
