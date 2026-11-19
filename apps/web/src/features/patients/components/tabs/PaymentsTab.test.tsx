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
  treatmentPlanId: 'plan1',
};
const refundTx = {
  ...tx,
  id: 't2',
  receiptNumber: 'R-002',
  paidAmount: '40000',
  type: 'refund',
  status: 'completed',
  treatmentPlanId: null,
};

const refetchMock = vi.fn();
const dataResult = { data: { data: [tx] }, isLoading: false, isError: false, refetch: refetchMock };
// biome-ignore lint/suspicious/noExplicitAny: test-only mutable mock result
let paymentsResult: any = dataResult;

vi.mock('../../patients.api', () => ({
  usePatientPayments: () => paymentsResult,
  usePatientBalance: () => ({ data: { balance: 50000, planDebt: 80000, nonPlanBalance: -30000 } }),
  usePatientPlanTitles: () => ({
    data: [{ id: 'plan1', title: 'Kompleks davolash', status: 'accepted' }],
  }),
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
    expect(screen.getByText('Umumiy balans')).toBeInTheDocument();
    // txn row: receipt number + currency-suffixed amount (formatNumber, no inline toLocaleString crash)
    expect(screen.getByText('R-001')).toBeInTheDocument();
    expect(screen.getByText(/150\D?000 UZS/)).toBeInTheDocument();
    // method label
    expect(screen.getByText(/Naqd|Наличные|cash/i)).toBeInTheDocument();
  });

  // FX-30 (CF-13): sarlavha balansi = reja qarzi + plansiz qoldiq — alohida kartalar.
  it('balans yig‘indisini reja qarzi / plansiz qoldiq kartalariga ajratadi', () => {
    renderApp(<PaymentsTab patientId="p1" />);
    const plan = screen.getByTestId('finance-plan-debt');
    const nonPlan = screen.getByTestId('finance-non-plan');
    const total = screen.getByTestId('finance-total');
    expect(plan.textContent).toMatch(/80\D?000/);
    expect(plan.textContent).toMatch(/qarz/);
    expect(nonPlan.textContent).toMatch(/30\D?000/);
    expect(nonPlan.textContent).toMatch(/kredit/);
    expect(total.textContent).toMatch(/50\D?000/);
  });

  // FX-30: refund TURI va STATUS alohida; to'lovda reja nomi.
  it('refund qatorida tur (Qaytarish) va status (Bajarilgan) alohida, reja nomi ko‘rinadi', () => {
    paymentsResult = {
      ...dataResult,
      data: { data: [tx, refundTx], meta: { page: 1, pageSize: 50, total: 2 } },
    };
    renderApp(<PaymentsTab patientId="p1" />);
    expect(screen.getByText('Qaytarish')).toBeInTheDocument();
    expect(screen.getAllByText('Bajarilgan').length).toBe(2);
    expect(screen.getByText('Kompleks davolash')).toBeInTheDocument();
    expect(screen.queryByText('completed')).not.toBeInTheDocument();
  });

  // FX-30: pageSize=50 dan ortiq bo'lsa paginatsiya.
  it('jami > pageSize bo‘lsa sahifalash ko‘rsatadi', () => {
    paymentsResult = {
      ...dataResult,
      data: { data: [tx], meta: { page: 1, pageSize: 50, total: 120 } },
    };
    renderApp(<PaymentsTab patientId="p1" />);
    expect(document.querySelector('.mantine-Pagination-root')).not.toBeNull();
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
