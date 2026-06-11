import type { Expense, ExpenseCategory, ExpenseSummary } from '@dental/api-client';
import type { ExpenseVM, SummaryRowVM } from './expenses.types';

/**
 * Kategoriya id → nom lug'ati (lokalga qarab: ru bo'lsa nameRu, fallback name).
 * Summary'da nom yo'q — shu lug'at orqali join qilinadi.
 */
export function buildCategoryNameMap(
  categories: ExpenseCategory[],
  locale: 'uz' | 'ru',
): Map<string, string> {
  const map = new Map<string, string>();
  for (const c of categories) {
    const name = locale === 'ru' && c.nameRu ? c.nameRu : c.name;
    map.set(c.id, name);
  }
  return map;
}

/**
 * Kategoriya nomini topadi. `categoryId === null` yoki lug'atda yo'q →
 * `uncategorizedLabel` (i18n'dan, masalan "Kategoriyasiz").
 */
function resolveCategoryName(
  categoryId: string | null,
  nameMap: Map<string, string>,
  uncategorizedLabel: string,
): string {
  if (categoryId === null) return uncategorizedLabel;
  return nameMap.get(categoryId) ?? uncategorizedLabel;
}

/** Xarajat DB row → VM (string pul → number, kategoriya nomi join). */
export function toExpenseVM(
  expense: Expense,
  nameMap: Map<string, string>,
  uncategorizedLabel: string,
): ExpenseVM {
  return {
    id: expense.id,
    amount: Number(expense.amount),
    date: expense.date,
    note: expense.note,
    categoryId: expense.categoryId,
    categoryName: resolveCategoryName(expense.categoryId, nameMap, uncategorizedLabel),
    branchId: expense.branchId,
    createdAt: expense.createdAt,
  };
}

export function toExpenseVMs(
  expenses: Expense[],
  nameMap: Map<string, string>,
  uncategorizedLabel: string,
): ExpenseVM[] {
  return expenses.map((e) => toExpenseVM(e, nameMap, uncategorizedLabel));
}

/**
 * Svod byCategory satrlarini nom bilan boyitadi (string total → number).
 * `categoryId === null` (kategoriyasiz xarajatlar) → uncategorizedLabel.
 * Total bo'yicha kamayuvchi tartibda saralanadi.
 */
export function toSummaryRows(
  summary: ExpenseSummary,
  nameMap: Map<string, string>,
  uncategorizedLabel: string,
): SummaryRowVM[] {
  return summary.byCategory
    .map(
      (row): SummaryRowVM => ({
        categoryId: row.categoryId,
        categoryName: resolveCategoryName(row.categoryId, nameMap, uncategorizedLabel),
        total: Number(row.total),
        count: row.count,
      }),
    )
    .sort((a, b) => b.total - a.total);
}
