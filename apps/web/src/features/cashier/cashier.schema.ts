import { z } from 'zod';

export const posFormSchema = z.object({
  discount: z.coerce.number().nonnegative(),
  paidAmount: z.coerce.number().nonnegative().optional(),
  paymentMethod: z.enum(['cash', 'card', 'transfer', 'other']),
  notes: z.string().max(1000).optional(),
});
export type PosFormSchema = z.infer<typeof posFormSchema>;
