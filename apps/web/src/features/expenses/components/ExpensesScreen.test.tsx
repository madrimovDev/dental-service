import type { ExpenseSummary } from '@dental/api-client';
import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderApp } from '../../../test-utils';
import { ExpensesScreen } from './ExpensesScreen';

// Owner/superuser — barcha permission bor (KPI + jadval ko'rinadi).
vi.mock('@/stores/auth-store.ts', () => ({
  useAuthStore: () => ({ hasPermission: () => true }),
}));

const summary: ExpenseSummary = {
  byCategory: [
    { categoryId: 'c1', total: '150000', count: 2 },
    { categoryId: 'c2', total: '300000', count: 3 },
  ],
  grandTotal: 450000,
};

const expensesResponse = {
  data: [
    {
      id: 'e1',
      tenantId: 't',
      branchId: 'b1',
      categoryId: 'c1',
      amount: '150000',
      date: '2026-06-10',
      note: null,
      createdBy: null,
      createdAt: '2026-06-10T05:00:00Z',
    },
  ],
  meta: { page: 1, pageSize: 200, total: 1 },
};

vi.mock('../expenses.api', () => ({
  useExpenseCategories: () => ({
    data: [
      {
        id: 'c1',
        tenantId: 't',
        name: 'Ijara',
        nameRu: 'Аренда',
        createdAt: '2026-06-01T00:00:00Z',
      },
      {
        id: 'c2',
        tenantId: 't',
        name: 'Maosh',
        nameRu: 'Зарплата',
        createdAt: '2026-06-01T00:00:00Z',
      },
    ],
  }),
  useBranches: () => ({ data: [{ id: 'b1', name: 'Markaz' }] }),
  useExpenses: () => ({
    data: expensesResponse,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
  useExpenseSummary: () => ({ data: summary }),
  useDeleteExpense: () => ({ mutate: vi.fn(), isPending: false }),
  useCreateExpense: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
  useUpdateExpense: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
  useCreateCategory: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
  useUpdateCategory: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
  useDeleteCategory: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
}));

describe('ExpensesScreen — 3 KPI', () => {
  it('grand total / record count / category count KPI larini ko’rsatadi', () => {
    renderApp(<ExpensesScreen />);
    // "Umumiy jami" (grand_total) KPI label + jadval qatorida = kamida 1 match
    expect(screen.getAllByText('Umumiy jami').length).toBeGreaterThan(0);
    // record count KPI = Σ byCategory.count = 2 + 3 = 5 (jadvalda 5 yo'q → yagona)
    expect(screen.getByText('5')).toBeInTheDocument();
    // KPI labellari (count + categories) ko'rinadi (jadval thead'da ham bo'lishi mumkin)
    expect(screen.getAllByText('Soni').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Kategoriyalar').length).toBeGreaterThan(0);
  });

  it('delta pill render qilmaydi (data-gap — trend yo’q)', () => {
    const { container } = renderApp(<ExpensesScreen />);
    // StatCard delta span faqat delta prop berilganda chiqadi; biz bermaymiz.
    expect(container.querySelector('[data-delta]')).toBeNull();
  });
});
