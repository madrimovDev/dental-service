import { z } from 'zod';

const consentType = z.enum(['treatment', 'anesthesia', 'photo', 'data_processing', 'other']);

export const createTemplateSchema = z.object({
  type: consentType,
  title: z.string().min(2).max(200),
  bodyUz: z.string().min(10),
  bodyRu: z.string().optional(),
  isActive: z.boolean().default(true),
});
export type CreateTemplateInput = z.infer<typeof createTemplateSchema>;

export const updateTemplateSchema = createTemplateSchema.partial();
export type UpdateTemplateInput = z.infer<typeof updateTemplateSchema>;

export const signFormSchema = z.object({
  patientId: z.uuid(),
  templateId: z.uuid().optional(),
  type: consentType,
  title: z.string().min(2).max(200),
  bodyText: z.string().min(10),
  language: z.enum(['uz', 'ru']),
  patientSignatureName: z.string().min(2).max(200).optional(),
  notes: z.string().max(1000).optional(),
});
export type SignFormInput = z.infer<typeof signFormSchema>;
