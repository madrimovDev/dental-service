import { sql } from 'drizzle-orm';
import {
  index,
  integer,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { consentForms } from './consent.ts';
import { patients } from './patients.ts';
import { services } from './services.ts';
import { tenants } from './tenants.ts';
import { users } from './users.ts';

export const treatmentPlanStatusEnum = pgEnum('treatment_plan_status', [
  'draft',
  'presented',
  'accepted',
  'in_progress',
  'completed',
  'cancelled',
]);

/**
 * Treatment plan — bemor uchun multi-stage davolash rejasi.
 * Bemor avval planni ko'radi, qabul qiladi, keyin bosqichlar bajariladi.
 */
export const treatmentPlans = pgTable(
  'treatment_plans',
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

    title: text('title').notNull(),
    totalCost: numeric('total_cost', { precision: 14, scale: 2 }).notNull().default('0'),
    totalVisits: integer('total_visits').notNull().default(0),
    currency: text('currency').notNull().default('UZS'),

    status: treatmentPlanStatusEnum('status').notNull().default('draft'),
    // CLI-461: eski ustunlar (backward-compat, migration risk kamaytirish uchun
    // saqlanadi) — endi accept gate mantig'ida MUSTAQIL ishlatilmaydi. `consentSignedAt`
    // faqat `consentFormId` orqali bog'langan haqiqiy consent_forms yozuvining
    // `signedAt`'idan denormalized cache sifatida yoziladi (informatsion, gate emas).
    consentSignedAt: timestamp('consent_signed_at', { withTimezone: true }),
    consentSignatureUrl: text('consent_signature_url'),
    // CLI-461: "to'liq bog'lash" — reja qabul qilinishini asoslovchi HAQIQIY consent_forms
    // yozuvi. Gate (`presented→accepted`) doim shu yozuvni JONLI qayta tekshiradi
    // (isPerpetual=true YOKI expiresAt > now()) — cache'langan timestamp emas.
    consentFormId: uuid('consent_form_id').references(() => consentForms.id, {
      onDelete: 'set null',
    }),

    notes: text('notes'),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('treatment_plans_patient_idx').on(t.patientId),
    index('treatment_plans_status_idx').on(t.tenantId, t.status),
  ],
);

export type TreatmentPlan = typeof treatmentPlans.$inferSelect;
export type TreatmentPlanInsert = typeof treatmentPlans.$inferInsert;

/**
 * Treatment stages — har vizitda bajariladigan ishlar.
 */
export const treatmentStageStatusEnum = pgEnum('treatment_stage_status', [
  'pending',
  'in_progress',
  'completed',
  'skipped',
]);

/**
 * Acceptance axis (Qaror #25) — SEPARATE from execution `status`.
 * `status` = nima bajarildi (pending/in_progress/completed/skipped);
 * `acceptance` = bemor bosqichni qabul qildimi (proposed/accepted/rejected).
 * Qarz (debt) faqat `acceptance='accepted'` bosqichlardan hisoblanadi (Qaror #24).
 */
export const treatmentStageAcceptanceEnum = pgEnum('treatment_stage_acceptance', [
  'proposed',
  'accepted',
  'rejected',
]);

export const treatmentStages = pgTable(
  'treatment_stages',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    treatmentPlanId: uuid('treatment_plan_id')
      .notNull()
      .references(() => treatmentPlans.id, { onDelete: 'cascade' }),
    sequence: integer('sequence').notNull(),
    serviceId: uuid('service_id').references(() => services.id, { onDelete: 'set null' }),
    serviceName: text('service_name').notNull(),
    toothNumbers: integer('tooth_numbers').array(), // FDI: 11-48, 51-85
    estimatedVisits: integer('estimated_visits').notNull().default(1),
    estimatedDurationMinutes: integer('estimated_duration_minutes'),
    cost: numeric('cost', { precision: 14, scale: 2 }).notNull(),
    status: treatmentStageStatusEnum('status').notNull().default('pending'),
    acceptance: treatmentStageAcceptanceEnum('acceptance').notNull().default('proposed'),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    notes: text('notes'),
  },
  (t) => [index('treatment_stages_plan_idx').on(t.treatmentPlanId, t.sequence)],
);

export type TreatmentStage = typeof treatmentStages.$inferSelect;
export type TreatmentStageInsert = typeof treatmentStages.$inferInsert;
