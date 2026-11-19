import { fireEvent, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderApp } from '../test-utils';
import { Sidebar } from './Sidebar';

/**
 * FX-74 — «Barcha filiallar» bandi sidebar menyusida yo'q: workspace almashtirish `branchId`siz
 * eng eski filialga o'tkazadi (yorliq natijaga mos emas). Faqat aniq filiallar tanlanadi.
 */
let mockActiveBranchId: string | null = 'b1';
const mutate = vi.fn();

vi.mock('@/features/license', () => ({ useLicenseStatus: () => ({ data: undefined }) }));
vi.mock('@/stores/auth-store.ts', () => ({
  useAuthStore: (sel?: (s: unknown) => unknown) => {
    const state = {
      hasPermission: () => true,
      permissions: ['@owner'],
      roleKey: null,
      activeBranchId: mockActiveBranchId,
      activeTenantId: 'tenant1',
      user: { fullName: 'Owner', phone: '+998901234567' },
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
    sel({ sidebarRail: false, toggleSidebarRail: () => {} }),
}));
vi.mock('@/features/auth', () => ({
  useWorkspaceBranches: () => ({
    data: {
      branches: [
        { id: 'b1', name: 'Markaz' },
        { id: 'b2', name: 'Chilonzor' },
      ],
      allowAllBranches: true,
    },
  }),
  useSwitchWorkspace: () => ({ mutate, isPending: false }),
  useBranchSwitch: () => ({ mutate, isPending: false }),
}));

afterEach(() => {
  mockActiveBranchId = 'b1';
  mutate.mockClear();
});

describe('Sidebar filial menyusi (FX-74)', () => {
  it("allowAllBranches=true bo'lsa ham «Barcha filiallar» bandi yo'q — faqat aniq filiallar", async () => {
    renderApp(<Sidebar />);
    fireEvent.click(screen.getByRole('button', { name: 'Filialni tanlash' }));
    expect(await screen.findByRole('menuitem', { name: 'Chilonzor' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Markaz' })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'Barcha filiallar' })).toBeNull();
    expect(screen.getAllByRole('menuitem')).toHaveLength(2);
  });

  it("faol filial yo'q bo'lsa sarlavha «Barcha filiallar» demaydi", () => {
    mockActiveBranchId = null;
    renderApp(<Sidebar />);
    expect(screen.queryByText('Barcha filiallar')).toBeNull();
  });
});
