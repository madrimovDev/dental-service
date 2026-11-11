import { Alert } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { useLicenseStatus } from '../license.api';

/**
 * Desktop litsenziya banneri: expiring → sariq; grace → qizil, yopilmaydi.
 * active/none/cloud — hech narsa.
 */
export function LicenseBanner() {
  const { t } = useTranslation();
  const { data } = useLicenseStatus();
  if (!data || data.mode !== 'desktop' || data.daysLeft == null) return null;

  if (data.state === 'expiring') {
    return (
      <Alert color="yellow" radius={0} role="status" data-testid="license-banner">
        {t('license.banner.expiring', { count: data.daysLeft })}
      </Alert>
    );
  }
  if (data.state === 'grace') {
    return (
      <Alert color="red" radius={0} role="alert" data-testid="license-banner">
        {t('license.banner.grace', { count: data.daysLeft })}
      </Alert>
    );
  }
  return null;
}
