import { AlertBanner } from '@dental/ui';
import { useTranslation } from 'react-i18next';
import { useLicenseStatus } from '../license.api';

/**
 * Litsenziya (desktop) / obuna (SaaS, L8) banneri (2-daraja «Diqqat»: doimiy,
 * to'xtatmaydi, yopilmaydi). expiring/grace — hech qachon modal emas; active/none
 * — hech narsa. Bulutda muddat noma'lum bo'lsa backend `none` qaytaradi.
 */
export function LicenseBanner() {
  const { t } = useTranslation();
  const { data } = useLicenseStatus();
  if (!data || data.daysLeft == null) return null;

  if (data.state === 'expiring' || data.state === 'grace') {
    const key =
      data.mode === 'cloud'
        ? `subscription${data.state === 'grace' ? 'Grace' : 'Expiring'}`
        : data.state;
    return (
      <div data-testid="license-banner" data-license-state={data.state}>
        <AlertBanner tier={2}>{t(`license.banner.${key}`, { count: data.daysLeft })}</AlertBanner>
      </div>
    );
  }
  return null;
}
