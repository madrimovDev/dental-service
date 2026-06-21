import { sql } from 'drizzle-orm';
import {
  date,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { branches } from './branches.ts';
import { patients } from './patients.ts';
import { tenants } from './tenants.ts';
import { treatmentPlans } from './treatment-plans.ts';
import { users } from './users.ts';

/**
 * Recall sababi (RFC-0011):
 *  - preventive — davriy profilaktik tekshiruv (odatda har 6 oy)
 *  - treatment_followup — davolash bosqichi tugagach davomi
 *  - post_op_check — operatsiyadan keyingi nazorat
 *  - manual — qo'lda yaratilgan
 */
export const recallReasonEnum = pgEnum('recall_reason', [
  'preventive',
  'treatment_followup',
  'post_op_check',
  'manual',
]);

/** Recall hayot-sikli holati (RFC-0011 §4). */
export const recallStatusEnum = pgEnum('recall_status', [
  'pending',
  'contacted',
  'scheduled',
  'completed',
  'dismissed',
]);

/** Recall manbai — qaysi trigger yaratdi. */
export const recallSourceEnum = pgEnum('recall_source', [
  'treatment_stage',
  'appointment',
  'manual',
  'scheduler',
]);

/**
 * Recalls — bemorni davriy qayta chaqirish (revisit) yozuvlari (RFC-0011).
 *
 * Manba haqiqati shu jadval; scheduler faqat trigger (Qaror #23). Idempotentlik
 * partial unique index orqali: bir bemor + manba bosqich uchun bitta ochiq recall.
 */
export const recalls = pgTable(
  'recalls',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    branchId: uuid('branch_id').references(() => branches.id, { onDelete: 'set null' }),
    patientId: uuid('patient_id')
      .notNull()
      .references(() => patients.id, { onDelete: 'cascade' }),

    reason: recallReasonEnum('reason').notNull(),
    status: recallStatusEnum('status').notNull().default('pending'),
    source: recallSourceEnum('source').notNull(),

    /** Klinika-local kalendar kuni — instant emas (chegara aniqligi). */
    dueDate: date('due_date').notNull(),
    intervalMonths: integer('interval_months'),

    /** Davolash bosqichiga soft ref (FK YO'Q — RFC-0011 §3, idempotentlik kaliti). */
    sourceStageId: uuid('source_stage_id'),
    treatmentPlanId: uuid('treatment_plan_id').references(() => treatmentPlans.id, {
      onDelete: 'set null',
    }),
    /** Bemor qayta yozilganda bog'lanadigan yozilish (rebook linkage, B5). */
    scheduledAppointmentId: uuid('scheduled_appointment_id'),

    assignedDoctorId: uuid('assigned_doctor_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    lastContactedAt: timestamp('last_contacted_at', { withTimezone: true }),
    contactAttempts: integer('contact_attempts').notNull().default(0),
    notes: text('notes'),

    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    closedBy: uuid('closed_by').references(() => users.id, { onDelete: 'set null' }),
    closedAt: timestamp('closed_at', { withTimezone: true }),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Dashboard "bugun chaqirish kerak" — tenant + sana + holat bo'yicha.
    index('recalls_tenant_due_status_idx').on(t.tenantId, t.dueDate, t.status),
    // Cross-tenant scan (worker, admin conn) — sana + holat bo'yicha.
    index('recalls_due_status_idx').on(t.dueDate, t.status),
    index('recalls_patient_idx').on(t.patientId),
    // Idempotentlik: bir bemor + manba bosqich uchun bitta OCHIQ recall (B4).
    uniqueIndex('recalls_patient_stage_open_unique')
      .on(t.patientId, t.sourceStageId)
      .where(sql`status in ('pending', 'contacted')`),
  ],
);

export type Recall = typeof recalls.$inferSelect;
export type RecallInsert = typeof recalls.$inferInsert;
