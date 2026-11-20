import type { CashierTransaction } from '@dental/api-client';
import { fireEvent, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderApp } from '../../../test-utils';
import { TransactionsTable } from './TransactionsTable';

const refundMutate = vi.fn();

vi.mock('../cashier.api', () => ({
  useRefund: () => ({ mutate: refundMutate, isPending: false }),
  // Chek serverdan chiziladi (UI-R5): tafsilot so'rovi mock — qatorlar server javobidan.
  useTransactionDetail: () => ({
    data: {
      id: 'tx1',
      fiscalReceiptId: null,
      cardProvider: null,
      visitNoteId: null,
      items: [
        { id: 'i1', serviceName: 'Plomba', quantity: 1, unitPrice: '120000', subtotal: '120000' },
      ],
    },
    isError: false,
  }),
  useCashierTransactionPhoto: (id: string | null) => ({
    data: id ? (photoById[id] ?? null) : undefined,
    isLoading: false,
    isError: false,
  }),
}));

const photoById: Record<string, unknown> = {
  tx1: {
    id: 'ph1',
    transactionId: 'tx1',
    url: '/uploads/tenants%2Ft%2Fcashier-photos%2Ftx1%2Fa.jpg',
    skippedReason: null,
    capturedBy: 'u1',
    capturedAt: '2026-11-20T05:00:00Z',
  },
  tx3: {
    id: 'ph3',
    transactionId: 'tx3',
    url: null,
    skippedReason: 'permission_denied',
    capturedBy: 'u1',
    capturedAt: '2026-11-20T05:00:00Z',
  },
};

// FT-06.3: `cashier.photo.view` alohida boshqariladi (qolgan ruxsatlar — bor).
let canViewPhoto = true;
vi.mock('@/stores/auth-store.ts', () => ({
  useAuthStore: () => ({
    hasPermission: (code: string) => (code === 'cashier.photo.view' ? canViewPhoto : true),
  }),
}));

vi.mock('@/hooks/useAuthedObjectUrl', () => ({
  useAuthedObjectUrl: (url: string | null) => ({
    src: url ? `blob:${url}` : null,
    isLoading: false,
    isError: false,
  }),
}));

function tx(over: Partial<CashierTransaction> = {}): CashierTransaction {
  return {
    id: 'tx1',
    tenantId: 't',
    branchId: 'b1',
    patientId: null,
    treatmentPlanId: null,
    receiptNumber: 'R-001',
    cardProvider: null,
    visitNoteId: null,
    totalAmount: '120000',
    paidAmount: '120000',
    refundedAmount: '0',
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
  beforeEach(() => {
    refundMutate.mockClear();
    canViewPhoto = true;
  });

  it('FT-06.3: cashier.photo.view yo‘q → «Rasm» tugmasi ko‘rinmaydi', () => {
    canViewPhoto = false;
    renderApp(<TransactionsTable transactions={[tx()]} />);
    expect(screen.queryByTestId('photo-view-tx1')).toBeNull();
    expect(screen.queryByLabelText('Rasm')).toBeNull();
  });

  it('FT-06.3: cashier.photo.view bor → rasm authed blob orqali ko‘rinadi', async () => {
    renderApp(<TransactionsTable transactions={[tx()]} />);
    fireEvent.click(screen.getByTestId('photo-view-tx1'));
    const dialog = await screen.findByRole('dialog');
    const img = within(dialog).getByRole('img', { name: "To'lovchi rasmi" }) as HTMLImageElement;
    expect(img.getAttribute('src')).toBe(
      'blob:/uploads/tenants%2Ft%2Fcashier-photos%2Ftx1%2Fa.jpg',
    );
  });

  it('FT-06.3: rasm olinmagan bo‘lsa — sababi; refund qatorida tugma yo‘q', async () => {
    renderApp(
      <TransactionsTable transactions={[tx({ id: 'tx3' }), tx({ id: 'tx4', type: 'refund' })]} />,
    );
    expect(screen.queryByTestId('photo-view-tx4')).toBeNull();
    fireEvent.click(screen.getByTestId('photo-view-tx3'));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByTestId('cashier-photo-skipped').textContent).toContain(
      'kameraga ruxsat berilmadi',
    );
  });

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
    expect(inDialog.getByTestId('receipt-noop-footer').textContent).toContain('Yuborilmagan');
    // Chek qatori serverdan (items), savat snapshot'idan emas.
    expect(inDialog.getByText('Plomba')).toBeTruthy();
    // Walk-in bemor (tarix VM'da ism yo'q → placeholder).
    expect(inDialog.getByText('Bemorsiz (walk-in)')).toBeTruthy();
  });
  it("FX-108: refund dialogi hisob-faktura (500 000) emas, qaytariladigan qoldiqni (paid − refunded) ko'rsatadi", async () => {
    renderApp(
      <TransactionsTable
        transactions={[
          {
            ...tx({ totalAmount: '500000', paidAmount: '200000' }),
            refundedAmount: '0',
          } as CashierTransaction,
        ]}
      />,
    );
    fireEvent.click(screen.getByLabelText("To'lovni qaytarish"));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/200\s?000\s?so'm/)).toBeTruthy();
    expect(within(dialog).queryByText(/500\s?000\s?so'm/)).toBeNull();
  });

  it('FX-108: qisman refunddan keyin qoldiq (100 000 − 50 000) va max shu qoldiq', async () => {
    renderApp(
      <TransactionsTable
        transactions={[
          {
            ...tx({ treatmentPlanId: 'plan1', paidAmount: '100000' }),
            refundedAmount: '50000',
          } as CashierTransaction,
        ]}
      />,
    );
    fireEvent.click(screen.getByLabelText("To'lovni qaytarish"));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/50\s?000\s?so'm/)).toBeTruthy();
    const input = within(dialog).getByRole('textbox') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '80000' } });
    fireEvent.blur(input);
    // max = qoldiq (50 000): 80 000 qisqartiriladi.
    expect(input.value.replace(/\s/g, '')).toBe('50000');
  });

  it("FX-108: to'liq qaytarilgan to'lovda refund tugmasi yo'q", () => {
    renderApp(
      <TransactionsTable
        transactions={[
          {
            ...tx({ treatmentPlanId: 'plan1', paidAmount: '100000' }),
            refundedAmount: '100000',
          } as CashierTransaction,
        ]}
      />,
    );
    expect(screen.queryByLabelText("To'lovni qaytarish")).toBeNull();
  });
});
