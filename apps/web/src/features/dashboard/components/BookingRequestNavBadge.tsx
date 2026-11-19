import { Badge } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@/stores/auth-store.ts';
import { useBookingRequests } from '../reception.api.ts';

/**
 * Sidebar «Bosh sahifa» yonidagi badge — tasdiq kutayotgan Telegram bron so'rovlari soni (FX-23).
 * Widget bilan bir query-key (`pending`) ni ulashadi: bitta davriy so'rov. `appointment.create`
 * (qaror qiluvchi rol) bo'lmasa so'rov yuborilmaydi.
 */
export function BookingRequestNavBadge() {
  const { t } = useTranslation();
  const { hasPermission } = useAuthStore();
  const canDecide = hasPermission('appointment.create');
  const { data } = useBookingRequests('pending', { enabled: canDecide });
  if (!canDecide) return null;
  const count = data?.pendingCount ?? 0;
  if (count === 0) return null;
  return (
    <Badge size="sm" circle color="red" ml="auto" title={t('telegramRequests.nav_badge')}>
      {count > 99 ? '99+' : count}
    </Badge>
  );
}
