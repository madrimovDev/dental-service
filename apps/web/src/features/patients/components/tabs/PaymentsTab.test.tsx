import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderApp } from '../../../../test-utils';
import { PaymentsTab } from './PaymentsTab';

const tx = {
  id: 't1',
  createdAt: '2026-06-11T00:00:00Z',
  receiptNumber: 'R-001',
  paidAmount: '150000',
  currency: 'UZS',
  paymentMethod: 'cash',
  status: 'completed',
  type: 'payment',
};

vi.mock('../../patients.api', () => ({
  usePatientPayments: () => ({ data: { data: [tx] }, isLoading: false }),
  usePatientBalance: () => ({ data: { balance: 50000 } }),
}));

describe('PaymentsTab', () => {
  it('renders txn-row card with balance label, receipt, method and formatted amount', () => {
    renderApp(<PaymentsTab patientId="p1" />);
    // header tab label + balance label
    expect(screen.getByText("To'lovlar")).toBeInTheDocument();
    expect(screen.getByText('Balans')).toBeInTheDocument();
    // txn row: receipt number + currency-suffixed amount (formatNumber, no inline toLocaleString crash)
    expect(screen.getByText('R-001')).toBeInTheDocument();
    expect(screen.getByText(/150\D?000 UZS/)).toBeInTheDocument();
    // method label
    expect(screen.getByText(/Naqd|Наличные|cash/i)).toBeInTheDocument();
  });
});
