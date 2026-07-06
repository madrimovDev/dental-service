import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderApp } from '../../../test-utils';
import { PosPanel } from './PosPanel';

const mutate = vi.fn();

vi.mock('../cashier.api', () => ({
  useServices: () => ({
    data: [
      {
        id: 's1',
        code: 'PL-001',
        nameUz: 'Plomba',
        nameRu: 'Пломба',
        isActive: true,
      },
    ],
  }),
  useCreateTransaction: () => ({ mutate, isPending: false }),
  // Narx avto-to'ldirish: s1 → b1 da 50000.
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

// Task D'ning ReceiptModal'i (net-new) hali landed bo'lmasligi mumkin —
// import disjoint qoladi; bu test uni stublaydi (B uni faqat import qiladi, tahrirlamaydi).
vi.mock('./ReceiptModal', () => ({
  ReceiptModal: () => null,
}));

describe('PosPanel', () => {
  beforeEach(() => {
    mutate.mockClear();
  });

  it('xizmat pill bosilganda narx avto-to‘ldiriladi (50000)', async () => {
    renderApp(<PosPanel branchId="b1" patientId={null} />);

    // Quick-add pill (label = nameUz) bosish → addService() trigger.
    fireEvent.click(await screen.findByText('Plomba'));

    // Savat qatori narxi 50000 ga avto-to'ldiriladi.
    await waitFor(() => {
      const priceInput = screen.getByDisplayValue("50 000 so'm");
      expect(priceInput).toBeTruthy();
    });
  });

  it('charge → create allocation-siz body bilan chaqiriladi', async () => {
    renderApp(<PosPanel branchId="b1" patientId="pat1" />);

    fireEvent.click(await screen.findByText('Plomba'));
    await screen.findByDisplayValue("50 000 so'm");

    fireEvent.click(screen.getByText("To'lovni qabul qilish"));

    expect(mutate).toHaveBeenCalledWith(
      expect.objectContaining({
        branchId: 'b1',
        patientId: 'pat1',
        items: [expect.objectContaining({ serviceId: 's1', quantity: 1, unitPrice: 50000 })],
        paymentMethod: 'cash',
      }),
      expect.anything(),
    );
  });

  it('chegirma pill (10%) → emitilgan discount = round(gross*0.1)', async () => {
    renderApp(<PosPanel branchId="b1" patientId="pat1" />);

    fireEvent.click(await screen.findByText('Plomba'));
    await screen.findByDisplayValue("50 000 so'm");

    // gross = 50000 → 10% → 5000.
    fireEvent.click(screen.getByText('10%'));

    fireEvent.click(screen.getByText("To'lovni qabul qilish"));

    expect(mutate).toHaveBeenCalledWith(
      expect.objectContaining({ discount: 5000 }),
      expect.anything(),
    );
  });

  it('to‘lov toggle "Karta" → payload paymentMethod:card', async () => {
    renderApp(<PosPanel branchId="b1" patientId="pat1" />);

    fireEvent.click(await screen.findByText('Plomba'));
    await screen.findByDisplayValue("50 000 so'm");

    fireEvent.click(screen.getByText('Karta'));

    fireEvent.click(screen.getByText("To'lovni qabul qilish"));

    expect(mutate).toHaveBeenCalledWith(
      expect.objectContaining({ paymentMethod: 'card' }),
      expect.anything(),
    );
  });
});
