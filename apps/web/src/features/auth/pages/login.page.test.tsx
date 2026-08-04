import { screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { i18n } from '@/lib/i18n.ts';
import { renderApp } from '../../../test-utils';
import { LoginPage } from './login.page';

// `vi.mock` factory BUTUN modulni almashtiradi — sahifa ishlatadigan HAR bir
// hook shu yerda bo'lishi shart, aks holda "not a function" xatosi chiqadi.
const registrationEnabled = vi.hoisted(() => ({
  value: { data: { enabled: true }, isLoading: false } as {
    data?: { enabled: boolean };
    isLoading: boolean;
  },
}));

vi.mock('../auth.api', () => ({
  useLogin: () => ({ mutate: vi.fn(), isPending: false }),
  useRegistrationEnabled: () => registrationEnabled.value,
}));

vi.mock('@/stores/auth-store.ts', () => ({
  useAuthStore: () => ({ setTokens: vi.fn(), setUser: vi.fn() }),
}));

afterEach(() => {
  delete window.dentalDesktop;
  registrationEnabled.value = { data: { enabled: true }, isLoading: false };
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

  // ⚠️ LAN stsenariysi: klinika xodimi desktop serverga BRAUZERdan kiradi —
  // u yerda `window.dentalDesktop` YO'Q, ya'ni yuqoridagi darvoza ishlamaydi.
  // Server signali (`GET /auth/registration-enabled`) — YAGONA darvoza.
  // Havolasiz bo'lsa foydalanuvchi formaga bekorga bormaydi (RegisterTenantPage
  // baribir /login'ga qaytaradi — bu yerda kirish nuqtasining o'zi yopiladi).
  it("brauzerdan LAN orqali: server enabled=false qaytarsa — havola ko'rinmaydi", () => {
    registrationEnabled.value = { data: { enabled: false }, isLoading: false };
    renderApp(<LoginPage />);
    expect(screen.queryByText(i18n.t('auth.login.register_clinic'))).not.toBeInTheDocument();
  });

  // Fail-open: so'rov xato bersa yoki eski backend endpointni bilmasa
  // (`data` undefined), havola KO'RINADI — cloud foydalanuvchisidan
  // ro'yxatdan o'tish imkoniyati tortib olinmaydi. `RegisterTenantPage`
  // darvozasi bilan bir xil semantika (`enabled === false` bo'lsagina yopiladi).
  it("so'rov javob bermasa (fail-open) — havola ko'rinadi", () => {
    registrationEnabled.value = { data: undefined, isLoading: false };
    renderApp(<LoginPage />);
    expect(screen.getByText(i18n.t('auth.login.register_clinic'))).toBeInTheDocument();
  });
});

describe('LoginPage — vendor-vositachiligidagi owner parol-tiklash havolasi (CLI-226)', () => {
  it("havola doim ko'rinadi (brauzer/Local Desktop farqisiz) va /reset-owner-password'ga yo'naltiradi", () => {
    renderApp(<LoginPage />);
    const link = screen.getByText(i18n.t('auth.login.reset_owner'));
    expect(link).toBeInTheDocument();
    expect(link.closest('a')).toHaveAttribute('href', '/reset-owner-password');
  });

  it("window.dentalDesktop mavjud bo'lsa ham havola ko'rinadi", () => {
    window.dentalDesktop = {
      setServerUrl: async () => ({ ok: true, connected: true, serverUrl: 'x' }),
    };
    renderApp(<LoginPage />);
    expect(screen.getByText(i18n.t('auth.login.reset_owner'))).toBeInTheDocument();
  });

  it("forgot-password havolasi ko'rinmaydi (SMS OTP reset olib tashlandi — CLI-478)", () => {
    renderApp(<LoginPage />);
    expect(screen.queryByText(i18n.t('auth.login.forgot'))).not.toBeInTheDocument();
    // reset-owner havolasi hamon bor:
    expect(screen.getByText(i18n.t('auth.login.reset_owner'))).toBeInTheDocument();
  });
});
