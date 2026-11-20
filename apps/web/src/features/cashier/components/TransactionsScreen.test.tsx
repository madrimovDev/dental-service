import type { CashierTransaction } from '@dental/api-client';
import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderApp } from '../../../test-utils';
import { TransactionsScreen } from './TransactionsScreen';

const base = {
  tenantId: 't',
  branchId: 'b',
  treatmentPlanId: null,
  receiptNumber: null,
  totalAmount: '1000',
  paidAmount: '1000',
  paymentMethod: 'cash',
  type: 'payment',
  createdAt: '2026-11-20T05:00:00Z',
} as unknown as CashierTransaction;

const rows = [
  { ...base, id: 'a', patientId: 'p1', patientName: 'Ali Valiyev', photoStatus: 'photo' },
  { ...base, id: 'b', patientId: 'p2', patientName: null, photoStatus: null },
];

vi.mock('../cashier.api', () => ({
  useAllTransactions: () => ({ data: { data: rows }, isLoading: false, isError: false }),
  useCashierTransactionPhoto: () => ({ data: undefined, isLoading: false, isError: false }),
}));
vi.mock('@/stores/auth-store.ts', () => ({ useAuthStore: () => ({ hasPermission: () => true }) }));

describe('TransactionsScreen', () => {
  it('Bemor ustunida ism ko‘rsatiladi; «Rasm» tugmasi faqat photoStatus bor qatorda', () => {
    renderApp(<TransactionsScreen />);
    expect(screen.getByText('Ali Valiyev')).toBeTruthy();
    expect(screen.getByTestId('photo-view-a')).toBeTruthy();
    expect(screen.queryByTestId('photo-view-b')).toBeNull();
  });
});
