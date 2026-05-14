import { z } from 'zod';

export const createServiceSchema = z.object({
  code: z.string().min(1).max(64),
  nameUz: z.string().min(2).max(200),
  nameRu: z.string().max(200).optional(),
  category: z.string().max(100).optional(),
  durationMinutes: z.coerce.number().int().positive().default(30),
  requiredRole: z.string().max(50).optional(),
  descriptionUz: z.string().max(1000).optional(),
  descriptionRu: z.string().max(1000).optional(),
  isActive: z.boolean().default(true),
  // Inline default price for default branch
  initialPrice: z.coerce.number().nonnegative().optional(),
  initialBranchId: z.uuid().optional(),
});
export type CreateServiceInput = z.infer<typeof createServiceSchema>;

export const updateServiceSchema = createServiceSchema
  .partial()
  .omit({ initialPrice: true, initialBranchId: true });
export type UpdateServiceInput = z.infer<typeof updateServiceSchema>;

export const setServicePriceSchema = z.object({
  branchId: z.uuid(),
  price: z.coerce.number().nonnegative(),
  currency: z.string().max(8).default('UZS'),
});
export type SetServicePriceInput = z.infer<typeof setServicePriceSchema>;
