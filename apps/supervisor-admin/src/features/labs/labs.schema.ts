import { z } from 'zod';

export const createLabFormSchema = z.object({
  name: z.string().trim().min(2, 'Laboratoriya nomi kiritilishi shart'),
  city: z.string().optional(),
  description: z.string().optional(),
  catalogVisible: z.boolean(),
  expiresAt: z.string().min(1, 'Obuna muddatini tanlang'),
  leadFullName: z.string().trim().min(2, 'Rahbar F.I.Sh. kiritilishi shart'),
  leadPhone: z.string().min(9, 'Rahbar telefoni kiritilishi shart'),
});
export type CreateLabFormValues = z.infer<typeof createLabFormSchema>;

export const renewLabFormSchema = z.object({
  expiresAt: z.string().min(1, 'Yangi muddatni tanlang'),
});
export type RenewLabFormValues = z.infer<typeof renewLabFormSchema>;
