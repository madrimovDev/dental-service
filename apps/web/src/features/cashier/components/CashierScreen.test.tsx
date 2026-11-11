import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderApp } from '../../../test-utils';
import { CashierScreen } from './CashierScreen';

// usePatientsAll chaqiruv argumentini (search) kuzatamiz — CLI-454: debounced
// server-search pageSize:100 bilan cheklangan static ro'yxat o'rniga.
const usePatientsAllSpy = vi.hoisted(() =>
  vi.fn((_search?: string) => ({ data: { data: [{ id: 'p1', fullName: 'Ali Valiyev' }] } })),
);

const pendingVisitsData: unknown[] = [];

vi.mock('../cashier.api', () => ({
  useBranches: () => ({ data: [{ id: 'b1', name: 'Markaziy' }] }),
  useServices: () => ({ data: [] }),
  usePatientsAll: (search?: string) => usePatientsAllSpy(search),
  useTodayTransactions: () => ({ data: { data: [], meta: { page: 1, pageSize: 100, total: 0 } } }),
  useDailySummary: () => ({ data: null }),
  usePendingVisits: () => ({ data: pendingVisitsData }),
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
  // FX-handoff: imzolangan vizit kassada ko'rinadi; «Kassaga olish» bemorni tanlaydi va banner chiqaradi.
  it('kutilayotgan vizit: ro‘yxatda ko‘rinadi, «Kassaga olish» bemorni tanlaydi', async () => {
    pendingVisitsData.push({
      visitNoteId: 'v1',
      patientId: 'p9',
      patientName: 'Laylo Ismoilova',
      doctorId: 'd1',
      doctorName: 'Karimov',
      signedAt: '2026-11-11T08:00:00Z',
      services: [
        { serviceId: 's1', serviceName: 'Konsultatsiya', quantity: 1, unitPrice: '50000' },
      ],
      total: '50000',
      hasUnpriced: false,
    });
    try {
      renderApp(<CashierScreen />);
      expect(screen.getByTestId('pending-visits')).toBeTruthy();
      fireEvent.click(screen.getByText('Kassaga olish'));
      await waitFor(() => expect(screen.getByDisplayValue('Laylo Ismoilova')).toBeTruthy());
      expect(await screen.findByTestId('visit-banner')).toBeTruthy();
    } finally {
      pendingVisitsData.length = 0;
    }
  });
});
