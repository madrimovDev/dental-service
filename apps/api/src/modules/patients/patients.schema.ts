import { z } from '@hono/zod-openapi';

const allergyEntrySchema = z
  .object({
    type: z.enum(['anesthetic', 'medication', 'material', 'food', 'other']),
    substance: z.string().min(1),
    severity: z.enum(['mild', 'moderate', 'severe']),
    notes: z.string().optional(),
  })
  .openapi('AllergyEntry');

/** Sug'urta polisi (V3-5) — provider+policyNumber majburiy, qolgani ixtiyoriy. */
const insuranceInputSchema = z.object({
  provider: z.string().min(1).max(120),
  policyNumber: z.string().min(1).max(80),
  coverageType: z.enum(['dental', 'general', 'other']).optional(),
  expiryDate: z.iso.date().optional(),
  isActive: z.boolean().optional(),
});

const testResultSchema = z.object({
  date: z.iso.date(),
  result: z.enum(['positive', 'negative', 'unknown']),
});

const pregnancyStatusSchema = z
  .enum(['not_applicable', 'pregnant', 'planning', 'lactating'])
  .openapi('PregnancyStatus');

const testResultsSchema = z
  .object({
    hiv: testResultSchema.optional(),
    hepatitis_b: testResultSchema.optional(),
    hepatitis_c: testResultSchema.optional(),
    covid: testResultSchema.optional(),
  })
  .openapi('TestResults');

// ─── Request schemas (SAQLANADI — hand client REQUEST tiplari) ───────────────

/** Bugungi sana (server, UTC) ISO date-only shaklda — dateOfBirth yuqori chegarasi. */
const todayIsoDate = () => new Date().toISOString().slice(0, 10);

export const createPatientSchema = z.object({
  fullName: z.string().min(2).max(120),
  // CLI-464: kelajak sana rad etiladi — refine har parse'da joriy sanaga solishtiradi.
  dateOfBirth: z.iso
    .date()
    .nullable()
    .optional()
    .refine((v) => v == null || v <= todayIsoDate(), {
      message: 'dateOfBirth cannot be in the future',
    }),
  gender: z.enum(['male', 'female', 'other']).nullable().optional(),
  // CLI-455: .nullable() — ixtiyoriy PII/kontakt maydonni `null` bilan tozalash
  // mumkin bo'lishi uchun (insurance bilan bir xil naqsh); kalit umuman yo'q
  // bo'lsa (`undefined`) — service.update() tegmaydi (no-op, PATCH semantikasi).
  phone: z
    .string()
    .regex(/^\+?\d{9,15}$/)
    .nullable()
    .optional(),
  phoneSecondary: z
    .string()
    .regex(/^\+?\d{9,15}$/)
    .nullable()
    .optional(),
  passport: z.string().max(64).nullable().optional(),
  address: z.string().max(500).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  tags: z.array(z.string().min(1).max(40)).max(20).optional(),
  source: z.string().max(80).optional(),
  insurance: insuranceInputSchema.nullable().optional(),
  // CLI-474 (L8): bemor rozi bo'lsagina telefoni yo'qligida recall/reminder SMS'i
  // favqulodda aloqaga fallback qilinadi (opt-in maxfiylik roziligi).
  allowEmergencyRecall: z.boolean().optional(),
});
export type CreatePatientInput = z.infer<typeof createPatientSchema>;

export const updatePatientSchema = createPatientSchema.partial();
export type UpdatePatientInput = z.infer<typeof updatePatientSchema>;

export const updateMedicalRecordSchema = z.object({
  anamnez: z.string().max(5000).optional(),
  chronicConditions: z.array(z.string()).optional(),
  currentMedications: z.array(z.string()).optional(),
  allergies: z.array(allergyEntrySchema).optional(),
  bloodType: z.string().max(8).optional(),
  pregnancyStatus: z.enum(['not_applicable', 'pregnant', 'planning', 'lactating']).optional(),
  testResults: z
    .object({
      hiv: testResultSchema.optional(),
      hepatitis_b: testResultSchema.optional(),
      hepatitis_c: testResultSchema.optional(),
      covid: testResultSchema.optional(),
    })
    .optional(),
});
export type UpdateMedicalRecordInput = z.infer<typeof updateMedicalRecordSchema>;

