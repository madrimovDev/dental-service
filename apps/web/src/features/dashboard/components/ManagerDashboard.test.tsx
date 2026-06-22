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

// OnboardingChecklist — admin-only; bu yerda render qilinmasin (tenant_settings.edit yo'q deb qaytaramiz).
vi.mock('./OnboardingChecklist.tsx', () => ({
  OnboardingChecklist: () => null,
}));

const managerKpi = {
  revenue: {
    data: {
      total: 5_000_000,
      byBranch: [{ branchId: 'b1', total: 3_000_000 }],
      byService: [{ serviceName: 'Implant', total: 2_000_000 }],
    },
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  },
  appointments: {
    data: { noShowRate: 0.1, slotUtilization: 0.8 },
    isLoading: false,
    isError: false,
  },
  doctors: { data: [{ doctorId: 'd1', completed: 4, total: 5 }], isLoading: false, isError: false },
  treatmentPlans: { data: { rate: 0.6 }, isLoading: false, isError: false },
};

vi.mock('../dashboard.api.ts', () => ({
  useDefaultPeriod: () => ({ from: '2026-05-24', to: '2026-06-22' }),
  useManagerKpi: () => managerKpi,
  useBranchNames: () => ({ data: new Map([['b1', 'Markaziy filial']]) }),
  useDoctorNames: () => ({ data: new Map([['d1', 'Doktor Salimov']]) }),
}));

afterEach(() => {
  mockHasPermission.mockClear();
  mockHasPermission.mockImplementation(() => true);
});

describe('ManagerDashboard (DS1-T4 re-skin characterization)', () => {
  it('KPI qiymatlarini va ro‘yxat qatorlarini render qiladi', async () => {
    const { ManagerDashboard } = await import('./ManagerDashboard.tsx');
    renderApp(<ManagerDashboard />);

    // KPI label'lari (real i18n) + qiymatlari ko'rinadi
    expect(screen.getByText('Umumiy daromad')).toBeInTheDocument();
    // revenue_total qiymati (5 000 000) — formatCurrency suffiksdan qat'i nazar raqam ko'rinadi
    expect(screen.getByText(/5\D?000\D?000/)).toBeInTheDocument();
    // no-show 10%, slot 80%, reja 60%
    expect(screen.getByText('10%')).toBeInTheDocument();
    expect(screen.getByText('80%')).toBeInTheDocument();
    expect(screen.getByText('60%')).toBeInTheDocument();

    // ro'yxat qatorlari — branch + doctor nomlari (name-map mapper saqlanadi)
    expect(screen.getByText('Markaziy filial')).toBeInTheDocument();
    expect(screen.getByText('Doktor Salimov')).toBeInTheDocument();
    expect(screen.getByText('4/5')).toBeInTheDocument();

    // by-service BarMini (haftalik tushum kartasi ichida) saqlanadi
    expect(screen.getByText('Implant')).toBeInTheDocument();
  });

  it('ruxsat bo‘lganda «Yangi yozilish» + «Kassa» tugmalarini ko‘rsatadi', async () => {
    const { ManagerDashboard } = await import('./ManagerDashboard.tsx');
    renderApp(<ManagerDashboard />);

    const newAppt = screen.getByText('Yangi yozilish').closest('a');
    const cashier = screen.getByText('Kassa').closest('a');
    expect(newAppt).toHaveAttribute('href', '/appointments');
    expect(cashier).toHaveAttribute('href', '/cashier');
  });

  it('appointment/cashier ruxsati yo‘q rolda tugmalar ko‘rinmaydi', async () => {
    mockHasPermission.mockImplementation(() => false);
    const { ManagerDashboard } = await import('./ManagerDashboard.tsx');
    renderApp(<ManagerDashboard />);

    expect(screen.queryByText('Yangi yozilish')).not.toBeInTheDocument();
    expect(screen.queryByText('Kassa')).not.toBeInTheDocument();
    // KPI hali ham render bo'ladi (xulq saqlanadi)
    expect(screen.getByText('10%')).toBeInTheDocument();
  });
});
