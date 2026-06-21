import { Badge } from '@mantine/core';
import { useMemo } from 'react';
import { useAuthStore } from '@/stores/auth-store.ts';
import { useRecalls } from '../recalls.api';
import { localToday } from '../recalls.mappers';

/**
 * Sidebar "Qayta chaqirish" elementi yonidagi badge — bugun muddati keluvchi
 * recall soni. Dashboard bilan BIR query-key ulashadi (`recallKeys.list({date})`),
 * shuning uchun ikki marta yuklanmaydi. `recall.view` ruxsatisiz so'rov o'chiriladi.
 */
export function RecallNavBadge() {
  const { hasPermission } = useAuthStore();
  const canView = hasPermission('recall.view');
  const today = useMemo(() => localToday(), []);
  const { data } = useRecalls({ date: today }, { enabled: canView });

  if (!canView) return null;
  const count = data?.length ?? 0;
  if (count === 0) return null;

  return (
    <Badge size="sm" circle color="red" ml="auto">
      {count > 99 ? '99+' : count}
    </Badge>
  );
}
