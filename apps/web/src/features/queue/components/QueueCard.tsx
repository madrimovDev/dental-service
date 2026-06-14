import type { QueueStatus } from '@dental/api-client';
import { ActionIcon, Badge, Button, Card, Group, Stack, Text } from '@mantine/core';
import { IconPlayerPlay, IconX } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import type { QueueCardVM } from '../queue.types';

const statusColor: Record<QueueStatus, string> = {
  waiting: 'yellow',
  in_progress: 'blue',
  done: 'teal',
  missed: 'red',
};

function hhmm(iso: string) {
  return new Date(iso).toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit' });
}

export function QueueCard({
  vm,
  canManage,
  busy = false,
  onStatus,
}: {
  vm: QueueCardVM;
  canManage: boolean;
  busy?: boolean;
  onStatus: (status: QueueStatus) => void;
}) {
  const { t } = useTranslation();
  return (
    <Card withBorder padding="sm" radius="sm">
      <Group justify="space-between" wrap="nowrap">
        <Stack gap={2}>
          <Group gap="xs">
            <Badge
              size="lg"
              color={statusColor[vm.status]}
              aria-label={`#${vm.queueNumber} — ${t(`queue.${vm.status}`)}`}
            >
              #{vm.queueNumber}
            </Badge>
            <Text size="sm" lineClamp={1}>
              {vm.patientName}
            </Text>
          </Group>
          {vm.serviceName && (
            <Text size="xs" c="dimmed">
              {vm.serviceName}
            </Text>
          )}
          <Text size="xs" c="dimmed">
            {vm.status === 'in_progress' && vm.calledAt
              ? `${t('queue.called_at')} ${hhmm(vm.calledAt)}`
              : hhmm(vm.createdAt)}
          </Text>
        </Stack>
        {canManage && vm.status === 'waiting' && (
          <ActionIcon
            color="blue"
            disabled={busy}
            onClick={() => onStatus('in_progress')}
            aria-label={t('queue.call')}
          >
            <IconPlayerPlay size={16} />
          </ActionIcon>
        )}
        {canManage && vm.status === 'in_progress' && (
          <Group gap="xs" wrap="nowrap">
            <Button size="xs" color="teal" disabled={busy} onClick={() => onStatus('done')}>
              {t('queue.done')}
            </Button>
            <ActionIcon
              color="red"
              variant="subtle"
              disabled={busy}
              onClick={() => onStatus('missed')}
              aria-label={t('queue.missed')}
            >
              <IconX size={16} />
            </ActionIcon>
          </Group>
        )}
      </Group>
    </Card>
  );
}
