import { sql } from 'drizzle-orm';
import { date, index, pgEnum, pgTable, timestamp, uuid } from 'drizzle-orm/pg-core';
import { tenants } from './tenants.ts';
import { users } from './users.ts';

export const payrollRunStatusEnum = pgEnum('payroll_run_status', ['draft', 'finalized']);

export const payrollRuns = pgTable(
  'payroll_runs',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    periodFrom: date('period_from').notNull(),
    periodTo: date('period_to').notNull(),
    status: payrollRunStatusEnum('status').notNull().default('draft'),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('payroll_runs_tenant_idx').on(t.tenantId, t.createdAt)],
);

export type PayrollRun = typeof payrollRuns.$inferSelect;