export const listQuerySchema = z.object({
  search: z.string().optional(),
  // ⚠️ z.coerce.boolean() query-string uchun BUZUQ: Boolean("false") === true.
  // "true"/"false" string'larini to'g'ri parse qilamiz (CLI-149).
  archived: z
    .union([z.boolean(), z.enum(['true', 'false'])])
    .optional()
    .transform((v) => v === true || v === 'true'),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});
export type ListQuery = z.infer<typeof listQuerySchema>;

export const addRelativeSchema = z.object({
  relativePatientId: z.uuid(),
  relationship: z.string().min(1).max(60),
});
export type AddRelativeInput = z.infer<typeof addRelativeSchema>;

/** Erkin emergency contact (tizimda bemor BO'LMAGAN shaxs) — add input. */
export const addEmergencyContactSchema = z.object({
  name: z.string().min(1).max(120),
  // CLI-474 (L3): patient.phone bilan bir xil regex (avval erkin 40-belgigacha matn edi).
  phone: z.string().regex(/^\+?\d{9,15}$/),
  relationship: z.string().min(1).max(60).optional(),
  isPrimary: z.boolean().optional(),
});
export type AddEmergencyContactInput = z.infer<typeof addEmergencyContactSchema>;

// ─── Path param schemas ──────────────────────────────────────────────────────

/** Path param schema for routes requiring :id */
export const patientIdParamSchema = z
  .object({ id: z.uuid() })
  .openapi({ param: { name: 'id', in: 'path' } });

/** Path param schema for relatives sub-resource (:patientId == :id, :relId). */
export const relativeParamSchema = z.object({
  id: z.uuid().openapi({ param: { name: 'id', in: 'path' } }),
  relId: z.uuid().openapi({ param: { name: 'relId', in: 'path' } }),
});

/** Path param schema for emergency-contacts sub-resource (:id, :contactId). */
export const emergencyContactParamSchema = z.object({
  id: z.uuid().openapi({ param: { name: 'id', in: 'path' } }),
  contactId: z.uuid().openapi({ param: { name: 'contactId', in: 'path' } }),
});

// ─── Response DTOs (wire shape — ISO strings, nullable explicit) ─────────────

