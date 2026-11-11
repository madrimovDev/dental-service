import { sql } from 'drizzle-orm';
import {
  bigint,
  bigserial,
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

/**
 * Lab Hub sxemasi (spec §2.2). `lab_id` ustuni bor har jadval RLS ostida
 * (`migrations/rls/*.sql`, `scripts/check-rls-coverage.ts` Hub bo'limi):
 * lab konteksti (`app.current_lab_id`) faqat o'z labini, klinika konteksti
 * (`app.current_clinic_id`) faqat o'zi yuborgan ishlarni ko'radi.
 *
 * `*_enc` ustunlar — ilova darajasida shifrlangan (`lib/crypto.ts`, lab DEK).
 * `labs` va `clinics` — platforma darajasi (katalog/identifikatsiya), RLS'siz.
 */

export const labs = pgTable('labs', {
  id: uuid('id').primaryKey(),
  name: text('name').notNull(),
  city: text('city'),
  description: text('description'),
  catalogVisible: boolean('catalog_visible').notNull().default(true),
  // KEK bilan o'ralgan lab DEK (`v1:<iv>:<tag>:<ct>`, AAD = labId).
  dekWrapped: text('dek_wrapped').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const labUsers = pgTable(
  'lab_users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    labId: uuid('lab_id')
      .notNull()
      .references(() => labs.id, { onDelete: 'cascade' }),
    fullName: text('full_name').notNull(),
    // Hub'ga xos login — `normalizePhone` kanonik shakli, Hub bo'yicha unique.
    phone: text('phone').notNull(),
    passwordHash: text('password_hash').notNull(),
    role: text('role').notNull().$type<'lead' | 'technician'>(),
    mustChangePassword: boolean('must_change_password').notNull().default(true),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('lab_users_phone_uq').on(t.phone), index('lab_users_lab_idx').on(t.labId)],
);

export const clinics = pgTable('clinics', {
  id: uuid('id').primaryKey().defaultRandom(),
  supervisorClinicId: uuid('supervisor_clinic_id').notNull().unique(),
  mode: text('mode').notNull().$type<'desktop' | 'saas'>(),
  name: text('name').notNull(),
  // SHA-256 (hex) — xom kalit faqat connect javobida bir marta qaytariladi.
  hubKeyHash: text('hub_key_hash').unique(),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  lastVerifiedAt: timestamp('last_verified_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const labClinicLinks = pgTable(
  'lab_clinic_links',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    labId: uuid('lab_id')
      .notNull()
      .references(() => labs.id, { onDelete: 'cascade' }),
    clinicId: uuid('clinic_id')
      .notNull()
      .references(() => clinics.id, { onDelete: 'cascade' }),
    status: text('status').notNull().$type<'pending' | 'active' | 'rejected' | 'revoked'>(),
    requestedAt: timestamp('requested_at', { withTimezone: true }).notNull().defaultNow(),
    decidedAt: timestamp('decided_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('lab_clinic_links_uq').on(t.labId, t.clinicId),
    index('lab_clinic_links_clinic_idx').on(t.clinicId),
  ],
);

export const priceListItems = pgTable(
  'price_list_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    labId: uuid('lab_id')
      .notNull()
      .references(() => labs.id, { onDelete: 'cascade' }),
    workType: text('work_type').notNull(),
    material: text('material'),
    price: numeric('price', { precision: 14, scale: 2 }).notNull(),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('price_list_items_lab_idx').on(t.labId)],
);

export type CaseStatus =
  | 'sent'
  | 'accepted'
  | 'in_progress'
  | 'ready'
  | 'rejected'
  | 'delivered'
  | 'remake';

export const cases = pgTable(
  'cases',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    labId: uuid('lab_id')
      .notNull()
      .references(() => labs.id, { onDelete: 'cascade' }),
    clinicId: uuid('clinic_id')
      .notNull()
      .references(() => clinics.id, { onDelete: 'cascade' }),
    // Klinika tomonidagi idempotentlik kaliti (klinika `lab_orders` id/ref).
    clinicCaseRef: text('clinic_case_ref').notNull(),
    // L3: bemor to'liq ismi — shifrlangan; saqlash muddatidan keyin NULL (L9).
    patientNameEnc: text('patient_name_enc'),
    patientSex: text('patient_sex').$type<'male' | 'female'>(),
    patientAge: integer('patient_age'),
    // Klinika ichki ish kodi (bemor karta raqami emas).
    clinicCode: text('clinic_code'),
    doctorName: text('doctor_name'),
    teeth: jsonb('teeth').$type<number[]>().notNull().default(sql`'[]'::jsonb`),
    workType: text('work_type').notNull(),
    material: text('material'),
    shadeEnc: text('shade_enc'),
    dueDate: date('due_date'),
    noteEnc: text('note_enc'),
    status: text('status').notNull().$type<CaseStatus>(),
    rejectReason: text('reject_reason'),
    assignedTechnicianId: uuid('assigned_technician_id').references(() => labUsers.id, {
      onDelete: 'set null',
    }),
    proposedPrice: numeric('proposed_price', { precision: 14, scale: 2 }),
    approvedPrice: numeric('approved_price', { precision: 14, scale: 2 }),
    approvedAt: timestamp('approved_at', { withTimezone: true }),
    sentAt: timestamp('sent_at', { withTimezone: true }).notNull().defaultNow(),
    readyAt: timestamp('ready_at', { withTimezone: true }),
    deliveredAt: timestamp('delivered_at', { withTimezone: true }),
    purgedAt: timestamp('purged_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('cases_clinic_ref_uq').on(t.clinicId, t.clinicCaseRef),
    index('cases_lab_status_idx').on(t.labId, t.status),
    index('cases_delivered_idx').on(t.deliveredAt),
  ],
);

export const caseFiles = pgTable(
  'case_files',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    labId: uuid('lab_id')
      .notNull()
      .references(() => labs.id, { onDelete: 'cascade' }),
    clinicId: uuid('clinic_id')
      .notNull()
      .references(() => clinics.id, { onDelete: 'cascade' }),
    caseId: uuid('case_id')
      .notNull()
      .references(() => cases.id, { onDelete: 'cascade' }),
    uploadedBy: text('uploaded_by').notNull().$type<'clinic' | 'lab'>(),
    // Fayl nomi bemor ismini o'z ichiga olishi mumkin — shifrlangan.
    fileNameEnc: text('file_name_enc'),
    mimeType: text('mime_type').notNull(),
    sizeBytes: integer('size_bytes').notNull(),
    // `<labId>/<uuid>.bin` — UPLOADS_DIR ga nisbatan, faqat shifrlangan blob.
    storageKey: text('storage_key').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [index('case_files_case_idx').on(t.caseId)],
);

export const caseMessages = pgTable(
  'case_messages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    labId: uuid('lab_id')
      .notNull()
      .references(() => labs.id, { onDelete: 'cascade' }),
    clinicId: uuid('clinic_id')
      .notNull()
      .references(() => clinics.id, { onDelete: 'cascade' }),
    caseId: uuid('case_id')
      .notNull()
      .references(() => cases.id, { onDelete: 'cascade' }),
    author: text('author').notNull().$type<'clinic' | 'lab'>(),
    authorName: text('author_name'),
    bodyEnc: text('body_enc'),
    fileId: uuid('file_id').references(() => caseFiles.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('case_messages_case_idx').on(t.caseId)],
);

export type CaseEventType =
  | 'created'
  | 'updated'
  | 'status'
  | 'assigned'
  | 'price_proposed'
  | 'price_approved'
  | 'message'
  | 'file'
  | 'purged';

/**
 * Audit + klinika sinxron kursori. `seq` — global monoton (lekin COMMIT tartibida
 * emas: kichik seq'li tranzaksiya kattasidan keyin commit bo'lishi mumkin).
 * Shuning uchun klinika kursori `(tx_id, seq)` juftligi: `tx_id` — yozgan
 * tranzaksiyaning xid'i; `GET /v1/clinic/changes` faqat `tx_id < snapshot xmin`
 * (ya'ni yakunlangan tranzaksiyalar) hodisalarini beradi — kursor hech qachon
 * hali commit bo'lmagan hodisadan oshib ketmaydi. `payload` PHI'siz.
 */
export const caseEvents = pgTable(
  'case_events',
  {
    seq: bigserial('seq', { mode: 'number' }).primaryKey(),
    // Yozgan tranzaksiya xid'i (pg_current_xact_id) — commit-xavfsiz kursor uchun.
    txId: bigint('tx_id', { mode: 'number' })
      .notNull()
      .default(sql`(pg_current_xact_id()::text)::bigint`),
    labId: uuid('lab_id')
      .notNull()
      .references(() => labs.id, { onDelete: 'cascade' }),
    clinicId: uuid('clinic_id')
      .notNull()
      .references(() => clinics.id, { onDelete: 'cascade' }),
    caseId: uuid('case_id')
      .notNull()
      .references(() => cases.id, { onDelete: 'cascade' }),
    type: text('type').notNull().$type<CaseEventType>(),
    actor: text('actor').notNull().$type<'clinic' | 'lab' | 'system'>(),
    actorUserId: uuid('actor_user_id'),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('case_events_clinic_seq_idx').on(t.clinicId, t.seq),
    index('case_events_clinic_tx_seq_idx').on(t.clinicId, t.txId, t.seq),
  ],
);

/**
 * KEK kanareykasi (bitta qator, id=1): birinchi boot'da KEK bilan shifrlangan
 * tasodifiy qiymat yoziladi; keyingi har boot uni ochib KEK to'g'riligini
 * tekshiradi (`lib/kek-check.ts`). Noto'g'ri KEK bilan boot yiqiladi — aks holda
 * yangi lablar DEK'i noto'g'ri kalit bilan o'ralib, qaytarib bo'lmas holga tushardi.
 */
export const kekCheck = pgTable('kek_check', {
  id: integer('id').primaryKey().default(1),
  canary: text('canary').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/** Klinika bo'yicha oylik akt-sverka: to'langanini lab qo'lda belgilaydi. */
export const settlements = pgTable(
  'settlements',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    labId: uuid('lab_id')
      .notNull()
      .references(() => labs.id, { onDelete: 'cascade' }),
    clinicId: uuid('clinic_id')
      .notNull()
      .references(() => clinics.id, { onDelete: 'cascade' }),
    period: text('period').notNull(), // 'YYYY-MM'
    totalApproved: numeric('total_approved', { precision: 14, scale: 2 }).notNull(),
    paidAt: timestamp('paid_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('settlements_uq').on(t.labId, t.clinicId, t.period)],
);

export type Lab = typeof labs.$inferSelect;
export type LabUser = typeof labUsers.$inferSelect;
export type Clinic = typeof clinics.$inferSelect;
export type Case = typeof cases.$inferSelect;
export type CaseFile = typeof caseFiles.$inferSelect;
export type CaseMessage = typeof caseMessages.$inferSelect;
