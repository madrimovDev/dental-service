import { z } from 'zod';

/**
 * Ixtiyoriy telefon maydoni — bo'sh satr yoki `+998XXXXXXXXX`-ko'rinishidagi format.
 * `patientFormSchema` (create) va `patientEditSchema` (edit) ikkalasida ham ishlatiladi (DRY).
 */
const phoneOptionalSchema = z
  .string()
  .regex(/^\+?\d{9,15}$/)
  .optional()
  .or(z.literal(''));

export const patientFormSchema = z.object({
  fullName: z.string().min(2).max(120),
  dateOfBirth: z.string().optional(),
  gender: z.enum(['male', 'female', 'other']).optional(),
  phone: phoneOptionalSchema,
  phoneSecondary: phoneOptionalSchema,
  passport: z.string().max(64).optional(),
  address: z.string().max(500).optional(),
  notes: z.string().max(2000).optional(),
  tags: z.array(z.string()).default([]),
  source: z.string().max(80).optional(),
  insurance: z
    .object({
      provider: z.string().max(120),
      policyNumber: z.string().max(80),
      coverageType: z.enum(['dental', 'general', 'other']).optional(),
      expiryDate: z.string().optional(),
      isActive: z.boolean().optional(),
    })
    // CLI-469: provider bo'sh bo'lsa-da coverageType/expiryDate/isActive to'ldirilgan bo'lishi
    // mumkin edi — submit vaqtida hammasi jim yo'qolib ketardi (PatientNewScreen.tsx).
    // Endi: policyNumber yoki boshqa sug'urta maydonlaridan biri to'ldirilsa, provider majburiy.
    .superRefine((v, ctx) => {
      const providerFilled = v.provider.trim() !== '';
      const policyFilled = v.policyNumber.trim() !== '';
      const hasOtherDetails =
        v.coverageType !== undefined || (v.expiryDate ?? '').trim() !== '' || v.isActive === true;

      if (providerFilled !== policyFilled) {
        ctx.addIssue({
          code: 'custom',
          path: ['policyNumber'],
          message: 'patients.form.insurance_policy_required',
        });
      }
      if (!providerFilled && hasOtherDetails) {
        ctx.addIssue({
          code: 'custom',
          path: ['provider'],
          message: 'patients.form.insurance_provider_required',
        });
      }
    })
    .nullable()
    .optional(),
  // CLI-474 (L8): favqulodda aloqaga recall/reminder fallback roziligi (opt-in).
  allowEmergencyRecall: z.boolean().default(false),
});
export type PatientFormValues = z.infer<typeof patientFormSchema>;

export const patientEditSchema = z.object({
  fullName: z.string().min(2).max(120),
  dateOfBirth: z.string().optional(),
  gender: z.enum(['male', 'female', 'other']).optional(),
  phone: phoneOptionalSchema,
  phoneSecondary: phoneOptionalSchema,
  passport: z.string().optional(),
  address: z.string().optional(),
  notes: z.string().optional(),
  allowEmergencyRecall: z.boolean().default(false),
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

export const addRelativeFormSchema = z.object({
  relativePatientId: z.uuid(),
  relationship: z.string().min(1).max(60),
});
export type AddRelativeFormValues = z.infer<typeof addRelativeFormSchema>;

export const addEmergencyContactFormSchema = z.object({
  name: z.string().min(1).max(120),
  phone: z
    .string()
    .regex(/^\+?\d{9,15}$/)
    .max(40),
  relationship: z.string().max(60).optional(),
  isPrimary: z.boolean().optional(),
});
export type AddEmergencyContactFormValues = z.infer<typeof addEmergencyContactFormSchema>;
