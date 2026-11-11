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
  useDebtAging: () => ({
    data: {
      totalDebt: 800_000,
      patientCount: 2,
      over90Count: 1,
      buckets: [{ key: 'd90_plus', amount: 600_000, patients: 1 }],
    },
  }),
  useBackupStatus: () => ({
    data: {
      mode: 'desktop',
      folder: 'D:\\DentalBackup',
      lastSuccessAt: '2020-01-01T00:00:00Z',
      lastError: null,
      files: [],
    },
  }),
  useBranchNames: () => ({ data: new Map([['b1', 'Markaziy filial']]) }),
  useDoctorNames: () => ({ data: new Map([['d1', 'Doktor Salimov']]) }),
}));

vi.mock('@/features/license/license.api.ts', () => ({
  useLicenseStatus: () => ({
    data: { state: 'expiring', daysLeft: 9, mode: 'desktop', expiresAt: null, graceEndsAt: null },
  }),
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
    // no-show 10%, slot 80%, qarz 800 000
    expect(screen.getByText('10%')).toBeInTheDocument();
    expect(screen.getByText('80%')).toBeInTheDocument();
    expect(screen.getByText(/800\D?000/)).toBeInTheDocument();

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

describe('ManagerDashboard (UI-M1 masalalar paneli)', () => {
  it('zaxira kritik, litsenziya va qarz diqqat darajasida ko‘rinadi', async () => {
    const { ManagerDashboard } = await import('./ManagerDashboard.tsx');
    renderApp(<ManagerDashboard />);

    expect(screen.getByText('Siz hal qiladigan masalalar')).toBeInTheDocument();
    expect(screen.getByTestId('owner-alert-backup')).toHaveAttribute('data-level', 'critical');
    expect(screen.getByTestId('owner-alert-license')).toHaveAttribute('data-level', 'warning');
    expect(screen.getByTestId('owner-alert-debt')).toHaveAttribute('data-level', 'warning');
    // daraja matn yorlig'i ham bor (faqat rang emas)
    expect(screen.getAllByText('Diqqat').length).toBeGreaterThan(0);
  });
});
