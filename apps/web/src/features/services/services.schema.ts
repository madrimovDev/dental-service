import { z } from 'zod';

export const serviceFormSchema = z.object({
  code: z.string().min(1).max(64),
  nameUz: z.string().min(2).max(200),
  nameRu: z.string().max(200),
  category: z.string().max(100),
  durationMinutes: z.coerce.number().int().positive(),
  requiredRole: z.string().max(50),
  descriptionUz: z.string().max(1000),
  descriptionRu: z.string().max(1000),
  isActive: z.boolean(),
  initialBranchId: z.string().optional(),
  initialPrice: z.coerce.number().nonnegative().optional(),
});
export type ServiceFormSchema = z.infer<typeof serviceFormSchema>;
