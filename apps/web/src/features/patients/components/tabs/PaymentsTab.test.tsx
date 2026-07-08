import { fireEvent, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
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

const refetchMock = vi.fn();
const dataResult = { data: { data: [tx] }, isLoading: false, isError: false, refetch: refetchMock };
// biome-ignore lint/suspicious/noExplicitAny: test-only mutable mock result
let paymentsResult: any = dataResult;

vi.mock('../../patients.api', () => ({
  usePatientPayments: () => paymentsResult,
  usePatientBalance: () => ({ data: { balance: 50000 } }),
}));

describe('PaymentsTab', () => {
  beforeEach(() => {
    paymentsResult = dataResult;
    refetchMock.mockClear();
  });

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

  // CLI-456: avval faqat isLoading tekshirilardi — xato ("query.data" undefined)
  // "bo'sh ro'yxat" bilan bir xil render bo'lardi. Endi alohida error StateView + retry.
  it('isError holatida error StateView ko’rsatadi va retry refetch chaqiradi', () => {
    paymentsResult = { data: undefined, isLoading: false, isError: true, refetch: refetchMock };
    renderApp(<PaymentsTab patientId="p1" />);
    expect(document.querySelector('[data-state="error"]')).not.toBeNull();
    // "bo'sh" xabari yoki jadval qatori ko'rinmasligi kerak — error boshqa holat bilan aralashmaydi.
    expect(screen.queryByText('R-001')).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('Qayta urinish'));
    expect(refetchMock).toHaveBeenCalled();
  });

  it('isLoading holatida loading skeleton ko’rsatadi', () => {
    paymentsResult = { data: undefined, isLoading: true, isError: false, refetch: refetchMock };
    renderApp(<PaymentsTab patientId="p1" />);
    expect(document.querySelector('[aria-busy="true"]')).not.toBeNull();
  });
});
