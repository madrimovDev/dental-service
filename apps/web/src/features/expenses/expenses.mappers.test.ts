import type { Expense, ExpenseCategory, ExpenseSummary } from '@dental/api-client';
import { describe, expect, it } from 'vitest';
import { buildCategoryNameMap, toExpenseVM, toSummaryRows } from './expenses.mappers';

const UNCAT = 'Kategoriyasiz';

function cat(over: Partial<ExpenseCategory> = {}): ExpenseCategory {
  return {
    id: 'c1',
    tenantId: 't',
    name: 'Ijara',
    nameRu: 'Аренда',
    createdAt: '2026-06-01T00:00:00Z',
    ...over,
  };
}

function expense(over: Partial<Expense> = {}): Expense {
  return {
    id: 'e1',
    tenantId: 't',
    branchId: 'b1',
    categoryId: 'c1',
    amount: '150000',
    date: '2026-06-10',
    note: null,
    createdBy: null,
    createdAt: '2026-06-10T05:00:00Z',
    ...over,
  };
}

describe('buildCategoryNameMap', () => {
  it('uz lokal → name', () => {
    const map = buildCategoryNameMap([cat()], 'uz');
    expect(map.get('c1')).toBe('Ijara');
  });

  it('ru lokal → nameRu', () => {
    const map = buildCategoryNameMap([cat()], 'ru');
    expect(map.get('c1')).toBe('Аренда');
  });

  it('ru lokal lekin nameRu null → name fallback', () => {
    const map = buildCategoryNameMap([cat({ nameRu: null })], 'ru');
    expect(map.get('c1')).toBe('Ijara');
  });
});

describe('toExpenseVM', () => {
  it('string amount → number, kategoriya nomi join', () => {
    const map = buildCategoryNameMap([cat()], 'uz');
    const vm = toExpenseVM(expense({ amount: '250000' }), map, UNCAT);
    expect(vm.amount).toBe(250000);
    expect(vm.categoryName).toBe('Ijara');
  });

  it('categoryId === null → uncategorized label', () => {
    const map = buildCategoryNameMap([cat()], 'uz');
    const vm = toExpenseVM(expense({ categoryId: null }), map, UNCAT);
    expect(vm.categoryName).toBe(UNCAT);
    expect(vm.categoryId).toBeNull();
  });

  it("lug'atda yo'q kategoriya id → uncategorized label", () => {
    const map = buildCategoryNameMap([cat()], 'uz');
    const vm = toExpenseVM(expense({ categoryId: 'missing' }), map, UNCAT);
    expect(vm.categoryName).toBe(UNCAT);
  });
});

describe('toSummaryRows', () => {
  const summary: ExpenseSummary = {
    byCategory: [
      { categoryId: 'c1', total: '150000', count: 2 },
      { categoryId: null, total: '500000', count: 1 },
      { categoryId: 'c2', total: '300000', count: 3 },
    ],
    grandTotal: 950000,
  };

  it("nom join + string total → number + total bo'yicha kamayuvchi", () => {
    const map = buildCategoryNameMap(
      [cat({ id: 'c1', name: 'Ijara' }), cat({ id: 'c2', name: 'Maosh' })],
      'uz',
    );
    const rows = toSummaryRows(summary, map, UNCAT);
    expect(rows.map((r) => r.total)).toEqual([500000, 300000, 150000]);
    expect(rows.map((r) => r.categoryName)).toEqual([UNCAT, 'Maosh', 'Ijara']);
    expect(rows.map((r) => r.categoryId)).toEqual([null, 'c2', 'c1']);
    expect(rows.map((r) => r.count)).toEqual([1, 3, 2]);
  });

  it("bo'sh byCategory → bo'sh massiv", () => {
    const rows = toSummaryRows({ byCategory: [], grandTotal: 0 }, new Map(), UNCAT);
    expect(rows).toEqual([]);
  });
});
