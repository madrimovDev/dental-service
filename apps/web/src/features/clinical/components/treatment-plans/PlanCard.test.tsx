import type { TreatmentPlanStatus, TreatmentPlanWithStages } from '@dental/api-client';
import { fireEvent, screen } from '@testing-library/react';
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
      {
        treatment_plan: {
          start_execution: 'Davolashni boshlash',
          complete_plan: 'Rejani yakunlash',
        },
      },
      true,
      true,
    );
  });

  it("'accepted' plan: 'Davolashni boshlash' tugmasi treatment_plan.start_execution kaliti orqali keladi", () => {
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

// FT-01.5 (spec §3): soddalashtirilgan holat nomlari (DB enum o'zgarmaydi, faqat UI).
describe('PlanCard — FT-01.5 soddalashtirilgan holatlar', () => {
  it.each([
    ['draft', 'Qoralama'],
    ['presented', "Bemorga ko'rsatildi"],
    ['accepted', 'Bemor rozi'],
    ['in_progress', 'Davolanmoqda'],
    ['completed', 'Tugadi'],
  ] as const)('%s → «%s»', (status, label) => {
    renderApp(<PlanCard plan={plan({ status })} canEdit={false} {...noopHandlers} />);
    expect(screen.getByText(label)).toBeInTheDocument();
  });
});

// FT-01.5 (spec §3): plan kartasida BITTA asosiy tugma (keyingi qadam) + «…» menyu.
const stage = (id: string, acceptance: 'proposed' | 'accepted' | 'rejected') =>
  ({
    id,
    treatmentPlanId: 'pl1',
    sequence: 1,
    serviceId: null,
    serviceName: `S-${id}`,
    toothNumbers: [],
    cost: '100000',
    estimatedVisits: 1,
    durationMinutes: null,
    status: 'pending',
    acceptance,
    resultingToothState: null,
    labOrderId: null,
    notes: null,
    completedAt: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  }) as unknown as TreatmentPlanWithStages['stages'][number];

const PRIMARY_ATTR = '[data-plan-primary="true"]';

describe('PlanCard — FT-01.5 bitta asosiy tugma + «…» menyu', () => {
  afterEach(() => vi.clearAllMocks());

  it("draft: yagona asosiy tugma «Bemorga ko'rsatish» → onPresentPlan", () => {
    const { container } = renderApp(
      <PlanCard plan={plan({ status: 'draft' })} canEdit {...noopHandlers} />,
    );
    const primary = container.querySelectorAll(PRIMARY_ATTR);
    expect(primary).toHaveLength(1);
    expect(primary[0]).toHaveTextContent("Bemorga ko'rsatish");
    fireEvent.click(screen.getByRole('button', { name: "Bemorga ko'rsatish" }));
    expect(noopHandlers.onPresentPlan).toHaveBeenCalledWith('pl1');
    // Bekor qilish/Rozilik endi ko'rinadigan tugma emas — menyuda.
    expect(screen.queryByRole('button', { name: 'Bekor qilish' })).not.toBeInTheDocument();
  });

  it("presented + rozilik yo'q: asosiy tugma — rozilikni imzolash («Bemor rozi» yo'q)", () => {
    const { container } = renderApp(
      <PlanCard plan={plan({ status: 'presented' })} canEdit {...noopHandlers} />,
    );
    expect(container.querySelector(PRIMARY_ATTR)).toHaveTextContent('Rozilikni imzolash');
    expect(screen.queryByRole('button', { name: "Bemor rozi bo'ldi" })).not.toBeInTheDocument();
  });

  it("presented + rozilik bor: «Bemor rozi bo'ldi» → onAcceptPlan(planId, taklif bosqichlari)", () => {
    renderApp(
      <PlanCard
        plan={plan({
          status: 'presented',
          consentFormId: 'cf1',
          stages: [stage('s1', 'proposed'), stage('s2', 'rejected'), stage('s3', 'accepted')],
        })}
        canEdit
        {...noopHandlers}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: "Bemor rozi bo'ldi" }));
    expect(noopHandlers.onAcceptPlan).toHaveBeenCalledWith('pl1', ['s1']);
  });

  it('accepted: asosiy tugma «Davolashni boshlash» → in_progress', () => {
    const { container } = renderApp(
      <PlanCard plan={plan({ status: 'accepted' })} canEdit {...noopHandlers} />,
    );
    expect(container.querySelector(PRIMARY_ATTR)).toHaveTextContent('Davolashni boshlash');
  });

  it('«…» menyu: bekor qilish, hammasini qabul qilish, rozilik — menyu bandlari', async () => {
    renderApp(
      <PlanCard
        plan={plan({ status: 'draft', stages: [stage('s1', 'proposed')] })}
        canEdit
        {...noopHandlers}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Boshqa amallar' }));
    expect(await screen.findByRole('menuitem', { name: 'Bekor qilish' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Hammasini qabul qilish' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Rozilikni imzolash' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Bekor qilish' }));
    expect(noopHandlers.onSetPlanStatus).toHaveBeenCalledWith('pl1', 'cancelled');
  });

  it.each(['completed', 'cancelled'] as const)("%s: asosiy tugma ham, menyu ham yo'q", (status) => {
    const { container } = renderApp(<PlanCard plan={plan({ status })} canEdit {...noopHandlers} />);
    expect(container.querySelector(PRIMARY_ATTR)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Boshqa amallar' })).not.toBeInTheDocument();
  });

  it("canEdit=false: amal tugmalari yo'q", () => {
    const { container } = renderApp(
      <PlanCard plan={plan({ status: 'draft' })} canEdit={false} {...noopHandlers} />,
    );
    expect(container.querySelector(PRIMARY_ATTR)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Boshqa amallar' })).not.toBeInTheDocument();
  });
});
