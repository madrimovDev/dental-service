import { screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderApp } from '../test-utils';
import { Sidebar } from './Sidebar';

let mockPermissions: string[] = [];
let mockRail = false;

vi.mock('@/stores/auth-store.ts', () => ({
  useAuthStore: (sel?: (s: unknown) => unknown) => {
    const state = {
      hasPermission: (p: string) =>
        mockPermissions.includes('@owner') || mockPermissions.includes(p) || p === 'patient.view',
      permissions: mockPermissions,
      activeBranchId: 'b1',
      activeTenantId: 'tenant1',
      user: { fullName: 'Firdavs Tursunov', phone: '+998901234567' },
      refreshToken: 'r',
      clear: vi.fn(),
      setTokens: vi.fn(),
      setContext: vi.fn(),
    };
    return sel ? sel(state) : state;
  },
}));

vi.mock('@/stores/ui-store.ts', () => ({
  useUiStore: (sel: (s: { sidebarRail: boolean; toggleSidebarRail: () => void }) => unknown) =>
    sel({ sidebarRail: mockRail, toggleSidebarRail: () => {} }),
}));

// BranchSwitcher logikasi sidebar'ga ko'chdi — hooks mock qilinadi
vi.mock('@/features/auth', () => ({
  useWorkspaceBranches: () => ({ data: null }),
  useSwitchWorkspace: () => ({ mutate: vi.fn(), isPending: false }),
  useBranchSwitch: () => ({ mutate: vi.fn(), isPending: false }),
}));

afterEach(() => {
  mockPermissions = [];
  mockRail = false;
});

describe('Sidebar', () => {
  it("ruxsatli LIVE element ko'rsatadi, ruxsatsizni yashiradi", () => {
    renderApp(<Sidebar />);
    expect(screen.getByText("Bemorlar ro'yxati")).toBeInTheDocument(); // patient.view bor
    expect(screen.queryByText('Kassa')).toBeNull(); // cashier.view yo'q
  });

  it('FUTURE (disabled) element non-owner uchun yashirin (CLI-161)', () => {
    renderApp(<Sidebar />);
    expect(screen.queryByText('Tranzaksiyalar')).toBeNull(); // transactions FUTURE — owner emas
  });

  it("FUTURE (disabled) element owner uchun aria-disabled bilan ko'rinadi (CLI-161)", () => {
    mockPermissions = ['@owner'];
    renderApp(<Sidebar />);
    const transactions = screen.getByText('Tranzaksiyalar');
    expect(transactions.closest('[aria-disabled="true"]')).not.toBeNull();
  });

  it("R4 LIVE element permission bilan haqiqiy link sifatida ko'rinadi (FUTURE emas)", () => {
    mockPermissions = ['payroll.view'];
    renderApp(<Sidebar />);
    const payroll = screen.getByText('Ish haqi');
    expect(payroll.closest('a')).not.toBeNull(); // <Link> — bosib bo'ladi
    expect(payroll.closest('[aria-disabled="true"]')).toBeNull(); // disabled EMAS
  });

  it("guruh sarlavhasini ko'rsatadi", () => {
    renderApp(<Sidebar />);
    expect(screen.getByText('Asosiy')).toBeInTheDocument(); // nav.group.asosiy
  });

  it("rail rejimida ildiz elementda data-rail='true' atributi bo'ladi", () => {
    mockRail = true;
    const { container } = renderApp(<Sidebar />);
    expect(container.querySelector('[data-rail="true"]')).toBeTruthy();
  });

  it("oddiy rejimda data-rail atributi bo'lmaydi", () => {
    mockRail = false;
    const { container } = renderApp(<Sidebar />);
    expect(container.querySelector('[data-rail="true"]')).toBeNull();
  });

  // DS0 Task 5 — workspace switcher + footer smoke tests
  it("sidebar header'da klinika nomi (workspace switcher) ko'rinadi", () => {
    renderApp(<Sidebar />);
    expect(screen.getByTestId('sidebar-clinic-name')).toBeInTheDocument();
  });

  it("sidebar footer'da logout tugmasi bor", () => {
    renderApp(<Sidebar />);
    expect(screen.getByTestId('sidebar-logout')).toBeInTheDocument();
  });

  it("sidebar footer'da foydalanuvchi ismi ko'rinadi (expanded rejim)", () => {
    mockRail = false;
    renderApp(<Sidebar />);
    expect(screen.getByText('Firdavs Tursunov')).toBeInTheDocument();
  });
});
