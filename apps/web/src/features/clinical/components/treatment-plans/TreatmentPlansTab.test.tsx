import { fireEvent, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderApp } from '../../../../test-utils';
import { TreatmentPlansTab } from './TreatmentPlansTab';

const BASE_PLAN = {
  id: 'pl1',
  title: 'Reja A',
  status: 'in_progress',
  totalCost: '1500000',
  totalVisits: 3,
  // CLI-114: stage'lar endi list javobida (PlanCard plan.stages o'qiydi).
  stages: [],
};

// B4 (CLI-439): plan status testdan testga o'zgaradi — mutable hoisted holat.
// biome-ignore lint/suspicious/noExplicitAny: test mock — plan shape yengil
const mockPlans = vi.hoisted(() => ({ data: [] as any[] }));
const planStatusMutate = vi.hoisted(() => vi.fn());

vi.mock('../../clinical.api', () => ({
  useTreatmentPlans: () => ({ data: mockPlans.data, isLoading: false }),
  useCreatePlan: () => ({ mutate: vi.fn(), isPending: false }),
  useUpdateStage: () => ({ mutate: vi.fn() }),
  // CLI-224: acceptance/consent/plan-status hook'lari.
  useUpdateStageAcceptance: () => ({ mutate: vi.fn(), isPending: false }),
  useAcceptAllStages: () => ({ mutate: vi.fn(), isPending: false }),
  useUpdatePlanStatus: () => ({ mutate: planStatusMutate, isPending: false }),
  useSignPlanConsent: () => ({ mutate: vi.fn(), isPending: false }),
  // CLI-461: PlanCard konsent tanlagichi — bemorning amaldagi consent-formlarini o'qiydi.
  useConsentForms: () => ({ data: [], isLoading: false }),
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
  afterEach(() => {
    mockPlans.data = [BASE_PLAN];
    planStatusMutate.mockReset();
  });

  it("plan ro'yxatini render qiladi (smeta ko'rinadi)", () => {
    mockPlans.data = [BASE_PLAN];
    renderApp(<TreatmentPlansTab patientId="p1" />);
    expect(screen.getByText('Reja A')).toBeInTheDocument();
    expect(screen.getByText(/1[\s ,.]?500[\s ,.]?000/)).toBeInTheDocument();
  });

  it("regression: to'lov/paid/balans elementi YO'Q (Constraint #1)", () => {
    mockPlans.data = [BASE_PLAN];
    const { container } = renderApp(<TreatmentPlansTab patientId="p1" />);
    const text = container.textContent ?? '';
    expect(text.toLowerCase()).not.toMatch(/paid|to'langan|qoldiq|balans|balance/);
  });

  it('DS3: moliyaviy xulosa chrome + 0-bosqich progress xavfsiz render', () => {
    mockPlans.data = [BASE_PLAN];
    const { container } = renderApp(<TreatmentPlansTab patientId="p1" />);
    // 0 stage → progress NaN emas, "0/0" + "0%" ko'rinadi.
    expect(container.textContent).toContain('0/0');
    expect(container.textContent).toContain('0%');
    // Jami narx (smeta panel) doim ko'rinadi (totalCost shartsiz).
    expect(screen.getByText(/1[\s ,.]?500[\s ,.]?000/)).toBeInTheDocument();
  });

  // B4 (CLI-439): "accepted" plan avval `in_progress`/`completed`/`cancelled`ga UI'дан
  // o'tkazib bo'lmasdi. Endi "Ijroni boshlash" tugmasi ko'rinadi va `useUpdatePlanStatus`
  // to'g'ri statusni chaqiradi.
  it("B4: 'accepted' plan — 'Ijroni boshlash' tugmasi in_progress'ga o'tkazadi", () => {
    mockPlans.data = [{ ...BASE_PLAN, status: 'accepted' }];
    renderApp(<TreatmentPlansTab patientId="p1" />);
    const startBtn = screen.getByRole('button', { name: 'Ijroni boshlash' });
    fireEvent.click(startBtn);
    expect(planStatusMutate).toHaveBeenCalledWith({ id: 'pl1', status: 'in_progress' });
  });

  it("B4: 'in_progress' plan — 'Rejani yakunlash' tugmasi completed'ga o'tkazadi", () => {
    mockPlans.data = [{ ...BASE_PLAN, status: 'in_progress' }];
    renderApp(<TreatmentPlansTab patientId="p1" />);
    const completeBtn = screen.getByRole('button', { name: 'Rejani yakunlash' });
    fireEvent.click(completeBtn);
    expect(planStatusMutate).toHaveBeenCalledWith({ id: 'pl1', status: 'completed' });
  });

  it("B4: 'accepted'/'in_progress' planda bekor qilish tugmasi bor — cancelled'ga o'tkazadi", () => {
    mockPlans.data = [{ ...BASE_PLAN, status: 'accepted' }];
    renderApp(<TreatmentPlansTab patientId="p1" />);
    const cancelBtn = screen.getByRole('button', { name: 'Bekor qilish' });
    fireEvent.click(cancelBtn);
    expect(planStatusMutate).toHaveBeenCalledWith({ id: 'pl1', status: 'cancelled' });
  });

  it("B4: terminal ('completed'/'cancelled') planda lifecycle tugmalari yo'q", () => {
    mockPlans.data = [{ ...BASE_PLAN, status: 'completed' }];
    renderApp(<TreatmentPlansTab patientId="p1" />);
    expect(screen.queryByRole('button', { name: 'Ijroni boshlash' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Rejani yakunlash' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Bekor qilish' })).not.toBeInTheDocument();
  });
});
