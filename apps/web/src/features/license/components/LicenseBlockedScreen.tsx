import { logout as apiLogout } from '@dental/api-client';
import { AlertBanner, Button, StateView } from '@dental/ui';
import { Lock } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/auth-store.ts';
import { useLicenseStatus, useRecheckLicense } from '../license.api';

export function LicenseBlockedScreen() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const recheck = useRecheckLicense();
  const { data: status } = useLicenseStatus();
  const isCloud = status?.mode === 'cloud';
  const [stillExpired, setStillExpired] = useState(false);
  const refreshToken = useAuthStore((s) => s.refreshToken);
  const clearAuth = useAuthStore((s) => s.clear);

  // FX-103 (LB-12): blok ekranida qamalib qolmaslik. `/api/auth/*` blokdan ochiq.
  const onLogout = async () => {
    if (refreshToken) {
      try {
        await apiLogout({ refreshToken });
      } catch {
        /* chiqish baribir — lokal sessiya tozalanadi */
      }
    }
    clearAuth();
    navigate('/login');
  };

  const onRecheck = () => {
    setStillExpired(false);
    recheck.mutate(undefined, {
      onSuccess: (res) => {
        if (['active', 'expiring', 'grace'].includes(res.state)) {
          navigate('/');
        } else {
          setStillExpired(true);
        }
      },
      onError: () => setStillExpired(true),
    });
  };

  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 16 }}>
      <div style={{ maxWidth: 520, width: '100%' }}>
        <StateView
          status="error"
          icon={<Lock size={22} aria-hidden="true" />}
          title={isCloud ? t('license.blocked.subscriptionTitle') : t('license.blocked.title')}
          description={
            isCloud
              ? t('license.blocked.subscriptionBody')
              : `${t('license.blocked.body')} ${t('license.blocked.internet')}`
          }
          action={
            <div
              style={{ display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'center' }}
            >
              {stillExpired && (
                <AlertBanner tier={2}>{t('license.blocked.stillExpired')}</AlertBanner>
              )}
              <Button variant="primary" onClick={onRecheck} disabled={recheck.isPending}>
                {t('license.blocked.recheck')}
              </Button>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
                {/* SaaS'da obuna klinikaga bog'liq — boshqa (faol) klinikaga o'tish mumkin. */}
                {isCloud && (
                  <Button variant="default" onClick={() => navigate('/select-workspace')}>
                    {t('license.blocked.switchWorkspace')}
                  </Button>
                )}
                <Button variant="ghost" onClick={() => void onLogout()}>
                  {t('license.blocked.logout')}
                </Button>
              </div>
            </div>
          }
        />
      </div>
    </div>
  );
}
