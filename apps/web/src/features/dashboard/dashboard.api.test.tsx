import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { useTodayRange } from './dashboard.api';

// useTodayRange — hook nomida bo'lsa-da React hook ishlatmaydi (sof hisob),
// shuning uchun to'g'ridan-to'g'ri chaqiriladi.
describe('useTodayRange (CLI-160)', () => {
  const ISO_DATETIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

  it("from/to to'liq ISO datetime (date-only emas — appointments 400 oldini oladi)", () => {
    const { from, to } = useTodayRange();
    expect(from).toMatch(ISO_DATETIME);
    expect(to).toMatch(ISO_DATETIME);
  });

  it('from kun boshi, to kun oxiri — from < to', () => {
    const { from, to } = useTodayRange();
    expect(new Date(from).getTime()).toBeLessThan(new Date(to).getTime());
  });

  it('from va to bitta lokal kunga tegishli', () => {
    const { from, to } = useTodayRange();
    expect(new Date(from).toDateString()).toBe(new Date(to).toDateString());
  });
});

// CLI-412 — Technician endi rol shablonida `lab_order.view`ga ega (backend gate ochildi),
// lekin himoya sifatida frontend hook ham permission bilan gate qilinadi (graceful degrade —
// kelajakda boshqa rol shu dashboard'ni ochsa 403 portlamasin).
const mockHasPermission = vi.fn((_p: string) => true);
const mockListLabOrders = vi.fn((..._args: unknown[]) => Promise.resolve({ data: { data: [] } }));

vi.mock('@/stores/auth-store.ts', () => ({
  useAuthStore: () => ({ hasPermission: (p: string) => mockHasPermission(p) }),
}));

vi.mock('@dental/api-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@dental/api-client')>();
  return { ...actual, listLabOrders: (...args: unknown[]) => mockListLabOrders(...args) };
});

describe('useActiveLabOrders — permission-gated (CLI-412)', () => {
  const wrapper = ({ children }: { children: ReactNode }) => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  };

  it("lab_order.view yo'q rolda so'rov yubormaydi (enabled=false)", async () => {
    mockHasPermission.mockImplementation(() => false);
    mockListLabOrders.mockClear();
    const { useActiveLabOrders } = await import('./dashboard.api');
    const { result } = renderHook(() => useActiveLabOrders(), { wrapper });

    expect(result.current.fetchStatus).toBe('idle');
    expect(mockListLabOrders).not.toHaveBeenCalled();
  });

  it('lab_order.view bor rolda (masalan Technician, CLI-412) so‘rov yuboradi', async () => {
    mockHasPermission.mockImplementation((p: string) => p === 'lab_order.view');
    mockListLabOrders.mockClear();
    const { useActiveLabOrders } = await import('./dashboard.api');
    const { result } = renderHook(() => useActiveLabOrders(), { wrapper });

    await waitFor(() => expect(mockListLabOrders).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });
});
