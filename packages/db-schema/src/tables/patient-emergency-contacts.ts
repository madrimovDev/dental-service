import { sql } from 'drizzle-orm';
import { boolean, index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { patients } from './patients.ts';
import { tenants } from './tenants.ts';

/**
 * Erkin emergency contact — `patient_relatives` (bemor↔bemor link) dan farqli ravishda
 * tizimda bemor BO'LMAGAN shaxs uchun erkin ism+telefon. Favqulodda holatda kim bilan
 * bog'lanish. Directional (patient → contact), bidirectional EMAS.
 */
export const patientEmergencyContacts = pgTable(
  'patient_emergency_contacts',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    patientId: uuid('patient_id')
      .notNull()
      .references(() => patients.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    phone: text('phone').notNull(),
    relationship: text('relationship'),
    isPrimary: boolean('is_primary').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('patient_emergency_contacts_patient_idx').on(t.patientId)],
);

export type PatientEmergencyContact = typeof patientEmergencyContacts.$inferSelect;
