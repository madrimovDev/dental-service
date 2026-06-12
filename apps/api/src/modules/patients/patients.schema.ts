import { z } from '@hono/zod-openapi';

const allergyEntrySchema = z
  .object({
    type: z.enum(['anesthetic', 'medication', 'material', 'food', 'other']),
    substance: z.string().min(1),
    severity: z.enum(['mild', 'moderate', 'severe']),
    notes: z.string().optional(),
  })
  .openapi('AllergyEntry');

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

export const createPatientSchema = z.object({
  fullName: z.string().min(2).max(120),
  dateOfBirth: z.iso.date().optional(),
  gender: z.enum(['male', 'female', 'other']).optional(),
  phone: z
    .string()
    .regex(/^\+?\d{9,15}$/)
    .optional(),
  phoneSecondary: z
    .string()
    .regex(/^\+?\d{9,15}$/)
    .optional(),
  passport: z.string().max(64).optional(),
  address: z.string().max(500).optional(),
  notes: z.string().max(2000).optional(),
  tags: z.array(z.string().min(1).max(40)).max(20).optional(),
  source: z.string().max(80).optional(),
  insurance: z
    .object({ provider: z.string().min(1).max(120), policyNumber: z.string().min(1).max(80) })
    .nullable()
    .optional(),
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
  archived: z.coerce.boolean().optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});
export type ListQuery = z.infer<typeof listQuerySchema>;

export const addRelativeSchema = z.object({
  relativePatientId: z.uuid(),
  relationship: z.string().min(1).max(60),
});
export type AddRelativeInput = z.infer<typeof addRelativeSchema>;

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
    insurance: z.object({ provider: z.string(), policyNumber: z.string() }).nullable(),
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
