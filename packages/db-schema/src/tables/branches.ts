import { sql } from 'drizzle-orm';
import { index, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { tenants } from './tenants.ts';

/**
 * Branch = klinika filiali. Tenant-scoped (RLS YOQILGAN).
 * `work_hours` JSONB shape: {mon: {open: "09:00", close: "20:00"}, ...}
 */
export const branches = pgTable(
  'branches',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    address: text('address'),
    phone: text('phone'),
    workHours: jsonb('work_hours').$type<Record<string, { open: string; close: string } | null>>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [index('branches_tenant_idx').on(t.tenantId)],
);

export type Branch = typeof branches.$inferSelect;
export type BranchInsert = typeof branches.$inferInsert;
