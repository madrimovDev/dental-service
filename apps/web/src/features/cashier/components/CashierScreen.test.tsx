import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderApp } from '../../../test-utils';
import { CashierScreen } from './CashierScreen';

vi.mock('../cashier.api', () => ({
  useBranches: () => ({ data: [{ id: 'b1', name: 'Markaziy' }] }),
  useServices: () => ({ data: [] }),
  usePatientsAll: () => ({ data: { data: [{ id: 'p1', fullName: 'Ali Valiyev' }] } }),
  useTodayTransactions: () => ({ data: { data: [], meta: { page: 1, pageSize: 100, total: 0 } } }),
  useDailySummary: () => ({ data: null }),
  useCreateTransaction: () => ({ mutate: vi.fn(), isPending: false }),
  usePatientPlans: () => ({ data: [] }),
  usePlanBalance: () => ({ data: null }),
  useRefund: () => ({ mutate: vi.fn(), isPending: false }),
  fetchServicePrices: vi.fn(),
}));

vi.mock('@/stores/auth-store.ts', () => ({
  useAuthStore: () => ({ hasPermission: () => true, activeBranchId: 'b1' }),
}));

describe('CashierScreen', () => {
  it('sarlavha + rejim segmenti (erkin/plan) render', () => {
    renderApp(<CashierScreen />);
    expect(screen.getByText('Kassa')).toBeTruthy();
    // SegmentedControl rejimlari.
    expect(screen.getByText("Erkin to'lov")).toBeTruthy();
    expect(screen.getByText('Davolash rejasi')).toBeTruthy();
  });
});
