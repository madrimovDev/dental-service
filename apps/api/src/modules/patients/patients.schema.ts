import { z } from 'zod';

const allergyEntrySchema = z.object({
  type: z.enum(['anesthetic', 'medication', 'material', 'food', 'other']),
  substance: z.string().min(1),
  severity: z.enum(['mild', 'moderate', 'severe']),
  notes: z.string().optional(),
});

const testResultSchema = z.object({
  date: z.iso.date(),
  result: z.enum(['positive', 'negative', 'unknown']),
});

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

export const patientBalanceSchema = z.object({
  balance: z.number(),
  planDebt: z.number(),
  nonPlanBalance: z.number(),
});
export type PatientBalanceDto = z.infer<typeof patientBalanceSchema>;

export const addRelativeSchema = z.object({
  relativePatientId: z.uuid(),
  relationship: z.string().min(1).max(60),
});
export type AddRelativeInput = z.infer<typeof addRelativeSchema>;

/** Qarindosh ko'rinishi — har link row uchun "boshqa" bemor + yo'nalish. */
export const patientRelativeViewSchema = z.object({
  id: z.uuid(),
  relativePatient: z.object({ id: z.uuid(), fullName: z.string() }),
  relationship: z.string(),
  direction: z.enum(['outgoing', 'incoming']),
});
export type PatientRelativeView = z.infer<typeof patientRelativeViewSchema>;
