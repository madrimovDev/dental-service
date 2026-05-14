import { sql } from 'drizzle-orm';
import { boolean, index, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { appointments } from './appointments.ts';
import { patients } from './patients.ts';
import { tenants } from './tenants.ts';
import { users } from './users.ts';

/**
 * Visit Note — har vizit uchun klinik yozuv (SOAP format).
 *
 * SOAP:
 *  - Subjective: bemorning shikoyati
 *  - Objective: ko'rinishi (rang, harakatchanligi, ...)
 *  - Assessment: diagnoz (ICD-10 codes)
 *  - Plan: bajarilgan + bajariladigan ishlar
 */
export const visitNotes = pgTable(
  'visit_notes',
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
    appointmentId: uuid('appointment_id').references(() => appointments.id, {
      onDelete: 'set null',
    }),

    visitDate: timestamp('visit_date', { withTimezone: true }).notNull().defaultNow(),

    // SOAP
    subjective: text('subjective'), // bemor shikoyati
    objective: text('objective'), // ko'rinishi
    assessmentDiagnoses: uuid('assessment_diagnoses').array(), // diagnoses.id ro'yxati
    plan: text('plan'), // qilingan + qilinadigan

    // Bajarilgan xizmatlar (cashier transaction bilan bog'lanadi keyinroq)
    performedServices: uuid('performed_services').array(),

    freeNotes: text('free_notes'),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('visit_notes_patient_idx').on(t.patientId, t.visitDate),
    index('visit_notes_tenant_idx').on(t.tenantId, t.visitDate),
  ],
);

export type VisitNote = typeof visitNotes.$inferSelect;
export type VisitNoteInsert = typeof visitNotes.$inferInsert;

/**
 * Templates for visit notes (tenant-scoped, doctor uchun tez kiritish)
 */
export const visitNoteTemplates = pgTable(
  'visit_note_templates',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    category: text('category'),
    template: jsonb('template').notNull().$type<{
      subjective?: string;
      objective?: string;
      plan?: string;
    }>(),
    isShared: boolean('is_shared').notNull().default(false),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('visit_note_templates_tenant_idx').on(t.tenantId)],
);

export type VisitNoteTemplate = typeof visitNoteTemplates.$inferSelect;
export type VisitNoteTemplateInsert = typeof visitNoteTemplates.$inferInsert;
