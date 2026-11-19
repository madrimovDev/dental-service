import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useAuthStore } from '@/stores/auth-store.ts';

const api = vi.hoisted(() => ({
  listBookingRequests: vi.fn(async () => ({
    success: true,
    data: { items: [], pendingCount: 3 },
  })),
}));
vi.mock('@dental/api-client', async (orig) => ({
  ...((await orig()) as Record<string, unknown>),
  ...api,
}));

import { BOOKING_REFETCH_MS, useBookingRequests } from './reception.api.ts';

const setup = () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  return { qc, wrapper };
};

afterEach(() => {
  api.listBookingRequests.mockClear();
  useAuthStore.setState({ permissions: [] });
});

// FX-23: yangi Telegram so'rovi registrator/mudirga ~20 s ichida ko'rinishi kerak (qo'lda yangilash yo'q).
describe('useBookingRequests', () => {
  it("pending so'rovi ~20 s oralig'ida avtomatik yangilanadi", async () => {
    useAuthStore.setState({ permissions: ['appointment.view'] });
    const { qc, wrapper } = setup();
    const { result } = renderHook(() => useBookingRequests('pending'), { wrapper });
    await waitFor(() => expect(result.current.data?.pendingCount).toBe(3));
    const q = qc.getQueryCache().getAll()[0];
    const interval = q?.observers[0]?.options.refetchInterval;
    expect(interval).toBe(BOOKING_REFETCH_MS);
    expect(BOOKING_REFETCH_MS).toBeLessThanOrEqual(30_000);
  });

  it("expired ro'yxati davriy yangilanmaydi va status serverga uzatiladi", async () => {
    useAuthStore.setState({ permissions: ['appointment.view'] });
    const { qc, wrapper } = setup();
    const { result } = renderHook(() => useBookingRequests('expired'), { wrapper });
    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(api.listBookingRequests).toHaveBeenCalledWith({ status: 'expired' });
    expect(qc.getQueryCache().getAll()[0]?.observers[0]?.options.refetchInterval).toBe(false);
  });

  it("appointment.view yo'q — so'rov yuborilmaydi", async () => {
    useAuthStore.setState({ permissions: [] });
    const { wrapper } = setup();
    renderHook(() => useBookingRequests('pending'), { wrapper });
    await new Promise((r) => setTimeout(r, 30));
    expect(api.listBookingRequests).not.toHaveBeenCalled();
  });
});
