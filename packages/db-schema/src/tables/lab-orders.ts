import { sql } from 'drizzle-orm';
import {
  type AnyPgColumn,
  check,
  date,
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
 * Remake (qayta tayyorlash) sabab kodlari — UI-D5. Laboratoriya bilan tahlil uchun.
 * DB CHECK (`lab_orders_remake_reason_chk`) shu ro'yxat bilan sinxron.
 */
export const LAB_REMAKE_REASONS = [
  'margin',
  'contact',
  'occlusion',
  'shade',
  'esthetics',
  'other',
] as const;
export type LabRemakeReason = (typeof LAB_REMAKE_REASONS)[number];

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
    // UI-D5: kerakli sana (kalendar kun) va rang — eski qatorlarda NULL, YANGI buyurtmada
    // majburiyligi create schema'da (DB'da nullable: tarixiy ma'lumot buzilmasin).
    dueDate: date('due_date', { mode: 'string' }),
    shade: text('shade'),
    // Remake: asl buyurtma + sabab (juftlik create schema'da majburlanadi; original o'chsa
    // remake_of_id SET NULL bo'ladi, shu sabab DB'da juftlik CHECK yo'q).
    remakeOfId: uuid('remake_of_id').references((): AnyPgColumn => labOrders.id, {
      onDelete: 'set null',
    }),
    remakeReason: text('remake_reason'),
    cost: numeric('cost', { precision: 14, scale: 2 }),
    currency: text('currency').notNull().default('UZS'),

    notes: text('notes'),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('lab_orders_patient_idx').on(t.patientId),
    index('lab_orders_tenant_status_idx').on(t.tenantId, t.status),
    index('lab_orders_remake_of_idx').on(t.remakeOfId),
    check(
      'lab_orders_remake_reason_chk',
      sql`${t.remakeReason} IS NULL OR ${t.remakeReason} IN ('margin', 'contact', 'occlusion', 'shade', 'esthetics', 'other')`,
    ),
  ],
);

export type LabOrder = typeof labOrders.$inferSelect;
export type LabOrderInsert = typeof labOrders.$inferInsert;

/**
 * Lab order fayllari — skan, rang shkalasi bilan surat, PDF (UI-D5).
 * Storage key: `tenants/{tenant_id}/lab-orders/{lab_order_id}/{file_id}.{ext}`
 * (`/uploads` shu prefiks bo'yicha `lab_order.view` talab qiladi).
 */
export const labOrderFiles = pgTable(
  'lab_order_files',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    labOrderId: uuid('lab_order_id')
      .notNull()
      .references(() => labOrders.id, { onDelete: 'cascade' }),
    uploadedByUserId: uuid('uploaded_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    label: text('label'),
    objectKey: text('object_key').notNull(),
    originalFilename: text('original_filename').notNull(),
    contentType: text('content_type').notNull(),
    sizeBytes: integer('size_bytes').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('lab_order_files_order_idx').on(t.labOrderId),
    index('lab_order_files_tenant_idx').on(t.tenantId),
  ],
);

export type LabOrderFile = typeof labOrderFiles.$inferSelect;
export type LabOrderFileInsert = typeof labOrderFiles.$inferInsert;
