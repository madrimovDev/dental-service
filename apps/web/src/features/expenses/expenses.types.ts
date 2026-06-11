import type { Expense } from '@dental/api-client';

/** Xarajat ro'yxat satri view-model'i (string pul → number, kategoriya nomi join'langan). */
export type ExpenseVM = {
  id: string;
  amount: number;
  date: string;
  note: string | null;
  categoryId: string | null;
  categoryName: string;
  branchId: string | null;
  createdAt: string;
};

/** Svod kategoriya breakdown satri (nom join'langan, string pul → number). */
export type SummaryRowVM = {
  categoryId: string | null;
  categoryName: string;
  total: number;
  count: number;
};

/** Davr filtri (oylik svod va ro'yxat uchun). */
export type DateRange = {
  from: string;
  to: string;
};

export type { Expense };
