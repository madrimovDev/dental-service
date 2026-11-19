import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

// FX-168: tarix 50 ta bilan kesilmasin — to'liq sahifadan keyin keyingi sahifa so'raladi.
const listStockMovements = vi.hoisted(() => vi.fn());
vi.mock('@dental/api-client', async (orig) => ({
  ...(await orig<typeof import('@dental/api-client')>()),
  listStockMovements,
}));
const { useStockMovements, MOVEMENTS_PAGE_SIZE } = await import('./stock.api');

const rows = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `m${i}` }));

describe('useStockMovements — sahifalash (FX-168)', () => {
  it('to‘liq sahifa → hasNextPage; fetchNextPage page=2 so‘raydi; qisqa sahifa → tugadi', async () => {
    listStockMovements
      .mockResolvedValueOnce({ data: rows(MOVEMENTS_PAGE_SIZE) })
      .mockResolvedValueOnce({ data: rows(3) });
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useStockMovements('i1'), { wrapper });
    await waitFor(() => expect(result.current.data?.pages).toHaveLength(1));
    expect(listStockMovements).toHaveBeenLastCalledWith({
      itemId: 'i1',
      page: 1,
      pageSize: MOVEMENTS_PAGE_SIZE,
    });
    expect(result.current.hasNextPage).toBe(true);
    await result.current.fetchNextPage();
    await waitFor(() => expect(result.current.data?.pages).toHaveLength(2));
    expect(listStockMovements).toHaveBeenLastCalledWith({
      itemId: 'i1',
      page: 2,
      pageSize: MOVEMENTS_PAGE_SIZE,
    });
    expect(result.current.data?.pages.flat()).toHaveLength(MOVEMENTS_PAGE_SIZE + 3);
    expect(result.current.hasNextPage).toBe(false);
  });
});
