import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

// CLI-454: `usePatientsAll` endi `search` argumentini `listPatients`ga uzatishi kerak
// (avval doim pageSize:100, qidiruvsiz — 100 tadan ortiq bemor bo'lsa Select'da
// ko'rinmasdi). Backend `@dental/api-client` ni spy bilan almashtirib real forward'ni
// tekshiramiz (component-level mock buni yashiradi — faqat "component hook'ni to'g'ri
// argument bilan chaqirdi"ni isbotlaydi, "hook backend'ga to'g'ri uzatdi"ni emas).
const listPatientsMock = vi.hoisted(() =>
  vi.fn(() => Promise.resolve({ data: { data: [], meta: { page: 1, pageSize: 100, total: 0 } } })),
);

vi.mock('@dental/api-client', async (orig) => {
  const actual = await orig<typeof import('@dental/api-client')>();
  return { ...actual, listPatients: listPatientsMock };
});

const { usePatientsAll } = await import('./cashier.api');

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe('usePatientsAll (CLI-454)', () => {
  it('search bilan chaqirilganda listPatients ga search parametrini uzatadi', async () => {
    listPatientsMock.mockClear();
    renderHook(() => usePatientsAll('Vali'), { wrapper });
    await waitFor(() =>
      expect(listPatientsMock).toHaveBeenCalledWith({ search: 'Vali', pageSize: 100 }),
    );
  });

  it("search bo'sh bo'lganda listPatients ga search:undefined uzatadi (avvalgi xulq saqlanadi)", async () => {
    listPatientsMock.mockClear();
    renderHook(() => usePatientsAll(), { wrapper });
    await waitFor(() =>
      expect(listPatientsMock).toHaveBeenCalledWith({ search: undefined, pageSize: 100 }),
    );
  });
});
