import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { clinicalKeys } from './clinical.keys';

// FX-62: bosqich `completed` bo'lganda backend odontogramma snapshot'ini avto yaratadi.
// useUpdateStage tooth-chart (latest + history) so'rovlarini invalidate qilmasa, OdontogramTab
// eski keshdagi qoralamadan saqlab, avto-snapshot'ni last-write-wins bilan ustiga yozadi.
const updateStageMock = vi.hoisted(() =>
  vi.fn(() =>
    Promise.resolve({ data: { id: 'stage-1', treatmentPlanId: 'plan-1', status: 'completed' } }),
  ),
);

const addStageMock = vi.hoisted(() =>
  vi.fn((planId: string, body: { toothNumbers?: number[] }) =>
    Promise.resolve({ data: { id: `st-${body.toothNumbers?.[0]}`, treatmentPlanId: planId } }),
  ),
);

vi.mock('@dental/api-client', async (orig) => {
  const actual = await orig<typeof import('@dental/api-client')>();
  return { ...actual, updateTreatmentStage: updateStageMock, addTreatmentStage: addStageMock };
});

const { useAddPlanStages, useUpdateStage } = await import('./clinical.api');

describe('useUpdateStage (FX-62)', () => {
  it('muvaffaqiyatdan keyin tooth-chart latest/history keshini invalidate qiladi', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const spy = vi.spyOn(qc, 'invalidateQueries');
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useUpdateStage('patient-1'), { wrapper });
    result.current.mutate({ id: 'stage-1', status: 'completed' });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const keys = spy.mock.calls.map((c) => JSON.stringify(c[0]?.queryKey));
    expect(keys).toContain(JSON.stringify(clinicalKeys.toothChartLatest('patient-1')));
    expect(keys).toContain(JSON.stringify(clinicalKeys.toothCharts('patient-1')));
  });
});

describe('useAddPlanStages (FT-01.3)', () => {
  it("bosqichlarni tartib bilan joriy rejaga qo'shadi va reja/smeta keshini yangilaydi", async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const spy = vi.spyOn(qc, 'invalidateQueries');
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useAddPlanStages('patient-1'), { wrapper });
    result.current.mutate({
      planId: 'plan-1',
      stages: [
        { serviceName: 'A', cost: 0, toothNumbers: [16] },
        { serviceName: 'A', cost: 0, toothNumbers: [17] },
      ],
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(addStageMock.mock.calls.map((c) => [c[0], c[1].toothNumbers])).toEqual([
      ['plan-1', [16]],
      ['plan-1', [17]],
    ]);
    expect(result.current.data?.map((st) => st.id)).toEqual(['st-16', 'st-17']);
    const keys = spy.mock.calls.map((c) => JSON.stringify(c[0]?.queryKey));
    expect(keys).toContain(JSON.stringify(clinicalKeys.plans('patient-1')));
    expect(keys).toContain(JSON.stringify(clinicalKeys.planEstimate('plan-1')));
  });
});
