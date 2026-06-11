import type { CashierTransaction } from '@dental/api-client';
import { fireEvent, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderApp } from '../../../test-utils';
import { TransactionsTable } from './TransactionsTable';

const refundMutate = vi.fn();

vi.mock('../cashier.api', () => ({
  useRefund: () => ({ mutate: refundMutate, isPending: false }),
}));

vi.mock('@/stores/auth-store.ts', () => ({
  useAuthStore: () => ({ hasPermission: () => true }),
}));

function tx(over: Partial<CashierTransaction> = {}): CashierTransaction {
  return {
    id: 'tx1',
    tenantId: 't',
    branchId: 'b1',
    patientId: null,
    treatmentPlanId: null,
    receiptNumber: 'R-001',
    totalAmount: '120000',
    paidAmount: '120000',
    discount: '0',
    currency: 'UZS',
    paymentMethod: 'cash',
    type: 'payment',
    parentTransactionId: null,
    status: 'completed',
    notes: null,
    fiscalProvider: 'noop',
    fiscalReceiptId: null,
    createdAt: '2026-06-11T05:00:00Z',
    updatedAt: '2026-06-11T05:00:00Z',
    ...over,
  };
}

describe('TransactionsTable', () => {
  beforeEach(() => refundMutate.mockClear());

  it('refund modal: tasdiqlash → useRefund.mutate(tx.id)', async () => {
    renderApp(<TransactionsTable transactions={[tx()]} />);

    // Refund tugmasi (completed + payment) bosiladi → modal ochiladi.
    fireEvent.click(screen.getByLabelText("To'lovni qaytarish"));
    // Modaldagi tasdiqlash tugmasi (transition tugashini kutamiz).
    fireEvent.click(await screen.findByRole('button', { name: 'Qaytarish' }));

    expect(refundMutate).toHaveBeenCalledWith('tx1');
  });

  it("refund tugmasi faqat completed+payment uchun ko'rinadi", () => {
    renderApp(<TransactionsTable transactions={[tx({ id: 'tx2', type: 'refund' })]} />);
    expect(screen.queryByLabelText("To'lovni qaytarish")).toBeNull();
  });

  it('badge: voided payment → status (Bekor qilingan), refund → tur (Qaytarish)', () => {
    renderApp(
      <TransactionsTable
        transactions={[
          tx({ id: 'tx-voided', status: 'voided', type: 'payment' }),
          tx({ id: 'tx-refund', type: 'refund' }),
        ]}
      />,
    );
    expect(screen.getByText('Bekor qilingan')).toBeTruthy();
    expect(screen.getByText('Qaytarish')).toBeTruthy();
  });
});
