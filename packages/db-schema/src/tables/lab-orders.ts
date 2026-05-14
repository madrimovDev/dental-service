import { sql } from 'drizzle-orm';
import {
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { patients } from './patients.ts';
import { tenants } from './tenants.ts';
import { users } from './users.ts';

/**
 * Lab order item — `items[]` JSON array elementi.
 */
export type LabOrderItem = {
  description: string; // e.g. "Crown for tooth 26"
  toothNumbers?: number[];
  material?: string; // e.g. "Zirconia"
  shade?: string; // e.g. "A2"
  quantity?: number;
};

export const labOrderStatusEnum = pgEnum('lab_order_status', [
  'draft',
  'sent',
  'in_progress',
  'ready',
  'delivered',
  'cancelled',
]);

export const labOrderTypeEnum = pgEnum('lab_order_type', [
  'crown',
  'bridge',
  'prosthetic',
  'aligners',
  'denture',
  'inlay_onlay',
  'other',
]);

/**
 * Lab order — laboratoriyaga buyurtma (toj, ko'prik, protez...).
 */
export const labOrders = pgTable(
  'lab_orders',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    patientId: uuid('patient_id')
      .notNull()
      .references(() => patients.id, { onDelete: 'cascade' }),
    doctorId: uuid('doctor_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),

    orderNumber: integer('order_number'), // tenant ichida sequential, ixtiyoriy
    labName: text('lab_name').notNull(),
    orderType: labOrderTypeEnum('order_type').notNull(),
    status: labOrderStatusEnum('status').notNull().default('draft'),

    items: jsonb('items').$type<LabOrderItem[]>().notNull(),

    sentDate: timestamp('sent_date', { withTimezone: true }),
    expectedDate: timestamp('expected_date', { withTimezone: true }),
    deliveredDate: timestamp('delivered_date', { withTimezone: true }),
    cost: numeric('cost', { precision: 14, scale: 2 }),
    currency: text('currency').notNull().default('UZS'),

    notes: text('notes'),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('lab_orders_patient_idx').on(t.patientId),
    index('lab_orders_tenant_status_idx').on(t.tenantId, t.status),
  ],
);

export type LabOrder = typeof labOrders.$inferSelect;
export type LabOrderInsert = typeof labOrders.$inferInsert;
