import { fireEvent, screen } from '@testing-library/react';
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
  ],
};

// biome-ignore lint/suspicious/noExplicitAny: test-only mutable mock
let plansMock: any[] = [{ id: 'plan1', title: 'Asosiy reja', status: 'in_progress' }];
// biome-ignore lint/suspicious/noExplicitAny: test-only mutable mock
let balanceMock: any = planBalanceMock;

vi.mock('../cashier.api', () => ({
  usePatientPlans: () => ({ data: plansMock }),
  usePlanBalance: () => ({ data: balanceMock }),
  useCreateTransaction: () => ({ mutate: createMutate, isPending: false }),
}));

describe('PlanBillingPanel', () => {
  beforeEach(() => {
    createMutate.mockClear();
    plansMock = [{ id: 'plan1', title: 'Asosiy reja', status: 'in_progress' }];
    balanceMock = planBalanceMock;
  });

  // FX-65: bekor qilingan rejada kredit qolsa — kassada eslatma (o'tkazish yoki refund).
  it('bekor qilingan rejada kredit qolsa eslatma ko‘rsatadi', () => {
    plansMock = [{ id: 'plan1', title: 'Asosiy reja', status: 'cancelled' }];
    balanceMock = {
      totalCost: 0,
      totalPaid: 50000,
      balance: -50000,
      stages: [
        {
          stageId: 'st1',
          serviceName: 'Plomba',
          cost: 0,
          paid: 50000,
          remaining: -50000,
          excludedFromDebt: true,
        },
      ],
    };
    renderApp(<PlanBillingPanel branchId="b1" patientId="pat1" />);
    const alert = screen.getByTestId('cancelled-plan-credit');
    expect(alert.textContent).toMatch(/50\D?000/);
    expect(alert.textContent).toMatch(/bekor qilingan/i);
  });

  it('faol rejada eslatma ko‘rinmaydi', () => {
    renderApp(<PlanBillingPanel branchId="b1" patientId="pat1" />);
    expect(screen.queryByTestId('cancelled-plan-credit')).toBeNull();
  });

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
});
