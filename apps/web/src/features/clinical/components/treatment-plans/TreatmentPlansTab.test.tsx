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
}));
vi.mock('@/stores/auth-store.ts', () => ({
  useAuthStore: () => ({ user: { id: 'u1' }, hasPermission: () => true }),
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
});
