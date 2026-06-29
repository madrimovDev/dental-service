import { Button, StateView } from '@dental/ui';
import { ActionIcon, Card, Group, Modal, Stack, Text } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { Trash2 } from 'lucide-react';
import type { CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@/stores/auth-store.ts';
import { useDeleteTimeOff, useTimeOff } from '../schedule.api';
import { TimeOffForm } from './TimeOffForm';

const TZ = 'Asia/Tashkent';

// Dental OS chrome — time-off list karta sirti (token-driven, yangi CSS yo'q).
const cardStyle: CSSProperties = {
  background: 'var(--surface)',
  borderColor: 'var(--border)',
  borderRadius: 'var(--radius-card)',
};

/** UTC ISO → klinika-local 'DD.MM.YYYY'. */
function dateLabel(iso: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: TZ,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(iso));
}

/**
 * Time-off endAt yarim-ochiq eksklyuziv (keyingi kun 00:00). Inklyuziv ko'rsatish
 * uchun 1 ms ayiramiz — foydalanuvchiga oxirgi TO'LIQ kun ko'rinadi.
 */
function inclusiveEndLabel(iso: string): string {
  return dateLabel(new Date(new Date(iso).getTime() - 1).toISOString());
}

export function TimeOffList({
  doctorId,
  branchId,
}: {
  doctorId: string | null;
  branchId: string | null;
}) {
  const { t } = useTranslation();
  const { hasPermission } = useAuthStore();
  const canManage = hasPermission('schedule.manage');
  const [opened, { open, close }] = useDisclosure(false);
  const { data, isLoading, isError, refetch } = useTimeOff({
    doctorId: doctorId ?? undefined,
    branchId: branchId ?? undefined,
  });
  const deleteMut = useDeleteTimeOff();

  if (!doctorId) {
    return <StateView status="empty" title={t('schedule.select_doctor')} />;
  }

  return (
    <Stack gap="md">
      {canManage && (
        <Group justify="flex-end">
          <Button variant="primary" onClick={open}>
            {t('time_off.add')}
          </Button>
        </Group>
      )}
      {isLoading ? (
        <StateView status="loading" skeleton="table" />
      ) : isError ? (
        <StateView
          status="error"
          title={t('states.error_title')}
          retryLabel={t('states.retry')}
          onRetry={() => refetch()}
        />
      ) : (data ?? []).length === 0 ? (
        <StateView status="empty" title={t('time_off.empty')} />
      ) : (
        <Stack gap="xs">
          {(data ?? []).map((to) => (
            <Card key={to.id} withBorder padding="sm" style={cardStyle}>
              <Group justify="space-between" wrap="nowrap">
                <Stack gap={2}>
                  <Text fw={600} size="sm">
                    {t(`time_off.type.${to.type}`)}
                  </Text>
                  <Text size="sm" c="dimmed">
                    {dateLabel(to.startAt)} — {inclusiveEndLabel(to.endAt)}
                  </Text>
                  {to.reason && <Text size="sm">{to.reason}</Text>}
                </Stack>
                {canManage && (
                  <ActionIcon
                    variant="subtle"
                    color="red"
                    aria-label={t('time_off.delete')}
                    disabled={deleteMut.isPending}
                    onClick={() => deleteMut.mutate(to.id)}
                  >
                    <Trash2 size={16} />
                  </ActionIcon>
                )}
              </Group>
            </Card>
          ))}
        </Stack>
      )}
      <Modal opened={opened} onClose={close} title={t('time_off.add')} size="md">
        <TimeOffForm doctorId={doctorId} branchId={branchId} onDone={close} />
      </Modal>
    </Stack>
  );
}
