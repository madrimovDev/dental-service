import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { expensesKeys } from '@/features/expenses/expenses.keys';
import { stockKeys } from './stock.keys';

// FX-166: vizit saqlash avto-chiqim (BOM) yaratadi, «xarajatga yoz» kirimi xarajat yaratadi —
// ikkalasi ham web keshlarini yangilashi kerak (aks holda qoldiq/xarajat eski qoladi).
const mocks = vi.hoisted(() => ({
  createVisitNote: vi.fn(() => Promise.resolve({ data: {} })),
  updateVisitNote: vi.fn(() => Promise.resolve({ data: {} })),
  createStockBatch: vi.fn(() => Promise.resolve({ data: {} })),
}));
vi.mock('@dental/api-client', async (orig) => ({
  ...(await orig<typeof import('@dental/api-client')>()),
  ...mocks,
}));

const { useCreateBatch } = await import('./stock.api');
const { useCreateVisitNote, useUpdateVisitNote } = await import('../clinical/clinical.api');

function setup() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const seed = (key: readonly unknown[]) => qc.setQueryData(key, []);
  seed(stockKeys.items(''));
  seed(stockKeys.autoToday(''));
  seed(expensesKeys.list({}));
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  const invalidated = (key: readonly unknown[]) => qc.getQueryState(key)?.isInvalidated === true;
  return { qc, wrapper, invalidated };
}

describe('FX-166 — keshni yangilash', () => {
  it('vizit yozuvini yaratish → ombor keshi (qoldiq, avto-chiqim jurnali) yangilanadi', async () => {
    const { wrapper, invalidated } = setup();
    const { result } = renderHook(() => useCreateVisitNote('p1'), { wrapper });
    result.current.mutate({} as never);
    await waitFor(() => expect(mocks.createVisitNote).toHaveBeenCalled());
    await waitFor(() => expect(invalidated(stockKeys.items(''))).toBe(true));
    expect(invalidated(stockKeys.autoToday(''))).toBe(true);
  });

  it('vizit yozuvini tahrirlash → ombor keshi yangilanadi', async () => {
    const { wrapper, invalidated } = setup();
    const { result } = renderHook(() => useUpdateVisitNote('p1'), { wrapper });
    result.current.mutate({ id: 'v1', body: {} as never });
    await waitFor(() => expect(mocks.updateVisitNote).toHaveBeenCalled());
    await waitFor(() => expect(invalidated(stockKeys.items(''))).toBe(true));
    expect(invalidated(stockKeys.autoToday(''))).toBe(true);
  });

  it('kirim recordAsExpense=true → xarajatlar keshi ham yangilanadi', async () => {
    const { wrapper, invalidated } = setup();
    const { result } = renderHook(() => useCreateBatch(), { wrapper });
    result.current.mutate({ recordAsExpense: true } as never);
    await waitFor(() => expect(invalidated(stockKeys.items(''))).toBe(true));
    expect(invalidated(expensesKeys.list({}))).toBe(true);
  });

  it('kirim recordAsExpense yo‘q → xarajatlar keshi tegilmaydi', async () => {
    const { wrapper, invalidated } = setup();
    const { result } = renderHook(() => useCreateBatch(), { wrapper });
    result.current.mutate({} as never);
    await waitFor(() => expect(invalidated(stockKeys.items(''))).toBe(true));
    expect(invalidated(expensesKeys.list({}))).toBe(false);
  });
});
