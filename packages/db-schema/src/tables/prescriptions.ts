import { sql } from 'drizzle-orm';
import { index, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { patients } from './patients.ts';
import { tenants } from './tenants.ts';
import { users } from './users.ts';
import { visitNotes } from './visit-notes.ts';

/**
 * Prescription item — `items[]` JSON array elementi.
 * Free-text (kelajakda dori katalogi qo'shilishi mumkin).
 */
export type PrescriptionItem = {
  medicationName: string;
  dosage: string;
  frequency: string; // "1 tabletka, kuniga 3 marta"
  durationDays?: number;
  instructions?: string;
};

/**
 * Prescription — shifokorning resepti (bemor uchun dorilar buyrug'i).
 * Bitta vizit yozuvi bilan bog'lash mumkin (ixtiyoriy).
 */
export const prescriptions = pgTable(
  'prescriptions',
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
    visitNoteId: uuid('visit_note_id').references(() => visitNotes.id, { onDelete: 'set null' }),

    issuedDate: timestamp('issued_date', { withTimezone: true }).notNull().defaultNow(),
    items: jsonb('items').$type<PrescriptionItem[]>().notNull(),
    diagnosis: text('diagnosis'),
    notes: text('notes'),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('prescriptions_patient_idx').on(t.patientId),
    index('prescriptions_tenant_issued_idx').on(t.tenantId, t.issuedDate),
  ],
);

export type Prescription = typeof prescriptions.$inferSelect;
export type PrescriptionInsert = typeof prescriptions.$inferInsert;
