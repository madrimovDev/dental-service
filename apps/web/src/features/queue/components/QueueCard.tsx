import type { QueueStatus } from '@dental/api-client';
import { ActionIcon, Button, Group } from '@mantine/core';
import { IconPlayerPlay, IconX } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import type { QueueCardVM } from '../queue.types';
import classes from './QueueCard.module.css';

function hhmm(iso: string) {
  return new Date(iso).toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit' });
}

/** Presentation formatter — schema/API o'zgarmaydi. */
function formatTicketNumber(queueNumber: number) {
  return `A-${String(queueNumber).padStart(2, '0')}`;
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

  const timeLabel =
    vm.status === 'in_progress' && vm.calledAt
      ? `${t('queue.called_at')} ${hhmm(vm.calledAt)}`
      : hhmm(vm.createdAt);
  const metaParts = [vm.serviceName, timeLabel].filter(Boolean);

  return (
    <div className={classes.card}>
      <span className={classes.numberChip}>{formatTicketNumber(vm.queueNumber)}</span>
      <div className={classes.body}>
        <div className={classes.patient}>{vm.patientName}</div>
        {metaParts.length > 0 && <div className={classes.meta}>{metaParts.join(' · ')}</div>}
      </div>
      {canManage && vm.status === 'waiting' && (
        <ActionIcon
          className={classes.actions}
          color="blue"
          disabled={busy}
          onClick={() => onStatus('in_progress')}
          aria-label={t('queue.call')}
        >
          <IconPlayerPlay size={16} />
        </ActionIcon>
      )}
      {canManage && vm.status === 'in_progress' && (
        <Group className={classes.actions} gap="xs" wrap="nowrap">
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
    </div>
  );
}
