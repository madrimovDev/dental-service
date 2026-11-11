import { fireEvent, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderApp } from '../../../test-utils';
import { ReportsScreen } from './ReportsScreen';

const ok = <T,>(data: T) => ({ data, isLoading: false, isError: false, refetch: vi.fn() });

const hooks = vi.hoisted(() => ({
  ws: { current: undefined as unknown },
  revenueCalls: [] as unknown[],
  debtCalls: [] as unknown[],
}));

vi.mock('@/features/auth', () => ({ useWorkspaceBranches: () => hooks.ws.current }));
vi.mock('@/features/appointments/appointments.api', () => ({
  useDoctors: () => ({ data: [{ id: 'd1', name: 'Dr. Ali' }] }),
}));
vi.mock('../reports.api', () => ({
  useOwnerTodayReport: () =>
    ok({
      date: '2026-11-11',
      netTotal: 1_500_000,
      refunded: 100_000,
      byPaymentMethod: [{ paymentMethod: 'cash', total: 1_500_000 }],
      branches: [
        {
          branchId: 'b1',
          name: 'Markaz',
          netRevenue: 1_500_000,
          patients: 7,
          occupancy: 0.5,
          status: 'active',
        },
      ],
      doctors: [],
    }),
  useRevenueReport: (range: unknown, opts: unknown) => {
    hooks.revenueCalls.push({ range, opts });
    return ok({
      total: 9_000_000,
      byBranch: [],
      byService: [{ serviceName: 'Plomba', total: 600_000 }],
      byDoctor: [],
      byPeriod: [{ date: '2026-01-02', total: 500_000 }],
      byPaymentMethod: [],
    });
  },
  useDebtAgingReport: (opts: unknown) => {
    hooks.debtCalls.push(opts);
    return ok({
      totalDebt: 18_400_000,
      patientCount: 64,
      over90Count: 12,
      buckets: [
        { key: 'd0_30', amount: 7_200_000, patients: 30 },
        { key: 'd31_60', amount: 3_400_000, patients: 12 },
        { key: 'd61_90', amount: 1_700_000, patients: 10 },
        { key: 'd90_plus', amount: 6_100_000, patients: 12 },
      ],
    });
  },
  useOneCExport: () => ({ data: undefined, isFetching: false, refetch: vi.fn() }),
  useDentalAnalytics: () => ok(undefined),
  useDoctorWorkload: () => ok([]),
  useAppointmentStats: () => ok(undefined),
  usePlanCompletion: () => ok(undefined),
}));

const owner = {
  data: {
    branches: [
      { id: 'b1', name: 'Markaz' },
      { id: 'b2', name: 'Chilonzor' },
    ],
    allowAllBranches: true,
  },
};
const manager = { data: { branches: [{ id: 'b1', name: 'Markaz' }], allowAllBranches: false } };

describe('ReportsScreen (UI-M2)', () => {
  beforeEach(() => {
    hooks.revenueCalls.length = 0;
    hooks.debtCalls.length = 0;
    localStorage.clear();
  });

  it('rahbar: savollar ro‘yxati, birinchi savol «Bugun» javobi, «Qarz» savoliga o‘tadi', () => {
    hooks.ws.current = owner;
    renderApp(<ReportsScreen />, { route: '/reports' });
    expect(screen.getByRole('heading', { level: 1, name: 'Hisobotlar' })).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Savollar' })).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 2, name: 'Bugun qancha tushdi?' }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Bugun sof tushum 1\s*500\s*000/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Kim qarzdor?' }));
    expect(screen.getByText(/64 bemor jami/)).toBeInTheDocument();
    expect(screen.getByText('Qanday hisoblandi?')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Excel' })).toBeInTheDocument();
  });

  it('URL’dagi davr va savol qo‘llanadi (so‘rov shu oraliq bilan ketadi)', () => {
    hooks.ws.current = owner;
    renderApp(<ReportsScreen />, {
      route: '/reports?q=revenue&from=2026-01-01&to=2026-01-31&branch=b2',
    });
    expect(
      screen.getByRole('heading', { level: 2, name: "Davr bo'yicha qancha tushdi?" }),
    ).toBeInTheDocument();
    const last = hooks.revenueCalls.at(-1) as { range: Record<string, string> };
    expect(last.range).toEqual({ from: '2026-01-01', to: '2026-01-31', branchId: 'b2' });
    expect(screen.getByRole('button', { name: '1C eksport' })).toBeInTheDocument();
  });

  it('filialga tayinlangan xodim: tenant-darajali savollar aria-disabled, qarz so‘rovi yuborilmaydi, filial qulflangan', () => {
    hooks.ws.current = manager;
    renderApp(<ReportsScreen />, { route: '/reports?q=debt' });
    const debt = screen.getByRole('button', { name: /Kim qarzdor\?/ });
    expect(debt).toHaveAttribute('aria-disabled', 'true');
    // yopiq savol URL'da berilgan bo'lsa ham ochilmaydi — birinchi ochiq savolga qaytadi
    expect(
      screen.getByRole('heading', { level: 2, name: 'Bugun qancha tushdi?' }),
    ).toBeInTheDocument();
    expect(hooks.debtCalls).toHaveLength(0);
    expect(screen.getByTestId('report-scope-note')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Filial' })).toBeDisabled();
    // ochiq savol bosiladi
    fireEvent.click(screen.getByRole('button', { name: 'Kim qancha ishladi?' }));
    expect(
      screen.getByRole('heading', { level: 2, name: 'Kim qancha ishladi?' }),
    ).toBeInTheDocument();
  });

  it('filial ma‘lumoti kelmaguncha hech qanday hisobot so‘rovi yoqilmaydi', () => {
    hooks.ws.current = { data: undefined };
    renderApp(<ReportsScreen />, { route: '/reports?q=revenue' });
    // ready=false → enabled:false
    const last = hooks.revenueCalls.at(-1) as { opts: { enabled: boolean } } | undefined;
    expect(last?.opts.enabled ?? false).toBe(false);
  });
});
