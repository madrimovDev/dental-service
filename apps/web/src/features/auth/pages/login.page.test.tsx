import { screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { i18n } from '@/lib/i18n.ts';
import { renderApp } from '../../../test-utils';
import { LoginPage } from './login.page';

vi.mock('../auth.api', () => ({
  useLogin: () => ({ mutate: vi.fn(), isPending: false }),
}));

vi.mock('@/stores/auth-store.ts', () => ({
  useAuthStore: () => ({ setTokens: vi.fn(), setUser: vi.fn() }),
}));

afterEach(() => {
  delete window.dentalDesktop;
});

describe("LoginPage — desktop'da \"ro'yxatdan o'tish\" havolasi yashirilishi", () => {
  it("window.dentalDesktop yo'q bo'lsa (brauzer) — havola ko'rinadi", () => {
    renderApp(<LoginPage />);
    expect(screen.getByText(i18n.t('auth.login.register_clinic'))).toBeInTheDocument();
  });

  it("window.dentalDesktop mavjud bo'lsa (Local Desktop) — havola ko'rinmaydi", () => {
    window.dentalDesktop = {
      setServerUrl: async () => ({ ok: true, connected: true, serverUrl: 'x' }),
    };
    renderApp(<LoginPage />);
    expect(screen.queryByText(i18n.t('auth.login.register_clinic'))).not.toBeInTheDocument();
  });
});
