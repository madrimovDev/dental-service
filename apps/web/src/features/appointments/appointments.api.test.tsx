import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { useAppointments } from './appointments.api';

const listAppointments = vi.hoisted(() => vi.fn());
vi.mock('@dental/api-client', () => ({
  listAppointments,
  cancelAppointment: vi.fn(),
  createAppointment: vi.fn(),
  getBranchAvailability: vi.fn(),
  listBranches: vi.fn(),
  listDoctors: vi.fn(),
  listServices: vi.fn(),
  updateAppointment: vi.fn(),
}));

const rows = (n: number, from = 0) =>
  Array.from({ length: n }, (_, i) => ({ id: `a${from + i}`, patientId: 'p' }));

describe('useAppointments (SC-02)', () => {
  it('100 dan ortiq yozilish sahifalab to‘liq olinadi (jim kesilmaydi)', async () => {
    listAppointments.mockImplementation(({ page }: { page: number }) =>
      Promise.resolve({ data: page === 1 ? rows(100) : rows(30, 100) }),
    );
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(
      () => useAppointments({ from: '2026-12-01T00:00:00Z', to: '2026-12-08T00:00:00Z' }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(result.current.data).toHaveLength(130);
    expect(listAppointments).toHaveBeenCalledTimes(2);
    expect(listAppointments.mock.calls[1]?.[0]).toMatchObject({ page: 2, pageSize: 100 });
  });
});
