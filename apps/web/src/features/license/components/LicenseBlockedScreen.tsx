import { AlertBanner, Button, StateView } from '@dental/ui';
import { Lock } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useRecheckLicense } from '../license.api';

export function LicenseBlockedScreen() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const recheck = useRecheckLicense();
  const [stillExpired, setStillExpired] = useState(false);

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
          title={t('license.blocked.title')}
          description={`${t('license.blocked.body')} ${t('license.blocked.internet')}`}
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
            </div>
          }
        />
      </div>
    </div>
  );
}
