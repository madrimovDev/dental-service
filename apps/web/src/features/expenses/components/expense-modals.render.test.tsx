import type { Branch, ExpenseCategory } from '@dental/api-client';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderApp } from '@/test-utils';
import { CategoryManagerModal } from './CategoryManagerModal';
import { ExpenseFormModal } from './ExpenseFormModal';

// Mutation hook'larni mock qilamiz: real network'siz `mutate` spy + `isPending=false`.
// Maqsad — DS8-T5 re-skin'ning HARD INVARIANTLARINI (forma + zod4Resolver xulqi) lock qilish.
const createExpenseMutate = vi.fn();
const createCategoryMutate = vi.fn();
const deleteCategoryMutate = vi.fn();

vi.mock('../expenses.api', () => ({
  useCreateExpense: () => ({ mutate: createExpenseMutate, isPending: false }),
  useCreateCategory: () => ({ mutate: createCategoryMutate, isPending: false }),
  useDeleteCategory: () => ({ mutate: deleteCategoryMutate, isPending: false }),
}));

const categories: ExpenseCategory[] = [
  { id: 'cat-1', name: 'Ijara', nameRu: 'Аренда' } as ExpenseCategory,
];
const branches: Branch[] = [{ id: 'br-1', name: 'Markaz' } as Branch];

beforeEach(() => {
  createExpenseMutate.mockReset();
  createCategoryMutate.mockReset();
  deleteCategoryMutate.mockReset();
});

describe('ExpenseFormModal (DS8-T5 re-skin characterization)', () => {
  it('renders form fields with required asterisks', () => {
    renderApp(
      <ExpenseFormModal opened onClose={() => {}} categories={categories} branches={branches} />,
    );
    // amount + date `withAsterisk` (HARD INVARIANT) → Mantine required-mark
    // (`<span aria-hidden> *</span>`) har bir withAsterisk maydon uchun render bo'ladi.
    const requiredMarks = Array.from(document.querySelectorAll('span[aria-hidden="true"]')).filter(
      (el) => el.textContent === ' *',
    );
    expect(requiredMarks.length).toBeGreaterThanOrEqual(2);
  });

  it('blocks submit when amount is invalid (zod4Resolver INVARIANT)', async () => {
    renderApp(
      <ExpenseFormModal opened onClose={() => {}} categories={categories} branches={branches} />,
    );
    // Default amount=0 → expenseFormSchema.amount.positive() FAIL → mutate chaqirilmaydi.
    const form = document.querySelector('form') as HTMLFormElement;
    fireEvent.submit(form);
    await waitFor(() => {
      expect(createExpenseMutate).not.toHaveBeenCalled();
    });
  });
});

describe('CategoryManagerModal (DS8-T5 re-skin characterization)', () => {
  it('renders category rows with a token-remapped delete action', () => {
    renderApp(<CategoryManagerModal opened onClose={() => {}} categories={categories} />);
    expect(screen.getByText('Ijara')).toBeInTheDocument();
    // O'chirish ActionIcon (color="red" = DS0 token) aria-label bilan ko'rinadi.
    expect(screen.getAllByLabelText("O'chirish").length).toBeGreaterThanOrEqual(1);
  });

  it('blocks create when name is empty (zod4Resolver INVARIANT)', async () => {
    renderApp(<CategoryManagerModal opened onClose={() => {}} categories={categories} />);
    // Bo'sh name → categoryFormSchema.name.min(1) FAIL → mutate chaqirilmaydi.
    const form = document.querySelector('form') as HTMLFormElement;
    fireEvent.submit(form);
    await waitFor(() => {
      expect(createCategoryMutate).not.toHaveBeenCalled();
    });
  });
});
