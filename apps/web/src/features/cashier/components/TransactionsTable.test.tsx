import type { CashierTransaction } from '@dental/api-client';
import { fireEvent, screen, within } from '@testing-library/react';
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

    expect(refundMutate).toHaveBeenCalledWith({ id: 'tx1', amount: undefined });
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

  it("chek ko'rish tugmasi → ReceiptModal ochiladi (chek raqami + JAMI + NoOp footer)", async () => {
    renderApp(
      <TransactionsTable transactions={[tx({ receiptNumber: 'R-007', totalAmount: '120000' })]} />,
    );

    // Chek-ko'rish tugmasi bosiladi → modal dialog ochiladi.
    fireEvent.click(screen.getByTestId('receipt-view-tx1'));
    const dialog = await screen.findByRole('dialog');
    const inDialog = within(dialog);

    // Chek raqami header'da.
    expect(inDialog.getByText(/R-007/)).toBeTruthy();
    // JAMI summasi formatCurrency orqali (t('common.currency') = "so'm").
    // Subtotal == total (chegirmasiz) → bir nechta marta, getAllByText.
    expect(inDialog.getAllByText(/120\s?000\s?so'm/).length).toBeGreaterThan(0);
    // NoOp fiskal footer mavjud (matn Task F i18n'dan keladi — strukturaviy tekshiruv,
    // testid orqali — i18n landing'idan mustaqil yashil qoladi).
    expect(inDialog.getByTestId('receipt-noop-footer')).toBeTruthy();
    // Walk-in bemor (tarix VM'da ism yo'q → placeholder).
    expect(inDialog.getByText('Bemorsiz (walk-in)')).toBeTruthy();
  });
});
