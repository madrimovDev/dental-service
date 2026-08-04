import { screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { i18n } from '@/lib/i18n.ts';
import { renderApp } from '../../../test-utils';
import { RegisterTenantPage } from './register-tenant.page';

// `vi.mock` factory BUTUN modulni almashtiradi — sahifa ishlatadigan HAR bir
// hook shu yerda bo'lishi shart, aks holda "not a function" xatosi chiqadi.
const registrationEnabled = vi.hoisted(() => ({
  value: { data: { enabled: true }, isLoading: false } as {
    data?: { enabled: boolean };
    isLoading: boolean;
  },
}));

vi.mock('../auth.api', () => ({
  useRegisterTenant: () => ({ mutate: vi.fn(), isPending: false }),
  useRegistrationEnabled: () => registrationEnabled.value,
}));

afterEach(() => {
  delete window.dentalDesktop;
  registrationEnabled.value = { data: { enabled: true }, isLoading: false };
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

  it('server enabled=false qaytarsa (desktop backend) — forma render qilinmaydi', () => {
    registrationEnabled.value = { data: { enabled: false }, isLoading: false };
    renderApp(<RegisterTenantPage />);
    expect(screen.queryByText(i18n.t('auth.register.title'))).not.toBeInTheDocument();
  });

  it("javob kutilayotganda — forma HALI ko'rsatilmaydi (yaltirab o'tishning oldini oladi)", () => {
    registrationEnabled.value = { data: undefined, isLoading: true };
    renderApp(<RegisterTenantPage />);
    expect(screen.queryByText(i18n.t('auth.register.title'))).not.toBeInTheDocument();
  });
});
