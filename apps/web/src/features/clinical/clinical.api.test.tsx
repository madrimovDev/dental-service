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

vi.mock('@dental/api-client', async (orig) => {
  const actual = await orig<typeof import('@dental/api-client')>();
  return { ...actual, updateTreatmentStage: updateStageMock };
});

const { useUpdateStage } = await import('./clinical.api');

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
