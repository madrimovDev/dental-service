import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderApp } from '../../../test-utils';
import type { TransactionVM } from '../cashier.types';
import { ReceiptModal } from './ReceiptModal';

// FT-04: chek serverdagi chegirma snapshot'idan (foiz + sabab) chiziladi.
const detail = {
  id: 'tx1',
  fiscalReceiptId: null,
  cardProvider: null,
  discount: '25000',
  discountPercent: '12.50',
  discountReason: 'Doimiy mijoz',
  items: [
    { id: 'i1', serviceName: 'Plomba', quantity: 1, unitPrice: '200000', subtotal: '200000' },
  ],
};

vi.mock('../cashier.api', () => ({
  useTransactionDetail: () => ({ data: detail, isError: false }),
}));

const vm: TransactionVM = {
  id: 'tx1',
  receiptNumber: 'R-1',
  totalAmount: 175000,
  paidAmount: 175000,
  refundedAmount: 0,
  refundableAmount: 175000,
  discount: 25000,
  paymentMethod: 'cash',
  cardProvider: null,
  type: 'payment',
  status: 'completed',
  createdAt: '2026-11-20T10:00:00Z',
  refundable: true,
  fiscalSent: false,
  planLinked: false,
};

describe('ReceiptModal — FT-04 chegirma qatori', () => {
  it('«Chegirma (12,5%)» — server foizi (yaxlitlanmagan), summa va sabab', async () => {
    renderApp(<ReceiptModal opened onClose={() => {}} transaction={vm} />);

    expect(await screen.findByText('Chegirma (12,5%)')).toBeTruthy();
    expect(screen.getByText("−25 000 so'm")).toBeTruthy();
    expect(screen.getByText('Doimiy mijoz')).toBeTruthy();
  });

  it('chegirmasiz chekda chegirma qatori yo‘q', async () => {
    renderApp(
      <ReceiptModal
        opened
        onClose={() => {}}
        transaction={{ ...vm, discount: 0, totalAmount: 200000 }}
      />,
    );
    await screen.findByText('Plomba');
    expect(screen.queryByText(/Chegirma \(/)).toBeNull();
  });
});
