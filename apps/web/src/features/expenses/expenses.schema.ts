import { z } from 'zod';

/** Xarajat forma sxemasi (zod4Resolver bilan). `amount` → number (api-client `amount: number` kutadi). */
export const expenseFormSchema = z.object({
  amount: z.coerce.number().positive(),
  date: z.string().min(1),
  categoryId: z.string().nullish(),
  branchId: z.string().nullish(),
  note: z.string().max(500).nullish(),
});
export type ExpenseFormValues = z.infer<typeof expenseFormSchema>;

/** Kategoriya forma sxemasi. */
export const categoryFormSchema = z.object({
  name: z.string().min(1).max(100),
  nameRu: z.string().max(100).optional(),
});
export type CategoryFormValues = z.infer<typeof categoryFormSchema>;