/** Patient DTO — wire shape. `dateOfBirth` is a date-only string (NOT datetime). */
export const patientDtoSchema = z
  .object({
    id: z.uuid(),
    tenantId: z.uuid(),
    fullName: z.string(),
    dateOfBirth: z.string().nullable(),
    gender: z.enum(['male', 'female', 'other']).nullable(),
    phone: z.string().nullable(),
    phoneSecondary: z.string().nullable(),
    passport: z.string().nullable(),
    address: z.string().nullable(),
    photoUrl: z.string().nullable(),
    notes: z.string().nullable(),
    tags: z.array(z.string()),
    source: z.string().nullable(),
    insurance: z
      .object({
        provider: z.string(),
        policyNumber: z.string(),
        coverageType: z.enum(['dental', 'general', 'other']).nullable(),
        expiryDate: z.string().nullable(),
        isActive: z.boolean().nullable(),
      })
      .nullable(),
    /** Computed: active | expired | inactive | none (V3-5). */
    insuranceStatus: z.enum(['active', 'expired', 'inactive', 'none']),
    /** CLI-474 (L8): favqulodda aloqaga recall/reminder fallback roziligi. */
    allowEmergencyRecall: z.boolean(),
    archivedAt: z.string().nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .openapi('Patient');
export type PatientDto = z.infer<typeof patientDtoSchema>;

/** List item DTO — Patient + computed balance (number). */
export const patientListItemDtoSchema = patientDtoSchema
  .extend({ balance: z.number() })
  .openapi('PatientListItem');
export type PatientListItemDto = z.infer<typeof patientListItemDtoSchema>;

/** Paginated list response — `{ data, meta }` inside `ok()` envelope. */
export const patientListResponseDtoSchema = z
  .object({
    data: z.array(patientListItemDtoSchema),
    meta: z.object({
      page: z.number().int(),
      pageSize: z.number().int(),
      total: z.number().int(),
    }),
  })
  .openapi('PatientListResponse');

/** Bemor balansi — computed numbers (saqlanmaydi). */
export const patientBalanceSchema = z
  .object({
    balance: z.number(),
    planDebt: z.number(),
    nonPlanBalance: z.number(),
  })
  .openapi('PatientBalance');
export type PatientBalanceDto = z.infer<typeof patientBalanceSchema>;

/** Medical record DTO — wire shape (timestamps ISO, JSONB passthrough). */
export const medicalRecordDtoSchema = z
  .object({
    id: z.uuid(),
    tenantId: z.uuid(),
    patientId: z.uuid(),
    anamnez: z.string().nullable(),
    chronicConditions: z.array(z.string()).nullable(),
    currentMedications: z.array(z.string()).nullable(),
    allergies: z.array(allergyEntrySchema).nullable(),
    bloodType: z.string().nullable(),
    pregnancyStatus: pregnancyStatusSchema.nullable(),
    testResults: testResultsSchema.nullable(),
    lastUpdatedBy: z.uuid().nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .openapi('MedicalRecord');
export type MedicalRecordDto = z.infer<typeof medicalRecordDtoSchema>;

/** Medical record tarix yozuvi — bitta o'zgarish + field-darajali diff (V2-7). */
export const medicalRecordHistoryEntrySchema = z
  .object({
    id: z.uuid(),
    changedAt: z.string(),
    changedBy: z.object({ id: z.uuid(), fullName: z.string() }).nullable(),
    changes: z.array(
      z.object({
        field: z.string(),
        before: z.unknown(),
        after: z.unknown(),
      }),
    ),
  })
  .openapi('MedicalRecordHistoryEntry');
export type MedicalRecordHistoryEntryDto = z.infer<typeof medicalRecordHistoryEntrySchema>;

/** Qarindosh ko'rinishi — har link row uchun "boshqa" bemor + yo'nalish. */
export const patientRelativeViewSchema = z
  .object({
    id: z.uuid(),
    relativePatient: z.object({ id: z.uuid(), fullName: z.string() }),
    relationship: z.string(),
    direction: z.enum(['outgoing', 'incoming']),
  })
  .openapi('PatientRelativeView');
export type PatientRelativeView = z.infer<typeof patientRelativeViewSchema>;

/** Qarindosh link row DTO — `relatives.add` raw insert qaytaradi. */
export const patientRelativeDtoSchema = z
  .object({
    id: z.uuid(),
    tenantId: z.uuid(),
    patientId: z.uuid(),
    relativePatientId: z.uuid(),
    relationship: z.string(),
    createdAt: z.string(),
  })
  .openapi('PatientRelative');
export type PatientRelativeDto = z.infer<typeof patientRelativeDtoSchema>;

/** DELETE /{id} archive response. */
export const patientArchiveResultSchema = z
  .object({ archived: z.literal(true), id: z.uuid() })
  .openapi('PatientArchiveResult');

/** DELETE relatives remove response. */
export const relativeRemoveResultSchema = z
  .object({ removed: z.literal(true), id: z.uuid() })
  .openapi('PatientRelativeRemoveResult');

/** Emergency contact DTO — wire shape. */
export const emergencyContactDtoSchema = z
  .object({
    id: z.uuid(),
    tenantId: z.uuid(),
    patientId: z.uuid(),
    name: z.string(),
    phone: z.string(),
    relationship: z.string().nullable(),
    isPrimary: z.boolean(),
    createdAt: z.string(),
  })
  .openapi('PatientEmergencyContact');
export type EmergencyContactDto = z.infer<typeof emergencyContactDtoSchema>;

/** DELETE emergency-contacts remove response. */
export const emergencyContactRemoveResultSchema = z
  .object({ removed: z.literal(true), id: z.uuid() })
  .openapi('PatientEmergencyContactRemoveResult');
