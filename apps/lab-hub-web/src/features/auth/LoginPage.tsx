import { normalizePhone } from '@dental/core';
import { type FormEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate, useNavigate } from 'react-router-dom';
import { api, HubApiError } from '@/lib/api';
import { type HubLab, type HubUser, useAuth } from '@/stores/auth';
import { AuthLogo } from './AuthLogo';

type LoginResponse = {
  token: string;
  mustChangePassword: boolean;
  user: HubUser;
  lab: HubLab | null;
};

export function LoginPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const token = useAuth((s) => s.token);
  const login = useAuth((s) => s.login);
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (token) return <Navigate to="/" replace />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await api.post<LoginResponse>('/v1/lab/auth/login', {
        phone: normalizePhone(phone),
        password,
      });
      login(res);
      if (res.mustChangePassword) navigate('/change-password', { replace: true });
      else if (res.lab?.subscription === 'expired') navigate('/expired', { replace: true });
      else navigate('/', { replace: true });
    } catch (err) {
      const rate = err instanceof HubApiError && err.status === 429;
      setError(rate ? t('labHub.auth.rateLimited') : t('labHub.auth.invalid'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="auth">
      <form className="auth__card" onSubmit={submit} noValidate>
        <AuthLogo />
        <h1>{t('labHub.auth.title')}</h1>
        <p>{t('labHub.auth.subtitle')}</p>
        {error && (
          <div role="alert" className="form-error">
            {error}
          </div>
        )}
        <div className="field">
          <label htmlFor="login-phone">{t('labHub.auth.phone')}</label>
          <input
            id="login-phone"
            className="input"
            type="tel"
            inputMode="tel"
            autoComplete="username"
            placeholder="+998 90 123 45 67"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            required
          />
        </div>
        <div className="field">
          <label htmlFor="login-password">{t('labHub.auth.password')}</label>
          <input
            id="login-password"
            className="input"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>
        <button
          type="submit"
          className="btn btn--primary btn--lg"
          disabled={busy || !phone || !password}
        >
          {t('labHub.auth.submit')}
        </button>
      </form>
    </main>
  );
}
