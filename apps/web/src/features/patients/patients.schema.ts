import { z } from 'zod';

export const patientFormSchema = z.object({
  fullName: z.string().min(2).max(120),
  dateOfBirth: z.string().optional(),
  gender: z.enum(['male', 'female', 'other']).optional(),
  phone: z
    .string()
    .regex(/^\+?\d{9,15}$/)
    .optional()
    .or(z.literal('')),
  phoneSecondary: z
    .string()
    .regex(/^\+?\d{9,15}$/)
    .optional()
    .or(z.literal('')),
  passport: z.string().max(64).optional(),
  address: z.string().max(500).optional(),
  notes: z.string().max(2000).optional(),
  tags: z.array(z.string()).default([]),
  source: z.string().max(80).optional(),
  insurance: z
    .object({
      provider: z.string().max(120),
      policyNumber: z.string().max(80),
    })
    .refine((v) => (v.provider.trim() === '') === (v.policyNumber.trim() === ''), {
      path: ['policyNumber'],
    })
    .nullable()
    .optional(),
});
export type PatientFormValues = z.infer<typeof patientFormSchema>;

export const patientEditSchema = z.object({
  fullName: z.string().min(2).max(120),
  dateOfBirth: z.string().optional(),
  gender: z.enum(['male', 'female', 'other']).optional(),
  phone: z.string().optional(),
  phoneSecondary: z.string().optional(),
  passport: z.string().optional(),
  address: z.string().optional(),
  notes: z.string().optional(),
});
export type PatientEditValues = z.infer<typeof patientEditSchema>;

export const medicalRecordFormSchema = z.object({
  anamnez: z.string().optional(),
  chronicConditionsText: z.string().optional(),
  currentMedicationsText: z.string().optional(),
  bloodType: z.string().optional(),
  pregnancyStatus: z.enum(['not_applicable', 'pregnant', 'planning', 'lactating']).optional(),
});
export type MedicalRecordFormValues = z.infer<typeof medicalRecordFormSchema>;
