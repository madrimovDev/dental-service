import {
  createExpense,
  createExpenseCategory,
  deleteExpense,
  deleteExpenseCategory,
  expenseSummary,
  listBranches,
  listExpenseCategories,
  listExpenses,
  updateExpense,
  updateExpenseCategory,
} from '@dental/api-client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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
    queryFn: () => listExpenses(params).then((r) => r.data),
  });
}

export function useExpenseCategories() {
  return useQuery({
    queryKey: expensesKeys.categories(),
    queryFn: () => listExpenseCategories().then((r) => r.data),
  });
}

export function useExpenseSummary(range: DateRange & { branchId?: string }) {
  return useQuery({
    queryKey: expensesKeys.summary(range),
    queryFn: () => expenseSummary(range).then((r) => r.data),
    enabled: !!range.from && !!range.to,
  });
}

export function useBranches() {
  return useQuery({ queryKey: ['branches'], queryFn: () => listBranches().then((r) => r.data) });
}

export function useCreateExpense() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Parameters<typeof createExpense>[0]) =>
      createExpense(body).then((r) => r.data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: expensesKeys.all });
    },
  });
}

export function useUpdateExpense() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: Parameters<typeof updateExpense>[1] }) =>
      updateExpense(id, body).then((r) => r.data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: expensesKeys.all });
    },
  });
}

export function useDeleteExpense() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteExpense(id).then((r) => r.data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: expensesKeys.all });
    },
  });
}

export function useCreateCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Parameters<typeof createExpenseCategory>[0]) =>
      createExpenseCategory(body).then((r) => r.data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: expensesKeys.all });
    },
  });
}

export function useUpdateCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: Parameters<typeof updateExpenseCategory>[1] }) =>
      updateExpenseCategory(id, body).then((r) => r.data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: expensesKeys.all });
    },
  });
}

export function useDeleteCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteExpenseCategory(id).then((r) => r.data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: expensesKeys.all });
    },
  });
}
