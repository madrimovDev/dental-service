import { fireEvent, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderApp } from '../../../test-utils';
import { PlanBillingPanel } from './PlanBillingPanel';

const createMutate = vi.fn();

const planBalanceMock = {
  totalCost: 100000,
  totalPaid: 30000,
  balance: 70000,
  stages: [
    {
      stageId: 'st1',
      serviceName: 'Plomba',
      cost: 40000,
      paid: 40000,
      remaining: 0,
      excludedFromDebt: false,
    },
    {
      stageId: 'st2',
      serviceName: 'Kanal',
      cost: 60000,
      paid: 0,
      remaining: 60000,
      excludedFromDebt: false,
    },
    {
      stageId: 'st3',
      serviceName: 'Implant',
      cost: 0,
      paid: 0,
      remaining: 0,
      excludedFromDebt: true,
    },
  ],
};

vi.mock('../cashier.api', () => ({
  usePatientPlans: () => ({
    data: [{ id: 'plan1', title: 'Asosiy reja', status: 'in_progress' }],
  }),
  usePlanBalance: () => ({ data: planBalanceMock }),
  useCreateTransaction: () => ({ mutate: createMutate, isPending: false }),
  useTransactionDetail: () => ({
    data: { id: 'tx9', fiscalReceiptId: null, cardProvider: 'click', visitNoteId: null, items: [] },
    isError: false,
  }),
}));

describe('PlanBillingPanel', () => {
  beforeEach(() => createMutate.mockClear());

  it("bemor yo'q → hint ko'rsatadi", () => {
    renderApp(<PlanBillingPanel branchId="b1" patientId={null} />);
    expect(screen.getByText('Avval bemorni tanlang')).toBeTruthy();
  });

  it('plan tanlanganda bosqichlar balansi ko‘rsatiladi', () => {
    renderApp(<PlanBillingPanel branchId="b1" patientId="pat1" />);
    expect(screen.getByText('Plomba')).toBeTruthy();
    expect(screen.getByText('Kanal')).toBeTruthy();
  });

  it('to‘lanmagan bosqich tanlab to‘lash → allocation create', () => {
    renderApp(<PlanBillingPanel branchId="b1" patientId="pat1" />);

    // st2 (to'lanmagan) checkbox'ini tanlash.
    fireEvent.click(screen.getByLabelText('Kanal'));
    // To'lash tugmasi.
    fireEvent.click(screen.getByText("Tanlanganlarni to'lash"));

    expect(createMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        treatmentPlanId: 'plan1',
        allocations: [{ stageId: 'st2', amount: 60000 }],
        paidAmount: 60000,
        branchId: 'b1',
      }),
      expect.anything(),
    );
  });
  it("FX-151: qarzdan chiqarilgan bosqich «To'langan» emas, «Qabul qilinmagan» va tanlab bo'lmaydi", () => {
    renderApp(<PlanBillingPanel branchId="b1" patientId="pat1" />);
    expect(screen.getByText('Qabul qilinmagan')).toBeTruthy();
    expect((screen.getByLabelText('Implant') as HTMLInputElement).disabled).toBe(true);
    // Haqiqatan to'langan bosqich hamon «To'langan».
    expect(screen.getAllByText("To'langan").length).toBe(1);
  });

  it('FX-150: karta tanlansa sub-tur yuboriladi va muvaffaqiyatda chek modali ochiladi', async () => {
    renderApp(<PlanBillingPanel branchId="b1" patientId="pat1" />);
    fireEvent.click(screen.getByLabelText('Kanal'));
    // To'lov usuli = Karta (Mantine Select).
    fireEvent.click(screen.getByRole('textbox', { name: "To'lov turi" }));
    fireEvent.click(await screen.findByRole('option', { name: 'Karta' }));
    // Sub-tur: Click.
    fireEvent.click(await screen.findByRole('radio', { name: 'Click' }));
    fireEvent.click(screen.getByText("Tanlanganlarni to'lash"));

    expect(createMutate).toHaveBeenCalledWith(
      expect.objectContaining({ paymentMethod: 'card', cardProvider: 'click' }),
      expect.anything(),
    );
    // onSuccess → ReceiptModal.
    const opts = createMutate.mock.calls[0]?.[1] as { onSuccess: (d: unknown) => void };
    const { act } = await import('@testing-library/react');
    act(() =>
      opts.onSuccess({
        id: 'tx9',
        receiptNumber: 'R-900',
        totalAmount: '60000',
        paidAmount: '60000',
        discount: '0',
        paymentMethod: 'card',
        type: 'payment',
        status: 'completed',
        treatmentPlanId: 'plan1',
        createdAt: '2026-11-20T05:00:00Z',
        fiscalReceiptId: null,
      }),
    );
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/R-900/)).toBeTruthy();
  });
});
