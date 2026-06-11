import { sql } from 'drizzle-orm';
import { index, numeric, pgTable, timestamp, uuid } from 'drizzle-orm/pg-core';
import { payrollRuns } from './payroll-runs.ts';
import { tenants } from './tenants.ts';
import { users } from './users.ts';

export const payrollLines = pgTable(
  'payroll_lines',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    runId: uuid('run_id')
      .notNull()
      .references(() => payrollRuns.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    baseSalary: numeric('base_salary', { precision: 14, scale: 2 }).notNull(),
    attributedRevenue: numeric('attributed_revenue', { precision: 14, scale: 2 }).notNull(),
    commissionPercent: numeric('commission_percent', { precision: 5, scale: 2 }).notNull(),
    commissionAmount: numeric('commission_amount', { precision: 14, scale: 2 }).notNull(),
    total: numeric('total', { precision: 14, scale: 2 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('payroll_lines_tenant_run_idx').on(t.tenantId, t.runId)],
);

export type PayrollLine = typeof payrollLines.$inferSelect;
