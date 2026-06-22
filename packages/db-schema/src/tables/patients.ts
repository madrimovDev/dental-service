import { sql } from 'drizzle-orm';
import { date, index, jsonb, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { tenants } from './tenants.ts';

export const genderEnum = pgEnum('patient_gender', ['male', 'female', 'other']);

/**
 * Patient — bemor. Tenant-scoped (RLS YOQILGAN).
 *
 * ⚠️ Bemor TENANT-SCOPED. Bir jismoniy odam Klinika A va Klinika B da bo'lsa,
 * ikkita alohida patient row. Hech qachon tenantlar orasida birlashtirilmaydi.
 *
 * PII fieldlar (passport, phone, address) — `patient.view_pii` permission talab qiladi.
 * Audit log har sensitive read'da yoziladi.
 */
export const patients = pgTable(
  'patients',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),

    // Identifikatsiya
    fullName: text('full_name').notNull(),
    dateOfBirth: date('date_of_birth'),
    gender: genderEnum('gender'),

    // PII — alohida permission gate (`patient.view_pii`)
    phone: text('phone'),
    phoneSecondary: text('phone_secondary'),
    passport: text('passport'), // M3+ da shifrlanishi mumkin
    address: text('address'),

    photoUrl: text('photo_url'),
    notes: text('notes'),

    // R2: teg / manba / sug'urta (CLI-38)
    tags: text('tags').array().notNull().default(sql`'{}'`),
    source: text('source'),
    insurance: jsonb('insurance').$type<{
      provider: string;
      policyNumber: string;
      // V3-5 — ixtiyoriy (eski rows'da yo'q, backward-compatible JSONB kengaytma).
      coverageType?: 'dental' | 'general' | 'other';
      expiryDate?: string;
      isActive?: boolean;
    } | null>(),

    archivedAt: timestamp('archived_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('patients_tenant_idx').on(t.tenantId),
    index('patients_tenant_phone_idx').on(t.tenantId, t.phone),
    index('patients_tenant_name_idx').on(t.tenantId, t.fullName),
  ],
);

export type Patient = typeof patients.$inferSelect;
export type PatientInsert = typeof patients.$inferInsert;
