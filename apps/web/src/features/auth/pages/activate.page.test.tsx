import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { i18n } from '@/lib/i18n.ts';
import { renderApp } from '../../../test-utils';
import { ActivatePage } from './activate.page';

// `vi.mock` factory BUTUN modulni almashtiradi — sahifa `../auth.api`dan
// ishlatadigan HAR bir hook shu yerda bo'lishi shart.
// Default: litsenziya YO'Q, tenant YO'Q → oddiy aktivatsiya formasi shoxi.
// Mavjud testlar shu shoxda ishlaydi va yashil qoladi.
const bootstrapStatus = vi.hoisted(() => ({
  value: { data: { hasLicense: false, hasTenant: false } } as {
    data?: { hasLicense: boolean; hasTenant: boolean };
  },
}));

vi.mock('../auth.api', () => ({
  useBootstrapStatus: () => bootstrapStatus.value,
}));

// Sahifa aktivatsiya so'rovida generated api-client'ni EMAS, xom `fetch`ni
// ishlatadi (pre-tenant, spec'dan qasddan chetda) — shuning uchun global
// fetch mock qilinadi.
const mockActivate = (payload: unknown) => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ json: async () => payload }) as unknown as Response),
  );
};

const submit = () => {
  fireEvent.change(screen.getByLabelText(/Litsenziya kaliti|Лицензионный ключ/), {
    target: { value: 'ABCDE-12345-FEDCB-09876' },
  });
  fireEvent.click(screen.getByRole('button', { name: i18n.t('auth.activate.submit') }));
};

beforeEach(() => {
  // window.location.href = '/login' yo'naltirishi jsdom'da "Not implemented"
  // bermasin — timer 4000 ms, testda ishga tushmaydi, lekin himoya bo'lsin.
  vi.useRealTimers();
});

afterEach(() => {
  vi.unstubAllGlobals();
  bootstrapStatus.value = { data: { hasLicense: false, hasTenant: false } };
});

describe("ActivatePage — aktivatsiyadan keyingi login ma'lumoti", () => {
  it("javobda ownerPhone bo'lsa — kirish telefoni ko'rsatiladi", async () => {
    const phone = '+998901234567';
    // Guard: kalit tarjimada yo'q bo'lsa `t()` xom kalitni qaytaradi va
    // telefon ichida bo'lmaydi → test soxta yashil bo'lib qolmaydi.
    expect(i18n.t('auth.activate.login_hint', { phone })).toContain(phone);

    mockActivate({
      success: true,
      data: { modules: ['patients'], expiresAt: '2030-01-01T00:00:00.000Z', ownerPhone: phone },
    });
    renderApp(<ActivatePage />);
    submit();

    await waitFor(() => {
      expect(screen.getByText(i18n.t('auth.activate.success'))).toBeInTheDocument();
    });
    expect(screen.getByText(i18n.t('auth.activate.login_hint', { phone }))).toBeInTheDocument();
  });

  it("javobda ownerPhone bo'lmasa (hisob avval yaratilgan) — maslahat ko'rsatilmaydi", async () => {
    mockActivate({
      success: true,
      data: { modules: ['patients'], expiresAt: '2030-01-01T00:00:00.000Z' },
    });
    renderApp(<ActivatePage />);
    submit();

    await waitFor(() => {
      expect(screen.getByText(i18n.t('auth.activate.success'))).toBeInTheDocument();
    });
    expect(
      screen.queryByText(/998|Kirish uchun telefon|Телефон для входа/),
    ).not.toBeInTheDocument();
  });

  it("xato javobda maslahat ham, muvaffaqiyat ham ko'rsatilmaydi", async () => {
    mockActivate({
      success: false,
      error: { code: 'INVALID_KEY', message: 'bad' },
    });
    renderApp(<ActivatePage />);
    submit();

    await waitFor(() => {
      expect(screen.getByText(i18n.t('auth.activate.error_invalid_key'))).toBeInTheDocument();
    });
    expect(screen.queryByText(i18n.t('auth.activate.success'))).not.toBeInTheDocument();
  });
});

// Audit C1 — `.lic` bor, lekin lokal bazada tenant yo'q (baza yo'qolgan /
// yangi kompyuter). Litsenziya kalitini qayta kiritish YORDAM BERMAYDI
// (Supervisor fingerprint bog'langan + provisioning bloki yo'q), shuning
// uchun forma umuman ko'rsatilmaydi — foydalanuvchi vendorga yo'naltiriladi.
describe("ActivatePage — tenant yo'q holati (audit C1)", () => {
  it("litsenziya bor lekin tenant yo'q — vendorga murojaat matni, forma YO'Q", async () => {
    // Guard: kalit tarjimada yo'q bo'lsa `t()` XOM KALITNI qaytaradi va
    // komponent ham o'sha xom kalitni render qiladi → test soxta yashil
    // bo'lardi (mavjud `login_hint` guard'i bilan bir xil sabab).
    expect(i18n.t('auth.activate.needs_vendor_title')).not.toBe('auth.activate.needs_vendor_title');
    expect(i18n.t('auth.activate.needs_vendor_body')).not.toBe('auth.activate.needs_vendor_body');

    bootstrapStatus.value = { data: { hasLicense: true, hasTenant: false } };
    renderApp(<ActivatePage />);

    expect(await screen.findByText(i18n.t('auth.activate.needs_vendor_title'))).toBeInTheDocument();
    expect(screen.getByText(i18n.t('auth.activate.needs_vendor_body'))).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: i18n.t('auth.activate.submit') }),
    ).not.toBeInTheDocument();
  });

  it("litsenziya yo'q — oddiy aktivatsiya formasi ko'rinadi", async () => {
    bootstrapStatus.value = { data: { hasLicense: false, hasTenant: false } };
    renderApp(<ActivatePage />);

    expect(await screen.findByRole('textbox')).toBeInTheDocument();
    expect(screen.queryByText(i18n.t('auth.activate.needs_vendor_title'))).not.toBeInTheDocument();
  });

  // Fail-open: so'rov javob bermasa (`data` undefined) forma KO'RINADI —
  // aks holda tarmoq/endpoint xatosi mijozni aktivatsiyadan butunlay
  // mahrum qilardi (`useRegistrationEnabled` bilan bir xil semantika).
  it("bootstrap javobi kelmasa — forma ko'rinadi (fail-open)", async () => {
    bootstrapStatus.value = { data: undefined };
    renderApp(<ActivatePage />);

    expect(await screen.findByRole('textbox')).toBeInTheDocument();
  });
});
