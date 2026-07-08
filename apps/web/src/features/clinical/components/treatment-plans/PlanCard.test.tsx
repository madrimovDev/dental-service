import type { TreatmentPlanStatus, TreatmentPlanWithStages } from '@dental/api-client';
import { screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { i18n } from '@/lib/i18n.ts';
import { renderApp } from '../../../../test-utils';
import { PlanCard } from './PlanCard';

function plan(over: Partial<TreatmentPlanWithStages> = {}): TreatmentPlanWithStages {
  return {
    id: 'pl1',
    tenantId: 't1',
    patientId: 'p1',
    doctorId: 'd1',
    title: 'Reja A',
    status: 'accepted' as TreatmentPlanStatus,
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

const noopHandlers = {
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

// B4 (CLI-439) hardcoded PLAN_ACTION_LABEL o'rniga endi `t()` orqali keladi (L2).
// Kalit qiymatini vaqtincha almashtirib (`i18n.addResourceBundle`), tugma matni
// shu almashtirilgan qiymatni aks ettirishini tekshiramiz — bu faqat komponent
// haqiqatan `t(key)` chaqirsa o'tadi (hardcoded literal bo'lsa override'ga
// ta'sir qilmaydi va assertsiya muvaffaqiyatsiz bo'ladi).
describe('PlanCard — B4 lifecycle tugmalari i18n orqali (L2)', () => {
  afterEach(() => {
    // Original qiymatlarni tiklaymiz (boshqa testlarga sizib chiqmasligi uchun).
    i18n.addResourceBundle(
      'uz',
      'translation',
      { treatment_plan: { start_execution: 'Ijroni boshlash', complete_plan: 'Rejani yakunlash' } },
      true,
      true,
    );
  });

  it("'accepted' plan: 'Ijroni boshlash' tugmasi treatment_plan.start_execution kaliti orqali keladi", () => {
    i18n.addResourceBundle(
      'uz',
      'translation',
      { treatment_plan: { start_execution: '__START_OVERRIDE__' } },
      true,
      true,
    );
    renderApp(<PlanCard plan={plan({ status: 'accepted' })} canEdit {...noopHandlers} />);
    expect(screen.getByRole('button', { name: '__START_OVERRIDE__' })).toBeInTheDocument();
  });

  it("'in_progress' plan: 'Rejani yakunlash' tugmasi treatment_plan.complete_plan kaliti orqali keladi", () => {
    i18n.addResourceBundle(
      'uz',
      'translation',
      { treatment_plan: { complete_plan: '__COMPLETE_OVERRIDE__' } },
      true,
      true,
    );
    renderApp(<PlanCard plan={plan({ status: 'in_progress' })} canEdit {...noopHandlers} />);
    expect(screen.getByRole('button', { name: '__COMPLETE_OVERRIDE__' })).toBeInTheDocument();
  });
});
