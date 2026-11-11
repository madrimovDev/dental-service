import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate, useNavigate } from 'react-router-dom';
import { api } from '@/lib/api';
import { type HubLab, useAuth } from '@/stores/auth';
import { AuthLogo } from './AuthLogo';

/** Obuna tugagan (L10): portal bloklangan; `/me` ochiq qoladi — uzaytirilgach «Qayta tekshirish». */
export function ExpiredPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const token = useAuth((s) => s.token);
  const lab = useAuth((s) => s.lab);
  const logout = useAuth((s) => s.logout);
  const setSubscription = useAuth((s) => s.setSubscription);
  const [busy, setBusy] = useState(false);

  if (!token) return <Navigate to="/login" replace />;

  const recheck = async () => {
    setBusy(true);
    try {
      const me = await api.get<{ lab: HubLab }>('/v1/lab/me');
      setSubscription(me.lab.subscription);
      if (me.lab.subscription !== 'expired') navigate('/', { replace: true });
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="auth">
      <div className="auth__card">
        <AuthLogo />
        <h1>{t('labHub.subscription.expiredTitle')}</h1>
        {lab && <p>{lab.name}</p>}
        <div role="alert" className="form-error">
          {t('labHub.subscription.expiredText')}
        </div>
        <p>{t('labHub.subscription.expiredHint')}</p>
        <button
          type="button"
          className="btn btn--primary btn--lg"
          onClick={recheck}
          disabled={busy}
        >
          {t('labHub.subscription.recheck')}
        </button>
        <button type="button" className="btn btn--sm" onClick={logout}>
          {t('labHub.app.logout')}
        </button>
      </div>
    </main>
  );
}
