import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { i18n } from '@/lib/i18n.ts';
import { renderApp } from '../../../test-utils';
import { ActivatePage } from './activate.page';

// Sahifa generated api-client'ni EMAS, xom `fetch`ni ishlatadi (pre-tenant,
// spec'dan qasddan chetda) — shuning uchun global fetch mock qilinadi.
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
