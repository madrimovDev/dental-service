import type { Expense, ExpenseCategory } from '@dental/db-schema';
import type { ExpenseCategoryDto, ExpenseDto } from './expenses.schema.ts';

/** DB row → wire DTO. `createdAt` (timestamp) → ISO string. */
export const toExpenseCategoryDto = (row: ExpenseCategory): ExpenseCategoryDto => ({
  id: row.id,
  tenantId: row.tenantId,
  name: row.name,
  nameRu: row.nameRu ?? null,
  createdAt: row.createdAt.toISOString(),
});

/**
 * DB row → wire DTO.
 * - `amount` (numeric) — JS string, passthrough (Number'ga aylantirilmaydi).
 * - `date` (Drizzle `date`, mode'siz) — `'YYYY-MM-DD'` string, passthrough.
 * - `createdAt` (timestamp) — Date → ISO string.
 */
export const toExpenseDto = (row: Expense): ExpenseDto => ({
  id: row.id,
  tenantId: row.tenantId,
  branchId: row.branchId ?? null,
  categoryId: row.categoryId ?? null,
  amount: row.amount,
  date: row.date,
  note: row.note ?? null,
  createdBy: row.createdBy ?? null,
  createdAt: row.createdAt.toISOString(),
});
