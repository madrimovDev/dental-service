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

describe('PlanCard — rozilik tugmasi (FX-26/FX-61)', () => {
  it("rozilik bog'lanmagan planda BITTA tugma (aside dublikati yo'q)", () => {
    renderApp(<PlanCard plan={plan()} canEdit {...handlers()} />);
    expect(screen.getAllByRole('button', { name: SIGN })).toHaveLength(1);
  });

  it("rozilik bog'langandan keyin tugma yo'q", () => {
    renderApp(<PlanCard plan={plan({ consentFormId: 'cf1' })} canEdit {...handlers()} />);
    expect(screen.queryByRole('button', { name: SIGN })).not.toBeInTheDocument();
  });

  it.each([
    'in_progress',
    'completed',
    'cancelled',
  ] as const)("%s planda tugma yo'q (FX-61)", (status) => {
    renderApp(<PlanCard plan={plan({ status })} canEdit {...handlers()} />);
    expect(screen.queryByRole('button', { name: SIGN })).not.toBeInTheDocument();
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
