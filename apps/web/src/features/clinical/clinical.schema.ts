import { z } from 'zod';

// ===== A: tooth chart snapshot =====
export const toothChartSnapshotSchema = z.object({
  isPrimaryDentition: z.boolean(),
  notes: z.string().optional(),
});

// ===== A: treatment plan =====
export const stageSchema = z.object({
  // CLI-188: katalog xizmati tanlansa to'ldiriladi (snapshot — cost forma vaqtida olinadi).
  serviceId: z.string().optional(),
  serviceName: z.string().min(1),
  toothNumbersText: z.string(),
  estimatedVisits: z.number().min(1),
  estimatedDurationMinutes: z.number().optional(),
  cost: z.number().min(0),
  notes: z.string().optional(),
});

export const treatmentPlanFormSchema = z.object({
  title: z.string().min(1),
  notes: z.string().optional(),
  stages: z.array(stageSchema).min(1),
});
export type TreatmentPlanFormValues = z.infer<typeof treatmentPlanFormSchema>;
export type StageFormValues = z.infer<typeof stageSchema>;

// ===== A: visit note =====
export const visitNoteFormSchema = z.object({
  subjective: z.string().optional(),
  objective: z.string().optional(),
  assessmentDiagnoses: z.array(z.string()),
  plan: z.string().optional(),
  freeNotes: z.string().optional(),
  // Select clearable `null` qaytaradi — nullable (submit'da `?? undefined`).
  appointmentId: z.string().nullable().optional(),
  // CLI-414: bajarilgan xizmatlar (BOM auto-deduction, Qaror #15). Bo'sh → stock'ga tegilmaydi.
  // NOTE: `stageId` (visit→stage completion) uchun avval hand-yozilgan `CreateVisitNoteInput`
  // (packages/api-client) `stageId?: string` bilan kengaytirilishi kerak — handoff (ownership tashqarisi).
  performedServices: z.array(z.string()).default([]),
});
export type VisitNoteFormValues = z.infer<typeof visitNoteFormSchema>;

// ===== B: prescription =====
export const prescriptionItemSchema = z.object({
  medicationName: z.string().min(1),
  dosage: z.string().min(1),
  frequency: z.string(),
  durationDays: z.number().optional(),
  instructions: z.string().optional(),
});

export const prescriptionFormSchema = z.object({
  diagnosis: z.string().optional(),
  notes: z.string().optional(),
  items: z.array(prescriptionItemSchema).min(1),
});
export type PrescriptionFormValues = z.infer<typeof prescriptionFormSchema>;

// ===== B: lab order =====
export const labOrderItemSchema = z.object({
  description: z.string().min(1),
  toothNumbersText: z.string(),
  material: z.string().optional(),
  shade: z.string().optional(),
  quantity: z.number().optional(),
});

export const labOrderFormSchema = z.object({
  labName: z.string().min(1),
  orderType: z.string(),
  expectedDate: z.string().optional(),
  cost: z.number().optional(),
  notes: z.string().optional(),
  items: z.array(labOrderItemSchema).min(1),
});
export type LabOrderFormValues = z.infer<typeof labOrderFormSchema>;

// ===== B: consent =====
export const consentSignFormSchema = z.object({
  // Select clearable `null` qaytaradi — nullable (submit'da `?? undefined`).
  templateId: z.string().nullable().optional(),
  type: z.string(),
  title: z.string().min(1),
  bodyText: z.string().min(10),
  patientSignatureName: z.string().optional(),
  // CLI-461: muddat — treatment-plan accept gate shu ikkalasiga tayanadi
  // (isPerpetual=true YOKI expiresAt>now bo'lsa "amaldagi"). Default true —
  // avvalgi (muddatsiz) xulqni saqlaydi, staff aniq muddat qo'yishni tanlasa
  // checkbox'ni o'chiradi va DatePickerInput ko'rinadi.
  isPerpetual: z.boolean(),
  // DatePickerInput clearable `null` qaytaradi.
  expiresAt: z.date().nullable().optional(),
});
export type ConsentSignFormValues = z.infer<typeof consentSignFormSchema>;

export const consentTemplateFormSchema = z.object({
  type: z.string(),
  title: z.string().min(1),
  bodyUz: z.string().min(10),
  bodyRu: z.string().optional(),
});
export type ConsentTemplateFormValues = z.infer<typeof consentTemplateFormSchema>;

// ===== C: image upload =====
export const uploadImageFormSchema = z.object({
  type: z.string(),
  title: z.string().optional(),
  description: z.string().optional(),
  toothNumbersText: z.string(),
  takenDate: z.string().optional(),
});
export type UploadImageFormValues = z.infer<typeof uploadImageFormSchema>;
