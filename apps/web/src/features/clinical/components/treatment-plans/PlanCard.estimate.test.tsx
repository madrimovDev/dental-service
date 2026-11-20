import type { TreatmentPlanStatus, TreatmentPlanWithStages } from '@dental/api-client';
import { fireEvent, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderApp } from '../../../../test-utils';
import { PlanCard } from './PlanCard';

const estimateCalls = vi.hoisted(() => [] as Array<[string, boolean]>);

vi.mock('../../clinical.api', () => ({
  useConsentForms: () => ({ data: [], isLoading: false }),
  useConsentTemplates: () => ({ data: [] }),
  useSignConsent: () => ({ mutate: vi.fn(), isPending: false }),
  useTreatmentPlanEstimate: (planId: string, enabled: boolean) => {
    estimateCalls.push([planId, enabled]);
    return enabled
      ? {
          data: {
            planId,
            status: 'presented',
            totalProposed: 300000,
            totalAccepted: 200000,
            totalCost: 500000,
            totalPaid: 50000,
            balance: 150000,
            stages: [
              {
                stageId: 's1',
                serviceName: 'Plomba 36',
                cost: 200000,
                status: 'pending',
                acceptance: 'accepted',
                paid: 50000,
                debtEligible: true,
              },
            ],
          },
          isLoading: false,
          isError: false,
        }
      : { data: undefined, isLoading: false, isError: false };
  },
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
    totalCost: '500000',
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

const handlers = {
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
};

// FT-01.5 (spec §3): smeta/taqdimot modal EMAS — kartaning o'ng paneli.
describe("PlanCard — FT-01.5 smeta o'ng panelda", () => {
  it("smeta tugmasi o'ng panelda; ochilganda bosqichlar va balans panel ichida (dialog yo'q)", async () => {
    renderApp(<PlanCard plan={plan()} canEdit {...handlers} />);
    const aside = screen.getByRole('complementary');
    // Yopiq holatda so'rov yuborilmaydi va to'lov matnlari yo'q (lazy).
    expect(estimateCalls.every(([, enabled]) => !enabled)).toBe(true);
    expect(within(aside).queryByText('Plomba 36')).toBeNull();

    fireEvent.click(within(aside).getByRole('button', { name: "Smetani ko'rsatish" }));

    expect(await within(aside).findByText('Plomba 36')).toBeInTheDocument();
    expect(within(aside).getByText('Qoldiq (balans)')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).toBeNull();

    // Yashirish — panel qayta yig'iladi.
    fireEvent.click(within(aside).getByRole('button', { name: 'Smetani yashirish' }));
    expect(within(aside).queryByText('Plomba 36')).toBeNull();
  });

  it("canEdit=false (faqat ko'rish) rolda ham smeta o'ng panelda ochiladi", async () => {
    renderApp(<PlanCard plan={plan()} canEdit={false} {...handlers} />);
    const aside = screen.getByRole('complementary');
    fireEvent.click(within(aside).getByRole('button', { name: "Smetani ko'rsatish" }));
    expect(await within(aside).findByText('Plomba 36')).toBeInTheDocument();
  });
});
