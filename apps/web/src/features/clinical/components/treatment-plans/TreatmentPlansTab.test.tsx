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
const acceptAllMutate = vi.hoisted(() => vi.fn());

vi.mock('../../clinical.api', () => ({
  useTreatmentPlans: () => ({ data: mockPlans.data, isLoading: false }),
  useCreatePlan: () => ({ mutate: vi.fn(), isPending: false }),
  useUpdateStage: () => ({ mutate: vi.fn() }),
  // CLI-224: acceptance/consent/plan-status hook'lari.
  useUpdateStageAcceptance: () => ({ mutate: vi.fn(), isPending: false }),
  // FX-27: bosqichning resultingToothState tanlovi.
  useUpdateStageResultingState: () => ({ mutate: vi.fn(), isPending: false }),
  useAcceptAllStages: () => ({ mutate: acceptAllMutate, isPending: false }),
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
    acceptAllMutate.mockReset();
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
  // o'tkazib bo'lmasdi. Endi "Davolashni boshlash" tugmasi ko'rinadi va `useUpdatePlanStatus`
  // to'g'ri statusni chaqiradi.
  // FT-01.5: matn «Davolashni boshlash» (soddalashtirilgan atamalar).
  it("B4: 'accepted' plan — 'Davolashni boshlash' tugmasi in_progress'ga o'tkazadi", () => {
    mockPlans.data = [{ ...BASE_PLAN, status: 'accepted' }];
    renderApp(<TreatmentPlansTab patientId="p1" />);
    const startBtn = screen.getByRole('button', { name: 'Davolashni boshlash' });
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

  // FT-01.5: bekor qilish endi «…» (Boshqa amallar) menyusida.
  it("B4: 'accepted'/'in_progress' planda bekor qilish bandi bor — cancelled'ga o'tkazadi", async () => {
    mockPlans.data = [{ ...BASE_PLAN, status: 'accepted' }];
    renderApp(<TreatmentPlansTab patientId="p1" />);
    fireEvent.click(screen.getByRole('button', { name: 'Boshqa amallar' }));
    const cancelBtn = await screen.findByRole('menuitem', { name: 'Bekor qilish' });
    fireEvent.click(cancelBtn);
    expect(planStatusMutate).toHaveBeenCalledWith({ id: 'pl1', status: 'cancelled' });
  });

  it("B4: terminal ('completed'/'cancelled') planda lifecycle tugmalari yo'q", () => {
    mockPlans.data = [{ ...BASE_PLAN, status: 'completed' }];
    renderApp(<TreatmentPlansTab patientId="p1" />);
    expect(screen.queryByRole('button', { name: 'Davolashni boshlash' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Rejani yakunlash' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Bekor qilish' })).not.toBeInTheDocument();
  });
});

// FT-01.5: «Bemor rozi bo'ldi» — reja qabul qilingach taklif bosqichlari ham qabul qilinadi.
describe("TreatmentPlansTab — FT-01.5 «Bemor rozi bo'ldi»", () => {
  afterEach(() => {
    planStatusMutate.mockReset();
    acceptAllMutate.mockReset();
  });

  it('avval reja accepted, muvaffaqiyatdan keyin taklif bosqichlari qabul qilinadi', () => {
    mockPlans.data = [
      {
        ...BASE_PLAN,
        status: 'presented',
        consentFormId: 'cf1',
        stages: [
          {
            id: 's1',
            sequence: 1,
            serviceName: 'A',
            cost: '1',
            status: 'pending',
            acceptance: 'proposed',
            toothNumbers: [],
          },
          {
            id: 's2',
            sequence: 2,
            serviceName: 'B',
            cost: '1',
            status: 'pending',
            acceptance: 'rejected',
            toothNumbers: [],
          },
        ],
      },
    ];
    planStatusMutate.mockImplementation((_vars, opts) => opts?.onSuccess?.());
    renderApp(<TreatmentPlansTab patientId="p1" />);
    fireEvent.click(screen.getByRole('button', { name: "Bemor rozi bo'ldi" }));
    expect(planStatusMutate).toHaveBeenCalledWith(
      { id: 'pl1', status: 'accepted' },
      expect.anything(),
    );
    expect(acceptAllMutate).toHaveBeenCalledWith(['s1'], expect.anything());
  });

  it("rozilik gate'i rad etsa bosqichlarga tegilmaydi", () => {
    mockPlans.data = [
      {
        ...BASE_PLAN,
        status: 'presented',
        consentFormId: 'cf1',
        stages: [
          {
            id: 's1',
            sequence: 1,
            serviceName: 'A',
            cost: '1',
            status: 'pending',
            acceptance: 'proposed',
            toothNumbers: [],
          },
        ],
      },
    ];
    planStatusMutate.mockImplementation((_vars, opts) => opts?.onError?.(new Error('x')));
    renderApp(<TreatmentPlansTab patientId="p1" />);
    fireEvent.click(screen.getByRole('button', { name: "Bemor rozi bo'ldi" }));
    expect(acceptAllMutate).not.toHaveBeenCalled();
  });
});
