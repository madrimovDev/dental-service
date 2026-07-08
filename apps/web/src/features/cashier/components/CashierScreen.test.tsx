import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderApp } from '../../../test-utils';
import { CashierScreen } from './CashierScreen';

// usePatientsAll chaqiruv argumentini (search) kuzatamiz — CLI-454: debounced
// server-search pageSize:100 bilan cheklangan static ro'yxat o'rniga.
const usePatientsAllSpy = vi.hoisted(() =>
  vi.fn((_search?: string) => ({ data: { data: [{ id: 'p1', fullName: 'Ali Valiyev' }] } })),
);

vi.mock('../cashier.api', () => ({
  useBranches: () => ({ data: [{ id: 'b1', name: 'Markaziy' }] }),
  useServices: () => ({ data: [] }),
  usePatientsAll: (search?: string) => usePatientsAllSpy(search),
  useTodayTransactions: () => ({ data: { data: [], meta: { page: 1, pageSize: 100, total: 0 } } }),
  useDailySummary: () => ({ data: null }),
  useCreateTransaction: () => ({ mutate: vi.fn(), isPending: false }),
  usePatientPlans: () => ({ data: [] }),
  usePlanBalance: () => ({ data: null }),
  useRefund: () => ({ mutate: vi.fn(), isPending: false }),
  fetchServicePrices: vi.fn(),
}));

vi.mock('@/stores/auth-store.ts', () => ({
  useAuthStore: () => ({ hasPermission: () => true, activeBranchId: 'b1' }),
}));

// debounce'ni o'tkazib, qidiruv darhol uzatilsin (CommandPalette.test.tsx naqshi).
vi.mock('@mantine/hooks', async (orig) => {
  const actual = (await orig()) as Record<string, unknown>;
  return { ...actual, useDebouncedValue: (v: unknown) => [v] };
});

describe('CashierScreen', () => {
  it('sarlavha + rejim segmenti (erkin/plan) render', () => {
    renderApp(<CashierScreen />);
    expect(screen.getByText('Kassa')).toBeTruthy();
    // SegmentedControl rejimlari.
    expect(screen.getByText("Erkin to'lov")).toBeTruthy();
    expect(screen.getByText('Davolash rejasi')).toBeTruthy();
  });

  // CLI-454: avval bemor Select faqat oldindan yuklangan (pageSize:100, qidiruvsiz)
  // ro'yxatni client-side filtrlar edi — 100 tadan ortiq bemorli tenant'da kerakli
  // bemor ko'rinmasdi. Endi qidiruv matni debounced holda `usePatientsAll`ga uzatiladi.
  it("bemor qidiruv input o'zgarganda usePatientsAll debounced search bilan chaqiriladi", async () => {
    renderApp(<CashierScreen />);
    const input = screen.getByPlaceholderText('Bemorni tanlash...');
    fireEvent.change(input, { target: { value: 'Vali' } });
    await waitFor(() => expect(usePatientsAllSpy).toHaveBeenCalledWith('Vali'));
  });
});
