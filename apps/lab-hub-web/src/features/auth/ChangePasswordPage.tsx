import { type FormEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate, useNavigate } from 'react-router-dom';
import { api, HubApiError } from '@/lib/api';
import { type HubUser, useAuth } from '@/stores/auth';
import { AuthLogo } from './AuthLogo';

const MIN_LENGTH = 12; // lab-hub-api MIN_PASSWORD_LENGTH

export function ChangePasswordPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const token = useAuth((s) => s.token);
  const passwordChanged = useAuth((s) => s.passwordChanged);
  const logout = useAuth((s) => s.logout);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [repeat, setRepeat] = useState('');
  const [errors, setErrors] = useState<{ next?: string; repeat?: string; form?: string }>({});
  const [busy, setBusy] = useState(false);

  if (!token) return <Navigate to="/login" replace />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const errs: typeof errors = {};
    if (next.length < MIN_LENGTH) errs.next = t('labHub.auth.tooShort');
    else if (next === current) errs.next = t('labHub.auth.passwordSame');
    if (next !== repeat) errs.repeat = t('labHub.auth.mismatch');
    setErrors(errs);
    if (errs.next || errs.repeat) return;
    setBusy(true);
    try {
      const res = await api.post<{ token: string; user: HubUser }>('/v1/lab/auth/change-password', {
        currentPassword: current,
        newPassword: next,
      });
      passwordChanged(res.token, res.user);
      navigate('/', { replace: true });
    } catch (err) {
      const wrong = err instanceof HubApiError && err.status === 401;
      setErrors({ form: wrong ? t('labHub.auth.currentWrong') : t('labHub.common.error') });
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="auth">
      <form className="auth__card" onSubmit={submit} noValidate>
        <AuthLogo />
        <h1>{t('labHub.auth.changeTitle')}</h1>
        <p>{t('labHub.auth.changeIntro')}</p>
        {errors.form && (
          <div role="alert" className="form-error">
            {errors.form}
          </div>
        )}
        <div className="field">
          <label htmlFor="pw-current">{t('labHub.auth.currentPassword')}</label>
          <input
            id="pw-current"
            className="input"
            type="password"
            autoComplete="current-password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="pw-new">{t('labHub.auth.newPassword')}</label>
          <input
            id="pw-new"
            className="input"
            type="password"
            autoComplete="new-password"
            value={next}
            onChange={(e) => setNext(e.target.value)}
            aria-invalid={!!errors.next}
          />
          {errors.next && <span className="field__error">{errors.next}</span>}
        </div>
        <div className="field">
          <label htmlFor="pw-repeat">{t('labHub.auth.confirmPassword')}</label>
          <input
            id="pw-repeat"
            className="input"
            type="password"
            autoComplete="new-password"
            value={repeat}
            onChange={(e) => setRepeat(e.target.value)}
            aria-invalid={!!errors.repeat}
          />
          {errors.repeat && <span className="field__error">{errors.repeat}</span>}
        </div>
        <button type="submit" className="btn btn--primary btn--lg" disabled={busy || !current}>
          {t('labHub.auth.changeSubmit')}
        </button>
        <button type="button" className="btn btn--sm" onClick={logout}>
          {t('labHub.app.logout')}
        </button>
      </form>
    </main>
  );
}
