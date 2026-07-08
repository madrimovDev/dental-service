import { fireEvent, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderApp } from '../../../../test-utils';
import { RecallTab } from './RecallTab';

const createMutate = vi.fn();
const refetchMock = vi.fn();
const recall = {
  id: 'r1',
  patientId: 'p1',
  reason: 'manual' as const,
  dueDate: '2026-08-01',
  intervalMonths: null,
  notes: null,
  status: 'pending' as const,
};

const dataResult = { data: [recall], isLoading: false, isError: false, refetch: refetchMock };
// biome-ignore lint/suspicious/noExplicitAny: test-only mutable mock result
let recallsResult: any = dataResult;

vi.mock('@/features/recalls/recalls.api.ts', () => ({
  usePatientRecalls: () => recallsResult,
  useCreateRecall: () => ({ mutate: createMutate, isPending: false }),
}));

vi.mock('@/stores/auth-store.ts', () => ({
  useAuthStore: () => ({ hasPermission: () => true }),
}));

describe('RecallTab (CLI-467 StateView)', () => {
  beforeEach(() => {
    recallsResult = dataResult;
    createMutate.mockClear();
    refetchMock.mockClear();
  });

  it('isLoading holatida loading skeleton ko‘rsatadi', () => {
    recallsResult = { data: undefined, isLoading: true, isError: false, refetch: refetchMock };
    renderApp(<RecallTab patientId="p1" />);
    expect(document.querySelector('[aria-busy="true"]')).not.toBeNull();
  });

  // CLI-467: avval xato ham "bo'sh" (ro'yxat = []) sifatida ko'rsatilardi.
  it('isError holatida error StateView ko‘rsatadi va retry refetch chaqiradi', () => {
    recallsResult = { data: undefined, isLoading: false, isError: true, refetch: refetchMock };
    renderApp(<RecallTab patientId="p1" />);
    expect(document.querySelector('[data-state="error"]')).not.toBeNull();
    fireEvent.click(screen.getByText('Qayta urinish'));
    expect(refetchMock).toHaveBeenCalled();
  });

  it("bo'sh ro'yxatda bo'sh holat matnini ko'rsatadi", () => {
    recallsResult = { data: [], isLoading: false, isError: false, refetch: refetchMock };
    renderApp(<RecallTab patientId="p1" />);
    expect(screen.getByText("Bemorda qayta chaqirish yo'q")).toBeInTheDocument();
  });

  it('recall qatorlarini ko‘rsatadi', () => {
    renderApp(<RecallTab patientId="p1" />);
    expect(screen.getByText('2026-08-01')).toBeInTheDocument();
  });
});
