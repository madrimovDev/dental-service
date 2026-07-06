import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { i18n } from '@/lib/i18n.ts';
import { renderApp } from '../../../test-utils';
import { SelectWorkspacePage } from './select-workspace.page';

// useMe/useSwitchWorkspace'ni mock qilamiz — real API/auth-store'ga tegmaslik uchun
// (auth.api.ts ichida useMe accessToken'ga bog'liq, useSwitchWorkspace refreshToken
// talab qiladi — bu test faqat render/i18n'ni tekshiradi, mutation oqimini emas).
vi.mock('../auth.api', () => ({
  useMe: () => ({
    isLoading: false,
    data: {
      assignments: [
        {
          tenantId: 't1',
          tenantName: 'Tish Klinikasi',
          tenantSlug: 'tish-klinikasi',
          branchId: 'b1',
          branchName: 'Asosiy filial',
          roleName: 'Bosh shifokor',
          isOwner: true,
        },
      ],
      ownerTenants: [],
    },
  }),
  useSwitchWorkspace: () => ({ mutate: vi.fn(), isPending: false }),
}));

vi.mock('@/stores/auth-store.ts', () => ({
  // activeTenantId non-null qasddan — auto-select useEffect (bir dona option
  // bo'lsa switchMut.mutate() avtomatik chaqiradi) shart bo'yicha skip qilinadi
  // (bu ticket faqat static render/i18n'ni tekshiradi, auto-select oqimini emas).
  useAuthStore: () => ({
    activeTenantId: 't1',
    clear: vi.fn(),
    setTokens: vi.fn(),
    setContext: vi.fn(),
  }),
}));

describe('SelectWorkspacePage — CLI-373 owner badge i18n', () => {
  it("egasi bejchasi tarjima qilingan matn bilan ko'rinadi, literal 'Owner' emas", () => {
    renderApp(<SelectWorkspacePage />);

    expect(screen.getByText(i18n.t('auth.select_workspace.owner_badge'))).toBeInTheDocument();
    expect(screen.queryByText('Owner')).not.toBeInTheDocument();
  });
});
