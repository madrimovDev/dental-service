import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api.ts';
import { expensesKeys } from './expenses.keys';
import type { DateRange } from './expenses.types';

export type ListExpensesParams = {
  from?: string;
  to?: string;
  categoryId?: string;
  branchId?: string;
  page?: number;
  pageSize?: number;
};

export function useExpenses(params: ListExpensesParams) {
  return useQuery({
    queryKey: expensesKeys.list(params),
    queryFn: () => api.expenses.list(params),
  });
}

export function useExpenseCategories() {
  return useQuery({
    queryKey: expensesKeys.categories(),
    queryFn: () => api.expenses.categories(),
  });
}

export function useExpenseSummary(range: DateRange & { branchId?: string }) {
  return useQuery({
    queryKey: expensesKeys.summary(range),
    queryFn: () => api.expenses.summary(range),
    enabled: !!range.from && !!range.to,
  });
}

export function useBranches() {
  return useQuery({ queryKey: ['branches'], queryFn: api.branches.list });
}

export function useCreateExpense() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Parameters<typeof api.expenses.create>[0]) => api.expenses.create(body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: expensesKeys.all });
    },
  });
}

export function useUpdateExpense() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: Parameters<typeof api.expenses.update>[1] }) =>
      api.expenses.update(id, body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: expensesKeys.all });
    },
  });
}

export function useDeleteExpense() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.expenses.remove(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: expensesKeys.all });
    },
  });
}

export function useCreateCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Parameters<typeof api.expenses.createCategory>[0]) =>
      api.expenses.createCategory(body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: expensesKeys.all });
    },
  });
}

export function useUpdateCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      body,
    }: {
      id: string;
      body: Parameters<typeof api.expenses.updateCategory>[1];
    }) => api.expenses.updateCategory(id, body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: expensesKeys.all });
    },
  });
}

export function useDeleteCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.expenses.removeCategory(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: expensesKeys.all });
    },
  });
}
