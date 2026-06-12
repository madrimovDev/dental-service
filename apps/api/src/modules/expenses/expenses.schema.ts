import { z } from '@hono/zod-openapi';

// ===== Kategoriya (REQUEST — SAQLANADI) =====

export const createCategorySchema = z.object({
  name: z.string().min(1).max(120),
  nameRu: z.string().min(1).max(120).optional(),
});
export type CreateCategoryInput = z.infer<typeof createCategorySchema>;

export const updateCategorySchema = createCategorySchema.partial();
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;

// ===== Xarajat (REQUEST — SAQLANADI) =====

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

// ===== Query (REQUEST — SAQLANADI) =====

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

// ===== Path param =====

export const expenseIdParamSchema = z
  .object({ id: z.uuid() })
  .openapi({ param: { name: 'id', in: 'path' } });

// ===== Response DTO (wire-accurate) =====

/** Expense category — wire shape (createdAt ISO string). */
export const expenseCategoryDtoSchema = z
  .object({
    id: z.uuid(),
    tenantId: z.uuid(),
    name: z.string().openapi({ example: 'Ijara' }),
    nameRu: z.string().nullable().openapi({ example: 'Аренда' }),
    createdAt: z.string().openapi({ example: '2026-06-12T10:00:00.000Z' }),
  })
  .openapi('ExpenseCategory');
export type ExpenseCategoryDto = z.infer<typeof expenseCategoryDtoSchema>;

/** Expense — wire shape. `amount` numeric→string; `date` kalendar kun string; `createdAt` ISO. */
export const expenseDtoSchema = z
  .object({
    id: z.uuid(),
    tenantId: z.uuid(),
    branchId: z.uuid().nullable(),
    categoryId: z.uuid().nullable(),
    amount: z.string().openapi({ example: '150000.00' }),
    date: z.string().openapi({ example: '2026-06-12' }),
    note: z.string().nullable().openapi({ example: null }),
    createdBy: z.uuid().nullable(),
    createdAt: z.string().openapi({ example: '2026-06-12T10:00:00.000Z' }),
  })
  .openapi('Expense');
export type ExpenseDto = z.infer<typeof expenseDtoSchema>;

/** Paginated expense list — `{ data, meta }`. */
export const expenseListResponseSchema = z
  .object({
    data: z.array(expenseDtoSchema),
    meta: z.object({
      page: z.number().int(),
      pageSize: z.number().int(),
      total: z.number().int(),
    }),
  })
  .openapi('ExpenseListResponse');
export type ExpenseListResponseDto = z.infer<typeof expenseListResponseSchema>;

/** Kategoriya bo'yicha svod — `byCategory[]` + `grandTotal`. */
export const expenseSummarySchema = z
  .object({
    byCategory: z.array(
      z.object({
        categoryId: z.uuid().nullable(),
        total: z.string().openapi({ example: '450000' }),
        count: z.number().int(),
      }),
    ),
    grandTotal: z.number().openapi({ example: 450000 }),
  })
  .openapi('ExpenseSummary');
export type ExpenseSummaryDto = z.infer<typeof expenseSummarySchema>;

/** DELETE response DTO. */
export const expenseDeleteResultSchema = z
  .object({ deleted: z.literal(true) })
  .openapi('ExpenseDeleteResult');
