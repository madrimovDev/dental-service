import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderApp } from '../../../../test-utils';
import { TreatmentPlansTab } from './TreatmentPlansTab';

vi.mock('../../clinical.api', () => ({
  useTreatmentPlans: () => ({
    data: [
      {
        id: 'pl1',
        title: 'Reja A',
        status: 'in_progress',
        totalCost: '1500000',
        totalVisits: 3,
        // CLI-114: stage'lar endi list javobida (PlanCard plan.stages o'qiydi).
        stages: [],
      },
    ],
    isLoading: false,
  }),
  useCreatePlan: () => ({ mutate: vi.fn(), isPending: false }),
  useUpdateStage: () => ({ mutate: vi.fn() }),
  // CLI-224: acceptance/consent/plan-status hook'lari.
  useUpdateStageAcceptance: () => ({ mutate: vi.fn(), isPending: false }),
  useAcceptAllStages: () => ({ mutate: vi.fn(), isPending: false }),
  useUpdatePlanStatus: () => ({ mutate: vi.fn(), isPending: false }),
  useSignPlanConsent: () => ({ mutate: vi.fn(), isPending: false }),
  useTreatmentPlanEstimate: () => ({ data: undefined, isLoading: false, isError: false }),
  // CLI-188: PlanFormModal xizmat katalogi + narx fetch ishlatadi.
  useServiceCatalog: () => ({ data: [] }),
  fetchServicePrices: vi.fn(),
}));
vi.mock('@/stores/auth-store.ts', () => ({
  // selector-uslubli chaqiruv (useAuthStore((s) => s.activeBranchId)) ni qo'llab-quvvatlaydi
  // biome-ignore lint/suspicious/noExplicitAny: test mock selector
  useAuthStore: (sel?: (s: any) => unknown) => {
    const store = { user: { id: 'u1' }, activeBranchId: null, hasPermission: () => true };
    return sel ? sel(store) : store;
  },
}));

describe('TreatmentPlansTab', () => {
  it("plan ro'yxatini render qiladi (smeta ko'rinadi)", () => {
    renderApp(<TreatmentPlansTab patientId="p1" />);
    expect(screen.getByText('Reja A')).toBeInTheDocument();
    expect(screen.getByText(/1[\s ,.]?500[\s ,.]?000/)).toBeInTheDocument();
  });

  it("regression: to'lov/paid/balans elementi YO'Q (Constraint #1)", () => {
    const { container } = renderApp(<TreatmentPlansTab patientId="p1" />);
    const text = container.textContent ?? '';
    expect(text.toLowerCase()).not.toMatch(/paid|to'langan|qoldiq|balans|balance/);
  });

  it('DS3: moliyaviy xulosa chrome + 0-bosqich progress xavfsiz render', () => {
    const { container } = renderApp(<TreatmentPlansTab patientId="p1" />);
    // 0 stage → progress NaN emas, "0/0" + "0%" ko'rinadi.
    expect(container.textContent).toContain('0/0');
    expect(container.textContent).toContain('0%');
    // Jami narx (smeta panel) doim ko'rinadi (totalCost shartsiz).
    expect(screen.getByText(/1[\s ,.]?500[\s ,.]?000/)).toBeInTheDocument();
  });
});
