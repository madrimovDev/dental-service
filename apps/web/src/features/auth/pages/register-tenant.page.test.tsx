import { screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { i18n } from '@/lib/i18n.ts';
import { renderApp } from '../../../test-utils';
import { RegisterTenantPage } from './register-tenant.page';

vi.mock('../auth.api', () => ({
  useRegisterTenant: () => ({ mutate: vi.fn(), isPending: false }),
}));

afterEach(() => {
  delete window.dentalDesktop;
});

describe("RegisterTenantPage — Local Desktop'da o'z-o'zini ro'yxatdan o'tkazish bloklanishi", () => {
  it("window.dentalDesktop yo'q bo'lsa (brauzer) — forma ko'rinadi", () => {
    renderApp(<RegisterTenantPage />);
    expect(screen.getByText(i18n.t('auth.register.title'))).toBeInTheDocument();
  });

  it("window.dentalDesktop mavjud bo'lsa (Local Desktop) — forma render qilinmaydi (/login'ga redirect)", () => {
    window.dentalDesktop = {
      setServerUrl: async () => ({ ok: true, connected: true, serverUrl: 'x' }),
    };
    renderApp(<RegisterTenantPage />);
    expect(screen.queryByText(i18n.t('auth.register.title'))).not.toBeInTheDocument();
  });
});
