import { fireEvent, screen, waitFor } from '@testing-library/react';
import { Route, Routes, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { type HubUser, useAuth } from '@/stores/auth';
import { mockHub, renderApp } from '../../test-utils';
import { ChangePasswordPage } from './ChangePasswordPage';
import { LoginPage } from './LoginPage';

const Where = () => <div data-testid="where">{useLocation().pathname}</div>;
const tree = (
  <>
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/change-password" element={<ChangePasswordPage />} />
      <Route path="*" element={<span>home</span>} />
    </Routes>
    <Where />
  </>
);

const user: HubUser = {
  id: 'u1',
  fullName: 'Rahbar',
  phone: '+998901234567',
  role: 'lead',
  isActive: true,
  mustChangePassword: false,
  createdAt: '2026-11-01T00:00:00.000Z',
};

describe('auth', () => {
  beforeEach(() => {
    localStorage.clear();
    useAuth.getState().logout();
  });

  it('login: telefon+parol yuboradi, sessiya saqlanadi, bosh sahifaga o‘tadi', async () => {
    const hub = mockHub({
      'POST /v1/lab/auth/login': () => ({
        body: {
          token: 'tok',
          mustChangePassword: false,
          user,
          lab: { id: 'l1', name: 'Oq Tish', subscription: 'active' },
        },
      }),
    });
    vi.stubGlobal('fetch', hub.fn);
    renderApp(tree, { route: '/login' });
    fireEvent.change(screen.getByLabelText('Telefon raqami'), { target: { value: '901234567' } });
    fireEvent.change(screen.getByLabelText('Parol'), { target: { value: 'secret-pass-1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Kirish' }));
    await waitFor(() => expect(screen.getByTestId('where').textContent).toBe('/'));
    expect(hub.calls[0]?.body).toMatchObject({ password: 'secret-pass-1' });
    expect(String((hub.calls[0]?.body as { phone: string }).phone)).toContain('901234567');
    expect(useAuth.getState().token).toBe('tok');
  });

  it('vaqtinchalik parol — majburiy almashtirish sahifasiga yo‘naltiradi', async () => {
    const hub = mockHub({
      'POST /v1/lab/auth/login': () => ({
        body: {
          token: 'tok',
          mustChangePassword: true,
          user: { ...user, mustChangePassword: true },
          lab: { id: 'l1', name: 'Oq Tish', subscription: 'active' },
        },
      }),
    });
    vi.stubGlobal('fetch', hub.fn);
    renderApp(tree, { route: '/login' });
    fireEvent.change(screen.getByLabelText('Telefon raqami'), { target: { value: '901234567' } });
    fireEvent.change(screen.getByLabelText('Parol'), { target: { value: 'Tmp-Pass-123' } });
    fireEvent.click(screen.getByRole('button', { name: 'Kirish' }));
    await waitFor(() => expect(screen.getByTestId('where').textContent).toBe('/change-password'));
  });

  it('noto‘g‘ri parol — xato matni ko‘rinadi, sessiya yo‘q', async () => {
    const hub = mockHub({
      'POST /v1/lab/auth/login': () => ({
        status: 401,
        body: { error: { code: 'auth.invalid_credentials' } },
      }),
    });
    vi.stubGlobal('fetch', hub.fn);
    renderApp(tree, { route: '/login' });
    fireEvent.change(screen.getByLabelText('Telefon raqami'), { target: { value: '901234567' } });
    fireEvent.change(screen.getByLabelText('Parol'), { target: { value: 'xxxxxxxxxx' } });
    fireEvent.click(screen.getByRole('button', { name: 'Kirish' }));
    expect(await screen.findByRole('alert')).toHaveTextContent("Telefon yoki parol noto'g'ri");
    expect(useAuth.getState().token).toBeNull();
  });

  it('parol almashtirish: mos kelmasa so‘rov ketmaydi; muvaffaqiyatda yangi token saqlanadi', async () => {
    const hub = mockHub({
      'POST /v1/lab/auth/change-password': () => ({ body: { token: 'tok2', user } }),
    });
    vi.stubGlobal('fetch', hub.fn);
    useAuth.setState({
      token: 'tok',
      mustChangePassword: true,
      user: { ...user, mustChangePassword: true },
      lab: { id: 'l1', name: 'Oq Tish', subscription: 'active' },
    });
    renderApp(tree, { route: '/change-password' });
    fireEvent.change(screen.getByLabelText('Joriy (vaqtinchalik) parol'), {
      target: { value: 'Tmp-Pass-123' },
    });
    fireEvent.change(screen.getByLabelText('Yangi parol'), { target: { value: 'New-Pass-12345' } });
    fireEvent.change(screen.getByLabelText('Yangi parolni takrorlang'), {
      target: { value: 'Other-Pass-1234' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Parolni saqlash' }));
    expect(await screen.findByText('Parollar mos kelmadi')).toBeInTheDocument();
    expect(hub.calls).toHaveLength(0);

    fireEvent.change(screen.getByLabelText('Yangi parolni takrorlang'), {
      target: { value: 'New-Pass-12345' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Parolni saqlash' }));
    await waitFor(() => expect(useAuth.getState().token).toBe('tok2'));
    expect(useAuth.getState().mustChangePassword).toBe(false);
    expect(hub.calls[0]?.body).toEqual({
      currentPassword: 'Tmp-Pass-123',
      newPassword: 'New-Pass-12345',
    });
  });
});
