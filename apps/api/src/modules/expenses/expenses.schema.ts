import { z } from 'zod';

// ===== Kategoriya =====

export const createCategorySchema = z.object({
  name: z.string().min(1).max(120),
  nameRu: z.string().min(1).max(120).optional(),
});
export type CreateCategoryInput = z.infer<typeof createCategorySchema>;

export const updateCategorySchema = createCategorySchema.partial();
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;

// ===== Xarajat =====

export const createExpenseSchema = z.object({
  categoryId: z.uuid().optional(),
  branchId: z.uuid().optional(),
  amount: z.number().positive(),
  date: z.iso.date(),
  note: z.string().max(2000).optional(),
});
export type CreateExpenseInput = z.infer<typeof createExpenseSchema>;

export const updateExpenseSchema = createExpenseSchema.partial();
export type UpdateExpenseInput = z.infer<typeof updateExpenseSchema>;

// ===== Query =====

export const listExpensesQuerySchema = z.object({
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
  categoryId: z.uuid().optional(),
  branchId: z.uuid().optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});
export type ListExpensesQuery = z.infer<typeof listExpensesQuerySchema>;

export const summaryQuerySchema = z.object({
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
  branchId: z.uuid().optional(),
});
export type SummaryQuery = z.infer<typeof summaryQuerySchema>;
