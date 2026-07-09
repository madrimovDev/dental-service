import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { i18n } from '@/lib/i18n.ts';
import { renderApp } from '../../../test-utils';
import { ResetOwnerPasswordPage } from './reset-owner-password.page';

// Mantine required-input label accessible name matnga " *" markerini qo'shadi
// (aria-hidden span), shuning uchun getByLabelText exact match'i to'liq
// mos kelmaydi. `^label\s*\*?$` anchor — required marker'ga toqat qiladi,
// lekin bir label ikkinchisining prefiksi bo'lsa ham (masalan "Yangi parol"
// / "Yangi parolni tasdiqlash") noaniqlikni oldini oladi.
const labelMatcher = (key: string) => {
  const text = i18n.t(key).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`^${text}\\s*\\*?$`);
};

describe('ResetOwnerPasswordPage — vendor-vositachiligidagi owner parol-tiklash formasi', () => {
  it("forma maydonlari va sarlavha ko'rinadi", () => {
    renderApp(<ResetOwnerPasswordPage />);
    expect(screen.getByText(i18n.t('auth.reset_owner.title'))).toBeInTheDocument();
    expect(screen.getByLabelText(labelMatcher('auth.reset_owner.token'))).toBeInTheDocument();
    expect(
      screen.getByLabelText(labelMatcher('auth.reset_owner.new_password')),
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText(labelMatcher('auth.reset_owner.confirm_password')),
    ).toBeInTheDocument();
  });

  it("parollar mos kelmasa — tarjima qilingan xato ko'rinadi (submit qilinmaydi)", async () => {
    renderApp(<ResetOwnerPasswordPage />);

    fireEvent.change(screen.getByLabelText(labelMatcher('auth.reset_owner.token')), {
      target: { value: 'ABCDE-12345-FEDCB' },
    });
    fireEvent.change(screen.getByLabelText(labelMatcher('auth.reset_owner.new_password')), {
      target: { value: 'password1' },
    });
    fireEvent.change(screen.getByLabelText(labelMatcher('auth.reset_owner.confirm_password')), {
      target: { value: 'password2' },
    });
    fireEvent.click(screen.getByRole('button', { name: i18n.t('auth.reset_owner.submit') }));

    await waitFor(() => {
      expect(screen.getByText(i18n.t('auth.reset_owner.passwords_not_match'))).toBeInTheDocument();
    });
  });

  it("token noto'g'ri formatda bo'lsa — validatsiya xatosi ko'rinadi", async () => {
    renderApp(<ResetOwnerPasswordPage />);

    fireEvent.change(screen.getByLabelText(labelMatcher('auth.reset_owner.token')), {
      target: { value: 'not-a-token' },
    });
    fireEvent.change(screen.getByLabelText(labelMatcher('auth.reset_owner.new_password')), {
      target: { value: 'password1' },
    });
    fireEvent.change(screen.getByLabelText(labelMatcher('auth.reset_owner.confirm_password')), {
      target: { value: 'password1' },
    });
    fireEvent.click(screen.getByRole('button', { name: i18n.t('auth.reset_owner.submit') }));

    await waitFor(() => {
      expect(screen.getByText(i18n.t('auth.reset_owner.token_invalid'))).toBeInTheDocument();
    });
  });
});
