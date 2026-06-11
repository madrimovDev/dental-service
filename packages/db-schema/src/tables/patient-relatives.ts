import { sql } from 'drizzle-orm';
import { index, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';
import { patients } from './patients.ts';
import { tenants } from './tenants.ts';

export const patientRelatives = pgTable(
  'patient_relatives',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    patientId: uuid('patient_id')
      .notNull()
      .references(() => patients.id, { onDelete: 'cascade' }),
    relativePatientId: uuid('relative_patient_id')
      .notNull()
      .references(() => patients.id, { onDelete: 'cascade' }),
    relationship: text('relationship').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('patient_relatives_patient_idx').on(t.patientId),
    unique('patient_relatives_unique').on(t.patientId, t.relativePatientId),
  ],
);

export type PatientRelative = typeof patientRelatives.$inferSelect;
