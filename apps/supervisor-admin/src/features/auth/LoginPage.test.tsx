import { fireEvent, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderApp } from '../../test-utils';
import { LoginPage } from './LoginPage';

const navigateMock = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return { ...actual, useNavigate: () => navigateMock };
});

const fetchMock = vi.fn();

describe('LoginPage', () => {
  beforeEach(() => {
    navigateMock.mockClear();
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
    localStorage.clear();
  });

  it("email + parol formasi va Kirish tugmasini ko'rsatadi", () => {
    renderApp(<LoginPage />);
    expect(screen.getByLabelText('Email')).toBeInTheDocument();
    expect(screen.getByLabelText('Parol')).toBeInTheDocument();
    expect(screen.getByText('Kirish')).toBeInTheDocument();
  });

  it("to'g'ri email/parol bilan submit qilsa login endpoint chaqiriladi va / ga navigatsiya qiladi", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ token: 'jwt-token-123' }),
    });
    renderApp(<LoginPage />);

    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'admin@test.com' } });
    fireEvent.change(screen.getByLabelText('Parol'), { target: { value: 'secret' } });
    fireEvent.click(screen.getByText('Kirish'));

    await vi.waitFor(() => expect(navigateMock).toHaveBeenCalledWith('/'));

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/v1/admin/auth/login'),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ email: 'admin@test.com', password: 'secret' }),
      }),
    );
    expect(localStorage.getItem('admin_token')).toBe('jwt-token-123');
  });

  it("noto'g'ri login/parol bilan submit qilsa xato xabari ko'rinadi", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      json: async () => ({ error: { code: 'INVALID_CREDENTIALS' } }),
    });
    renderApp(<LoginPage />);

    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'admin@test.com' } });
    fireEvent.change(screen.getByLabelText('Parol'), { target: { value: 'wrong' } });
    fireEvent.click(screen.getByText('Kirish'));

    expect(await screen.findByText("Login yoki parol noto'g'ri")).toBeInTheDocument();
    expect(navigateMock).not.toHaveBeenCalled();
  });
});
