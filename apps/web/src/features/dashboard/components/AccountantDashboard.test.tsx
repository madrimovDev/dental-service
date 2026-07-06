import { screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderApp } from '../../../test-utils';

// --- Mocklar (T4 characterization: re-skin xulqni o'zgartirmaydi) ---

const mockHasPermission = vi.fn((_p: string) => true);

vi.mock('@/stores/auth-store.ts', () => ({
  useAuthStore: () => ({
    activeBranchId: 'b1',
    hasPermission: (p: string) => mockHasPermission(p),
  }),
}));

vi.mock('../dashboard.api.ts', () => ({
  useDefaultPeriod: () => ({ from: '2026-05-24', to: '2026-06-22' }),
  useRevenueReport: () => ({
    data: {
      total: 4_200_000,
      byService: [{ serviceName: 'Tozalash', total: 1_200_000 }],
    },
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
}));

vi.mock('@/features/cashier/cashier.api.ts', () => ({
  useDailySummary: () => ({
    data: {
      breakdown: [{ paymentMethod: 'cash', type: 'income', total: '900000', count: 3 }],
    },
  }),
}));

afterEach(() => {
  mockHasPermission.mockClear();
  mockHasPermission.mockImplementation(() => true);
});

describe('AccountantDashboard (DS1-T4 re-skin characterization)', () => {
  it('revenue KPI + kunlik kassa breakdown qatorini render qiladi', async () => {
    const { AccountantDashboard } = await import('./AccountantDashboard.tsx');
    renderApp(<AccountantDashboard />);

    // KPI label'lari (real i18n) — revenue_total + daily_cash StatCard'lari render bo'ladi
    expect(screen.getByText('Umumiy daromad')).toBeInTheDocument();
    // revenue_total qiymati (4 200 000) — suffiksdan qat'i nazar raqam ko'rinadi
    expect(screen.getByText(/4\D?200\D?000/)).toBeInTheDocument();
    // daily_cash qiymati (900 000 = breakdown total) — KPI kartasi + breakdown qatorida ko'rinadi
    expect(screen.getAllByText(/900\D?000/).length).toBeGreaterThan(0);
    // by-service BarMini (haftalik tushum kartasi) saqlanadi
    expect(screen.getByText('Tozalash')).toBeInTheDocument();
    // kunlik kassa breakdown qatori (paymentMethod · type) saqlanadi
    expect(screen.getByText('cash · income')).toBeInTheDocument();
  });

  it('ruxsat bo‘lganda «Yangi yozilish» + «Kassa» tugmalarini ko‘rsatadi', async () => {
    const { AccountantDashboard } = await import('./AccountantDashboard.tsx');
    renderApp(<AccountantDashboard />);

    expect(screen.getByText('Yangi yozilish').closest('a')).toHaveAttribute(
      'href',
      '/appointments',
    );
    expect(screen.getByText('Kassa').closest('a')).toHaveAttribute('href', '/cashier');
  });

  it('appointment/cashier ruxsati yo‘q rolda tugmalar ko‘rinmaydi', async () => {
    mockHasPermission.mockImplementation(() => false);
    const { AccountantDashboard } = await import('./AccountantDashboard.tsx');
    renderApp(<AccountantDashboard />);

    expect(screen.queryByText('Yangi yozilish')).not.toBeInTheDocument();
    expect(screen.queryByText('Kassa')).not.toBeInTheDocument();
    // breakdown qatori hali ham render bo'ladi (xulq saqlanadi)
    expect(screen.getByText('cash · income')).toBeInTheDocument();
  });
});
