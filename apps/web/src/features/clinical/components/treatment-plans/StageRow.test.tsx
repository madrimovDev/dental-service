import type { TreatmentStage } from '@dental/api-client';
import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderApp } from '../../../../test-utils';
import { StageRow } from './StageRow';

function stage(over: Partial<TreatmentStage> = {}): TreatmentStage {
  return {
    id: 's1',
    treatmentPlanId: 'pl1',
    sequence: 1,
    serviceId: null,
    serviceName: 'Plomba',
    toothNumbers: [11],
    estimatedVisits: 1,
    estimatedDurationMinutes: null,
    cost: '150000',
    status: 'pending',
    acceptance: 'proposed',
    notes: null,
    completedAt: null,
    labOrderId: null,
    resultingToothState: null,
    ...over,
  };
}

describe('StageRow acceptance (CLI-224)', () => {
  it('proposed stage: accept tugmasi onSetAcceptance(accepted) chaqiradi', () => {
    const onSetAcceptance = vi.fn();
    renderApp(
      <StageRow
        stage={stage()}
        canEdit
        onUpdateStage={vi.fn()}
        onSetAcceptance={onSetAcceptance}
        acceptancePending={false}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /qabul qilish/i }));
    expect(onSetAcceptance).toHaveBeenCalledWith('s1', 'accepted');
  });

  it('proposed stage: reject tugmasi onSetAcceptance(rejected) chaqiradi', () => {
    const onSetAcceptance = vi.fn();
    renderApp(
      <StageRow
        stage={stage()}
        canEdit
        onUpdateStage={vi.fn()}
        onSetAcceptance={onSetAcceptance}
        acceptancePending={false}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /rad etish/i }));
    expect(onSetAcceptance).toHaveBeenCalledWith('s1', 'rejected');
  });

  it("accepted stage: accept tugmasi YO'Q (faqat reject qoladi)", () => {
    renderApp(
      <StageRow
        stage={stage({ acceptance: 'accepted' })}
        canEdit
        onUpdateStage={vi.fn()}
        onSetAcceptance={vi.fn()}
        acceptancePending={false}
      />,
    );
    expect(screen.queryByRole('button', { name: /qabul qilish/i })).toBeNull();
    expect(screen.getByRole('button', { name: /rad etish/i })).toBeInTheDocument();
  });

  it("canEdit=false: acceptance tugmalari YO'Q", () => {
    renderApp(
      <StageRow
        stage={stage()}
        canEdit={false}
        onUpdateStage={vi.fn()}
        onSetAcceptance={vi.fn()}
        acceptancePending={false}
      />,
    );
    expect(screen.queryByRole('button', { name: /qabul qilish/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /rad etish/i })).toBeNull();
  });
});
