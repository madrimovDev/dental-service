import { Button, Card } from '@dental/ui';
import { Badge, Group, Stack, Text } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@/stores/auth-store.ts';
import { usePatientNoShowStrikes, useWaiveNoShowStrike } from '../patients.api';

/**
 * CLI-474 (L7) — bemor no-show strike xulosasi: faol count + chegara bayrog'i +
 * tarix (kechirish tugmasi bilan). Tizim o'chiq (threshold 0) yoki strike yo'q
 * bo'lsa umuman ko'rinmaydi. Kechirish `appointment.edit` egasi uchun.
 */
export function NoShowStrikesCard({ patientId }: { patientId: string }) {
  const { t } = useTranslation();
  const { hasPermission } = useAuthStore();
  const { data } = usePatientNoShowStrikes(patientId);
  const waiveMut = useWaiveNoShowStrike(patientId);

  if (!data || data.threshold === 0 || data.strikes.length === 0) return null;

  const canWaive = hasPermission('appointment.edit');

  return (
    <Card title={t('patients.no_show.title')}>
      <Group justify="space-between" mb="sm">
        <Text size="sm">{t('patients.no_show.active_count', { count: data.activeCount })}</Text>
        {data.flagged && (
          <Badge color="red" variant="light">
            {t('patients.no_show.flagged')}
          </Badge>
        )}
      </Group>
      <Stack gap="xs">
        {data.strikes.map((s) => {
          // Join-anchored: appointment endi no_show emas (misclick tuzatilgan) →
          // strike faol emas, kechirish shart emas.
          const corrected = s.appointmentStatus !== 'no_show';
          const active = !s.waived && !corrected;
          return (
            <Group key={s.id} justify="space-between" wrap="nowrap">
              <div>
                <Text size="sm">{new Date(s.startTime).toLocaleDateString()}</Text>
                <Text size="xs" c="dimmed">
                  {s.waived
                    ? t('patients.no_show.waived')
                    : corrected
                      ? t('patients.no_show.corrected')
                      : t('patients.no_show.active')}
                </Text>
              </div>
              {canWaive && active && (
                <Button
                  variant="default"
                  onClick={() => waiveMut.mutate({ id: s.id })}
                  disabled={waiveMut.isPending}
                >
                  {t('patients.no_show.waive')}
                </Button>
              )}
            </Group>
          );
        })}
      </Stack>
    </Card>
  );
}
