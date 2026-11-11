import { ApiError } from '@dental/api-client';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { i18n } from '@/lib/i18n.ts';
import { renderApp } from '../../../test-utils';
import { ChangePasswordRequiredPage } from './change-password-required.page';

const mutate = vi.hoisted(() => vi.fn());
const opts = vi.hoisted(() => ({ value: undefined as undefined | Record<string, never> }));
const clear = vi.hoisted(() => vi.fn());
const navigateMock = vi.hoisted(() => vi.fn());

vi.mock('@/features/profile/profile.api', () => ({
  useChangePassword: (o: never) => {
    opts.value = o;
    return { mutate, isPending: false };
  },
}));
vi.mock('@/stores/auth-store.ts', () => ({
  useAuthStore: () => ({ clear }),
}));
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return { ...actual, useNavigate: () => navigateMock };
});

const fill = (cur: string, next: string, conf: string) => {
  fireEvent.change(screen.getByLabelText(new RegExp(i18n.t('auth.pwdChangeRequired.current'))), {
    target: { value: cur },
  });
  fireEvent.change(
    screen.getByLabelText(
      new RegExp(`^${i18n.t('auth.pwdChangeRequired.new_password')}(\\s|\\*|$)`),
    ),
    { target: { value: next } },
  );
  fireEvent.change(screen.getByLabelText(new RegExp(i18n.t('auth.pwdChangeRequired.confirm'))), {
    target: { value: conf },
  });
  fireEvent.click(screen.getByRole('button', { name: i18n.t('auth.pwdChangeRequired.submit') }));
};

describe('ChangePasswordRequiredPage (P6)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("yangi parol joriyga teng bo'lsa yuborilmaydi", async () => {
    renderApp(<ChangePasswordRequiredPage />);
    fill('Temp-Password-1', 'Temp-Password-1', 'Temp-Password-1');
    expect(await screen.findByText(i18n.t('auth.pwdChangeRequired.same'))).toBeInTheDocument();
    expect(mutate).not.toHaveBeenCalled();
  });

  it('qisqa parol yuborilmaydi (min 12)', async () => {
    renderApp(<ChangePasswordRequiredPage />);
    fill('temp', 'short', 'short');
    await waitFor(() => expect(mutate).not.toHaveBeenCalled());
  });

  it("to'g'ri forma yuboriladi, muvaffaqiyatda tokenlar tozalanib /login", async () => {
    renderApp(<ChangePasswordRequiredPage />);
    fill('temp-pass', 'Brand-New-Password-9', 'Brand-New-Password-9');
    await waitFor(() =>
      expect(mutate).toHaveBeenCalledWith({
        currentPassword: 'temp-pass',
        newPassword: 'Brand-New-Password-9',
      }),
    );
    (opts.value as unknown as { onSuccess: () => void }).onSuccess();
    expect(clear).toHaveBeenCalled();
    expect(navigateMock).toHaveBeenCalledWith('/login', { replace: true });
  });

  it("noto'g'ri joriy parol maydonda xato ko'rsatadi", async () => {
    renderApp(<ChangePasswordRequiredPage />);
    (opts.value as unknown as { onError: (e: unknown) => void }).onError(
      new ApiError('auth.invalid_current_password', 'x', 400),
    );
    expect(
      await screen.findByText(i18n.t('auth.pwdChangeRequired.invalid_current')),
    ).toBeInTheDocument();
  });
});
