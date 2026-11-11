import { AlertBanner } from '@dental/ui';
import { useTranslation } from 'react-i18next';
import { useLicenseStatus } from '../license.api';

/**
 * Desktop litsenziya banneri (2-daraja «Diqqat»: doimiy, to'xtatmaydi, yopilmaydi).
 * expiring/grace — hech qachon modal emas; active/none/cloud — hech narsa.
 */
export function LicenseBanner() {
  const { t } = useTranslation();
  const { data } = useLicenseStatus();
  if (!data || data.mode !== 'desktop' || data.daysLeft == null) return null;

  if (data.state === 'expiring' || data.state === 'grace') {
    return (
      <div data-testid="license-banner" data-license-state={data.state}>
        <AlertBanner tier={2}>
          {t(`license.banner.${data.state}`, { count: data.daysLeft })}
        </AlertBanner>
      </div>
    );
  }
  return null;
}
