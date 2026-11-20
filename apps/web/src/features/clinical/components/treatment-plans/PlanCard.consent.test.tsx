import type { TreatmentPlanStatus, TreatmentPlanWithStages } from '@dental/api-client';
import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderApp } from '../../../../test-utils';
import { PlanCard } from './PlanCard';

const signMutate = vi.hoisted(() => vi.fn());

vi.mock('../../clinical.api', () => ({
  useConsentForms: () => ({ data: [], isLoading: false }),
  useConsentTemplates: () => ({ data: [] }),
  useSignConsent: () => ({ mutate: signMutate, isPending: false }),
  useTreatmentPlanEstimate: () => ({ data: undefined, isLoading: false, isError: false }),
}));
vi.mock('@/stores/auth-store.ts', () => ({
  useAuthStore: () => ({ hasPermission: () => true }),
}));

function plan(over: Partial<TreatmentPlanWithStages> = {}): TreatmentPlanWithStages {
  return {
    id: 'pl1',
    tenantId: 't1',
    patientId: 'p1',
    doctorId: 'd1',
    title: 'Reja A',
    status: 'presented' as TreatmentPlanStatus,
    totalCost: '1500000',
    totalVisits: 3,
    consentSignedAt: null,
    consentSignatureUrl: null,
    consentFormId: null,
    notes: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    stages: [],
    ...over,
  };
}

const handlers = () => ({
  onUpdateStage: vi.fn(),
  onSetAcceptance: vi.fn(),
  acceptancePending: false,
  onAcceptAll: vi.fn(),
  acceptAllPending: false,
  onPresentPlan: vi.fn(),
  onAcceptPlan: vi.fn(),
  onSetPlanStatus: vi.fn(),
  planStatusPending: false,
  onSignConsent: vi.fn(),
  consentPending: false,
});

const SIGN = 'Rozilikni imzolash';
const RENEW = 'Rozilikni yangilash';
const MORE = 'Boshqa amallar';

describe('PlanCard — rozilik tugmasi (FX-26/FX-61)', () => {
  it("rozilik bog'lanmagan planda BITTA tugma (aside dublikati yo'q)", () => {
    renderApp(<PlanCard plan={plan()} canEdit {...handlers()} />);
    expect(screen.getAllByRole('button', { name: SIGN })).toHaveLength(1);
  });

  // FT-01.5: bog'langan rozilikda asosiy tugma — «Bemor rozi bo'ldi»; yangilash «…» menyuda.
  it("rozilik bog'langandan keyin «imzolash» o'rniga «yangilash» bandi (bitta, menyuda)", async () => {
    renderApp(<PlanCard plan={plan({ consentFormId: 'cf1' })} canEdit {...handlers()} />);
    expect(screen.queryByRole('button', { name: SIGN })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: MORE }));
    expect(await screen.findAllByRole('menuitem', { name: RENEW })).toHaveLength(1);
    expect(screen.queryByRole('menuitem', { name: SIGN })).not.toBeInTheDocument();
  });

  // FX-26 review: bog'langan rozilik muddati o'tgan bo'lsa backend `updatePlan`
  // ConsentRequiredError beradi — UI qayta bog'lash yo'lini yopib qo'ymasligi kerak.
  it.each([
    'draft',
    'presented',
    'accepted',
  ] as const)("%s planda bog'langan (muddati o'tgan) rozilikni yangilash mumkin", async (status) => {
    const h = handlers();
    signMutate.mockImplementation((_body, opts) => opts.onSuccess({ id: 'cf-new2' }));
    renderApp(<PlanCard plan={plan({ status, consentFormId: 'cf-expired' })} canEdit {...h} />);
    fireEvent.click(screen.getByRole('button', { name: MORE }));
    fireEvent.click(await screen.findByRole('menuitem', { name: RENEW }));
    fireEvent.change(await screen.findByLabelText(/Shablon nomi/), {
      target: { value: 'Davolashga rozilik' },
    });
    fireEvent.change(screen.getByLabelText(/Matn/), {
      target: { value: 'Yetarlicha uzun matn' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Imzolash' }));
    expect(h.onSignConsent).toHaveBeenCalledWith('pl1', { consentFormId: 'cf-new2' });
  });

  it.each([
    'in_progress',
    'completed',
    'cancelled',
  ] as const)("%s planda tugma yo'q (FX-61)", (status) => {
    renderApp(<PlanCard plan={plan({ status })} canEdit {...handlers()} />);
    expect(screen.queryByRole('button', { name: SIGN })).not.toBeInTheDocument();
    renderApp(<PlanCard plan={plan({ status, consentFormId: 'cf1' })} canEdit {...handlers()} />);
    expect(screen.queryByRole('button', { name: RENEW })).not.toBeInTheDocument();
  });

  it("modaldan imzolab bog'lash: sign → onSignConsent(planId, {consentFormId})", async () => {
    const h = handlers();
    signMutate.mockImplementation((_body, opts) => opts.onSuccess({ id: 'cf-new' }));
    renderApp(<PlanCard plan={plan()} canEdit {...h} />);
    fireEvent.click(screen.getByRole('button', { name: SIGN }));
    fireEvent.change(await screen.findByLabelText(/Shablon nomi/), {
      target: { value: 'Davolashga rozilik' },
    });
    fireEvent.change(screen.getByLabelText(/Matn/), {
      target: { value: 'Yetarlicha uzun matn' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Imzolash' }));
    expect(signMutate).toHaveBeenCalledWith(
      expect.objectContaining({ patientId: 'p1', type: 'treatment', isPerpetual: true }),
      expect.anything(),
    );
    expect(h.onSignConsent).toHaveBeenCalledWith('pl1', { consentFormId: 'cf-new' });
  });
});
