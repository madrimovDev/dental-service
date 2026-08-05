import { screen, waitFor } from '@testing-library/react';
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

// Audit C1 gate'i uchun. Default `hasTenant: true` — mavjud testlar login
// formasi shoxida qoladi (yo'naltirish bo'lmaydi).
const bootstrapStatus = vi.hoisted(() => ({
  value: { data: { hasLicense: true, hasTenant: true } } as {
    data?: { hasLicense: boolean; hasTenant: boolean };
  },
}));

vi.mock('../auth.api', () => ({
  useLogin: () => ({ mutate: vi.fn(), isPending: false }),
  useRegistrationEnabled: () => registrationEnabled.value,
  useBootstrapStatus: () => bootstrapStatus.value,
}));

const navigateMock = vi.hoisted(() => vi.fn());
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return { ...actual, useNavigate: () => navigateMock };
});

vi.mock('@/stores/auth-store.ts', () => ({
  useAuthStore: () => ({ setTokens: vi.fn(), setUser: vi.fn() }),
}));

afterEach(() => {
  delete window.dentalDesktop;
  registrationEnabled.value = { data: { enabled: true }, isLoading: false };
  bootstrapStatus.value = { data: { hasLicense: true, hasTenant: true } };
  navigateMock.mockClear();
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

// Audit C1 — `.lic` bor, lekin lokal bazada tenant yo'q. Login HAR DOIM 401
// beradi va foydalanuvchi sababni bilmaydi; `/activate` sahifasi holatni o'zi
// aniqlab "vendorga murojaat" matnini ko'rsatadi.
describe("LoginPage — tenant yo'q holatida /activate ga yo'naltirish (audit C1)", () => {
  it("tenant yo'q bo'lsa /activate ga yo'naltiradi", async () => {
    bootstrapStatus.value = { data: { hasLicense: true, hasTenant: false } };
    renderApp(<LoginPage />);

    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith('/activate', { replace: true }));
  });

  it("tenant bor bo'lsa login formasi ko'rinadi, yo'naltirish yo'q", () => {
    bootstrapStatus.value = { data: { hasLicense: true, hasTenant: true } };
    renderApp(<LoginPage />);

    expect(screen.getByText(i18n.t('auth.login.phone'))).toBeInTheDocument();
    expect(navigateMock).not.toHaveBeenCalled();
  });

  // Fail-open: javob kelmasa yo'naltirilmaydi — tarmoq xatosi foydalanuvchini
  // login'dan mahrum qilmasin.
  it("bootstrap javobi kelmasa — yo'naltirish yo'q (fail-open)", () => {
    bootstrapStatus.value = { data: undefined };
    renderApp(<LoginPage />);

    expect(screen.getByText(i18n.t('auth.login.phone'))).toBeInTheDocument();
    expect(navigateMock).not.toHaveBeenCalled();
  });
});
