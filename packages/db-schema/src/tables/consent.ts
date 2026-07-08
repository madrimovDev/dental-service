import { sql } from 'drizzle-orm';
import { boolean, index, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { patients } from './patients.ts';
import { tenants } from './tenants.ts';
import { users } from './users.ts';

/**
 * Consent type — Konsent (rozilik) turi.
 *  - treatment: davolash uchun
 *  - anesthesia: anesteziya uchun
 *  - photo: rasm/X-ray olish va saqlash uchun
 *  - data_processing: shaxsiy ma'lumotlarni qayta ishlash uchun (GDPR-style)
 *  - other: maxsus holatlar
 */
export const consentTypeEnum = pgEnum('consent_type', [
  'treatment',
  'anesthesia',
  'photo',
  'data_processing',
  'other',
]);

/**
 * Consent template — tenant-scoped, qayta foydalanish uchun shablonlar.
 * Admin tomonidan yaratiladi, har imzo paytida snapshot olinadi (consent_forms).
 */
export const consentTemplates = pgTable(
  'consent_templates',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    type: consentTypeEnum('type').notNull(),
    title: text('title').notNull(),
    bodyUz: text('body_uz').notNull(),
    bodyRu: text('body_ru'),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('consent_templates_tenant_type_idx').on(t.tenantId, t.type)],
);

export type ConsentTemplate = typeof consentTemplates.$inferSelect;
export type ConsentTemplateInsert = typeof consentTemplates.$inferInsert;

/**
 * Consent form — imzolangan instans (snapshot pattern).
 * `bodyText` shablon textini imzolash vaqtidagi nusxasini saqlaydi (auditga muhim).
 */
export const consentForms = pgTable(
  'consent_forms',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    patientId: uuid('patient_id')
      .notNull()
      .references(() => patients.id, { onDelete: 'cascade' }),
    templateId: uuid('template_id').references(() => consentTemplates.id, { onDelete: 'set null' }),

    type: consentTypeEnum('type').notNull(),
    title: text('title').notNull(),
    bodyText: text('body_text').notNull(), // snapshot
    language: text('language').notNull(), // 'uz' yoki 'ru' — qaysi til imzolangan

    signedAt: timestamp('signed_at', { withTimezone: true }).notNull().defaultNow(),
    signedByUserId: uuid('signed_by_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),

    // Hozir typed name as signature; signature image M6+ da qo'shiladi
    patientSignatureName: text('patient_signature_name'),
    notes: text('notes'),

    // CLI-461: consent muddati. `isPerpetual=true` bo'lsa `expiresAt` e'tiborga
    // olinmaydi (hech qachon eskirmaydi). Default `isPerpetual=false` + `expiresAt=null`
    // — ataylab: signer aniq tanlov qilmasa (muddatsiz YOKI muddat), consent
    // treatment-plan accept gate uchun "amaldagi emas" hisoblanadi (bo'sh/mazmunsiz
    // consent bilan plan accept bo'lmasligi kerak — CLI-461 asosiy talabi).
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    isPerpetual: boolean('is_perpetual').notNull().default(false),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('consent_forms_patient_idx').on(t.patientId),
    index('consent_forms_tenant_signed_idx').on(t.tenantId, t.signedAt),
  ],
);

export type ConsentForm = typeof consentForms.$inferSelect;
export type ConsentFormInsert = typeof consentForms.$inferInsert;
