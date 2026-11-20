/**
 * FT-06.3 (D-4): to'lovdan keyingi kassa rasmi qadami (PosPanel → CashierPhotoStep → real
 * `CameraCapture`). To'lov mutatsiyasi mock; rasm yuborish (`useUploadCashierPhoto`) spy.
 */
import type { CashierTransaction } from '@dental/api-client';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderApp } from '../../../test-utils';
import { PosPanel } from './PosPanel';

const createMutate = vi.fn();
const uploadMutate = vi.fn();
let photoEnabled = false;

vi.mock('../cashier.api', () => ({
  useServices: () => ({
    data: [{ id: 's1', code: 'PL-001', nameUz: 'Plomba', nameRu: 'Пломба', isActive: true }],
  }),
  useCreateTransaction: () => ({ mutate: createMutate, isPending: false }),
  useCashierPhotoSettings: () => ({ data: { enabled: photoEnabled } }),
  useUploadCashierPhoto: () => ({ mutate: uploadMutate, isPending: false }),
  fetchServicePrices: vi.fn(async () => ({
    id: 's1',
    prices: [
      {
        id: 'pr1',
        serviceId: 's1',
        branchId: 'b1',
        price: '50000',
        currency: 'UZS',
        validFrom: '2026-01-01T00:00:00Z',
        validTo: null,
        createdAt: '2026-01-01T00:00:00Z',
      },
    ],
  })),
}));

vi.mock('./ReceiptModal', () => ({
  ReceiptModal: () => <div data-testid="receipt-modal" />,
}));

const paidTx: CashierTransaction = {
  id: 'tx-paid',
  tenantId: 't',
  branchId: 'b1',
  patientId: 'pat1',
  treatmentPlanId: null,
  receiptNumber: 'R-001',
  cardProvider: null,
  visitNoteId: null,
  totalAmount: '50000',
  paidAmount: '50000',
  refundedAmount: '0',
  discount: '0',
  discountPercent: null,
  discountReason: null,
  discountGrantedBy: null,
  currency: 'UZS',
  paymentMethod: 'cash',
  type: 'payment',
  parentTransactionId: null,
  status: 'completed',
  notes: null,
  fiscalProvider: 'noop',
  fiscalReceiptId: null,
  createdAt: '2026-11-20T05:00:00Z',
  updatedAt: '2026-11-20T05:00:00Z',
};

/** To'lovni qabul qiladi va serverning muvaffaqiyatli javobini simulyatsiya qiladi. */
async function pay() {
  renderApp(<PosPanel branchId="b1" patientId="pat1" patientName="Ali" />);
  fireEvent.click(await screen.findByText('Plomba'));
  await screen.findByDisplayValue("50 000 so'm");
  fireEvent.click(screen.getByText("To'lovni qabul qilish"));
  const opts = createMutate.mock.calls[0]?.[1] as { onSuccess: (d: CashierTransaction) => void };
  act(() => opts.onSuccess(paidTx));
}

const originalMediaDevices = navigator.mediaDevices;
const setMediaDevices = (value: unknown) =>
  Object.defineProperty(navigator, 'mediaDevices', { value, configurable: true });

describe('PosPanel — FT-06.3 kassa rasmi', () => {
  beforeEach(() => {
    createMutate.mockClear();
    uploadMutate.mockClear();
    photoEnabled = false;
  });
  afterEach(() => setMediaDevices(originalMediaDevices));

  it('sozlama yoqilgan: to‘lovdan keyin kamera ochiladi, chek rasm qadamidan keyin', async () => {
    photoEnabled = true;
    // Kamera ruxsati kutilmoqda (hal bo'lmaydigan promise) — qadam ochiq qoladi.
    setMediaDevices({ getUserMedia: vi.fn(() => new Promise(() => {})) });
    await pay();

    expect(await screen.findByText("To'lovchi rasmi")).toBeTruthy();
    expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalled();
    // Chek rasm qadami tugaguncha ochilmaydi; to'lov allaqachon saqlangan (mutate 1 marta).
    expect(screen.queryByTestId('receipt-modal')).toBeNull();
    expect(createMutate).toHaveBeenCalledTimes(1);
    expect(uploadMutate).not.toHaveBeenCalled();

    // «O'tkazib yuborish» → user_skipped yoziladi, chek ochiladi.
    fireEvent.click(screen.getByRole('button', { name: "O'tkazib yuborish" }));
    expect(uploadMutate).toHaveBeenCalledWith(
      { transactionId: 'tx-paid', skippedReason: 'user_skipped' },
      expect.anything(),
    );
    expect(await screen.findByTestId('receipt-modal')).toBeTruthy();
  });

  it('sozlama o‘chiq: kamera ochilmaydi, darhol chek', async () => {
    const getUserMedia = vi.fn(() => new Promise(() => {}));
    setMediaDevices({ getUserMedia });
    await pay();

    expect(await screen.findByTestId('receipt-modal')).toBeTruthy();
    expect(screen.queryByText("To'lovchi rasmi")).toBeNull();
    expect(getUserMedia).not.toHaveBeenCalled();
    expect(uploadMutate).not.toHaveBeenCalled();
  });

  it('kamera yo‘q (getUserMedia qo‘llanmaydi) → skippedReason=no_camera, chek ochiladi', async () => {
    photoEnabled = true;
    setMediaDevices(undefined);
    await pay();

    await waitFor(() =>
      expect(uploadMutate).toHaveBeenCalledWith(
        { transactionId: 'tx-paid', skippedReason: 'no_camera' },
        expect.anything(),
      ),
    );
    expect(uploadMutate).toHaveBeenCalledTimes(1);
    expect(await screen.findByTestId('receipt-modal')).toBeTruthy();
  });

  it('kameraga ruxsat berilmadi → skippedReason=permission_denied', async () => {
    photoEnabled = true;
    setMediaDevices({
      getUserMedia: vi.fn(() =>
        Promise.reject(Object.assign(new Error('denied'), { name: 'NotAllowedError' })),
      ),
    });
    await pay();

    await waitFor(() =>
      expect(uploadMutate).toHaveBeenCalledWith(
        { transactionId: 'tx-paid', skippedReason: 'permission_denied' },
        expect.anything(),
      ),
    );
  });
});
