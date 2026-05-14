import { sql } from 'drizzle-orm';
import { index, jsonb, pgEnum, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';
import { patients } from './patients.ts';
import { tenants } from './tenants.ts';
import { users } from './users.ts';

export const pregnancyStatusEnum = pgEnum('pregnancy_status', [
  'not_applicable',
  'pregnant',
  'planning',
  'lactating',
]);

export type AllergyEntry = {
  type: 'anesthetic' | 'medication' | 'material' | 'food' | 'other';
  substance: string;
  severity: 'mild' | 'moderate' | 'severe';
  notes?: string;
};

export type TestResults = {
  hiv?: { date: string; result: 'positive' | 'negative' | 'unknown' };
  hepatitis_b?: { date: string; result: 'positive' | 'negative' | 'unknown' };
  hepatitis_c?: { date: string; result: 'positive' | 'negative' | 'unknown' };
  covid?: { date: string; result: 'positive' | 'negative' | 'unknown' };
};

/**
 * Medical Record — bemor tibbiy kartasi.
 *
 * 1-to-1 with patient (UNIQUE constraint).
 * ⚠️ allergyies — anestetikga allergiya HAYOTIY MUHIM (dental injeksiya oldidan tekshiriladi).
 * Frontend bemor profilida QIZIL OGOHLANTIRISH ko'rsatishi shart.
 */
export const medicalRecords = pgTable(
  'medical_records',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    patientId: uuid('patient_id')
      .notNull()
      .references(() => patients.id, { onDelete: 'cascade' }),

    // Anamnez
    anamnez: text('anamnez'),

    // Surunkali kasalliklar (masalan, ['diabetes', 'hypertension'])
    chronicConditions: text('chronic_conditions').array(),

    // Hozirgi dorilar
    currentMedications: text('current_medications').array(),

    // Allergiya — typed JSONB
    allergies: jsonb('allergies').$type<AllergyEntry[]>(),

    bloodType: text('blood_type'), // 'O+', 'A-', 'AB+', va h.k.
    pregnancyStatus: pregnancyStatusEnum('pregnancy_status').default('not_applicable'),

    // Test natijalari (HIV, gepatit, COVID)
    testResults: jsonb('test_results').$type<TestResults>(),

    lastUpdatedBy: uuid('last_updated_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('medical_records_patient_unique').on(t.patientId),
    index('medical_records_tenant_idx').on(t.tenantId),
  ],
);

export type MedicalRecord = typeof medicalRecords.$inferSelect;
export type MedicalRecordInsert = typeof medicalRecords.$inferInsert;
