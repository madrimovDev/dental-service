import { ROLE_TEMPLATES } from '@dental/core';
import { screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderApp } from '../test-utils';
import { Sidebar } from './Sidebar';

const DEFAULT_PERMS = ['patient.view'];
let mockPermissions: string[] = [...DEFAULT_PERMS];
let mockRoleKey: string | null = null;
let mockRail = false;
let mockLicense: { data?: { mode: string; state: string }; isError?: boolean } = {
  data: { mode: 'desktop', state: 'active' },
};

const templatePerms = (key: string): string[] => [
  ...(ROLE_TEMPLATES.find((r) => r.templateKey === key)?.permissions ?? []),
];

vi.mock('@/features/license', () => ({ useLicenseStatus: () => mockLicense }));

vi.mock('@/stores/auth-store.ts', () => ({
  useAuthStore: (sel?: (s: unknown) => unknown) => {
    const state = {
      hasPermission: (p: string) =>
        mockPermissions.includes('@owner') || mockPermissions.includes(p),
      permissions: mockPermissions,
      roleKey: mockRoleKey,
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
  mockPermissions = [...DEFAULT_PERMS];
  mockRoleKey = null;
  mockRail = false;
  mockLicense = { data: { mode: 'desktop', state: 'active' } };
});

describe('Sidebar', () => {
  it("ruxsatli LIVE element ko'rsatadi, ruxsatsizni yashiradi", () => {
    renderApp(<Sidebar />);
    expect(screen.getByText("Bemorlar ro'yxati")).toBeInTheDocument(); // patient.view bor
    expect(screen.queryByText('Kassa')).toBeNull(); // cashier.view yo'q
  });

  // `4ce4b07` transactions'ni FUTURE'dan LIVE'ga chiqargan (permission: cashier.view) —
  // endi u ruxsat bilan boshqariladi, owner-only disabled element emas.
  it('transactions ruxsatsiz yashirin, cashier.view bilan haqiqiy link (4ce4b07 dan keyin)', () => {
    renderApp(<Sidebar />);
    expect(screen.queryByText('Tranzaksiyalar')).toBeNull();

    mockPermissions = ['cashier.view'];
    renderApp(<Sidebar />);
    const transactions = screen.getAllByText('Tranzaksiyalar')[0];
    expect(transactions?.closest('a')).not.toBeNull();
    expect(transactions?.closest('[aria-disabled="true"]')).toBeNull();
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

  // UI-0 1.5 — rolga moslashuvchi menyu, real rol shablonlari bilan (@owner emas)
  describe('rolga moslashuvchi menyu', () => {
    it("Receptionist: Bugungi ish / Bemorlar va pul; 'Sozlamalar' menyuda yo'q", () => {
      mockRoleKey = 'receptionist';
      mockPermissions = templatePerms('receptionist');
      renderApp(<Sidebar />);
      expect(screen.getByText('Bugungi ish')).toBeInTheDocument();
      expect(screen.getByText('Bemorlar va pul')).toBeInTheDocument();
      expect(screen.getByText('Qayta chaqiruv')).toBeInTheDocument();
      expect(screen.queryByText('Sozlamalar')).toBeNull();
      expect(screen.getByTestId('sidebar-role').textContent).toBe('Registrator');
    });

    it('Doctor: Mening kunim + Davolash guruhi', () => {
      mockRoleKey = 'doctor';
      mockPermissions = templatePerms('doctor');
      renderApp(<Sidebar />);
      expect(screen.getByText('Mening kunim')).toBeInTheDocument();
      expect(screen.getByText('Davolash')).toBeInTheDocument();
      expect(screen.getByText('Davolash rejalari')).toBeInTheDocument();
      expect(screen.queryByText('Kassa')).toBeNull();
    });

    it('Tenant Admin: Boshqaruv + Sozlamalar pastda', () => {
      mockRoleKey = 'tenant_admin';
      mockPermissions = templatePerms('tenant_admin');
      renderApp(<Sidebar />);
      expect(screen.getByText('Umumiy')).toBeInTheDocument();
      expect(screen.getByText('Hisobotlar')).toBeInTheDocument();
      expect(screen.getByText('Sozlamalar').closest('a')?.getAttribute('href')).toBe(
        '/settings/tenant',
      );
    });

    it('Owner (@owner, roleKey yoq): rahbar maketi, rol nomi Klinika egasi', () => {
      mockPermissions = ['@owner'];
      renderApp(<Sidebar />);
      expect(screen.getByText('Boshqaruv')).toBeInTheDocument();
      expect(screen.getByText('Sozlamalar')).toBeInTheDocument();
      expect(screen.getByTestId('sidebar-role').textContent).toBe('Klinika egasi');
    });

    it('Technician: faqat Buyurtmalar', () => {
      mockRoleKey = 'technician';
      mockPermissions = templatePerms('technician');
      renderApp(<Sidebar />);
      expect(screen.getByText('Laboratoriya')).toBeInTheDocument();
      expect(screen.getByText('Buyurtmalar')).toBeInTheDocument();
      expect(screen.queryByText('Kassa')).toBeNull();
    });

    it("Custom rol (patient.view + appointment.view): menyu bo'sh emas", () => {
      mockPermissions = ['patient.view', 'appointment.view'];
      renderApp(<Sidebar />);
      expect(screen.getByText("Bemorlar ro'yxati")).toBeInTheDocument();
      expect(screen.getByText('Kalendar')).toBeInTheDocument();
    });
  });

  describe('ConnectionStatus (menyu pastida)', () => {
    it('desktop -> Server ulangan', () => {
      renderApp(<Sidebar />);
      expect(screen.getByText('Server ulangan')).toBeInTheDocument();
    });
    it('cloud -> Bulut', () => {
      mockLicense = { data: { mode: 'cloud', state: 'none' } };
      renderApp(<Sidebar />);
      expect(screen.getByText('Bulut')).toBeInTheDocument();
    });
    it('server javob bermasa -> Server topilmadi', () => {
      mockLicense = { isError: true };
      renderApp(<Sidebar />);
      expect(screen.getByText('Server topilmadi')).toBeInTheDocument();
    });
    it("rail rejimida matn yo'q, lekin holat nomi aria-label'da", () => {
      mockRail = true;
      renderApp(<Sidebar />);
      expect(screen.queryByText('Server ulangan')).toBeNull();
      expect(screen.getByLabelText('Server ulangan')).toBeInTheDocument();
    });
  });
});
