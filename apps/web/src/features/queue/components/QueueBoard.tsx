import type { QueueStatus, QueueTicket } from '@dental/api-client';
import { StateView } from '@dental/ui';
import { Button, Container, Select, Stack, Text } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { IconLayoutGrid, IconPlus } from '@tabler/icons-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/auth-store.ts';
import {
  useBranches,
  usePatientsAll,
  useQueueToday,
  useServices,
  useUpdateQueueStatus,
} from '../queue.api';
import { groupByStatus } from '../queue.mappers';
import type { QueueLookups } from '../queue.types';
import { CheckInDialog } from './CheckInDialog';
import classes from './QueueBoard.module.css';
import { QueueColumn, titleKey } from './QueueColumn';

/** Presentation formatter — schema o'zgarmaydi (DS5 spec §3.4). */
function formatTicketNumber(queueNumber: number): string {
  return `A-${String(queueNumber).padStart(2, '0')}`;
}

/** DATA-GAP: kutish vaqti createdAt'dan lokal hisoblanadi (per-ticket field yo'q). */
function waitedMinutes(createdAt: string): number {
  return Math.max(0, Math.round((Date.now() - new Date(createdAt).getTime()) / 60_000));
}

export function QueueBoard() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { hasPermission, activeBranchId } = useAuthStore();
  const [branchFilter, setBranchFilter] = useState<string | null>(activeBranchId);
  const [opened, { open, close }] = useDisclosure(false);

  const branches = useBranches();
  const patients = usePatientsAll();
  const services = useServices();
  const queue = useQueueToday(branchFilter);
  const updateStatus = useUpdateQueueStatus();

  const lookups: QueueLookups = useMemo(
    () => ({
      patientNameById: new Map((patients.data?.data ?? []).map((p) => [p.id, p.fullName] as const)),
      serviceNameById: new Map((services.data ?? []).map((s) => [s.id, s.nameUz] as const)),
    }),
    [patients.data, services.data],
  );

  const tickets = queue.data ?? [];
  const columns = useMemo(() => groupByStatus(tickets), [tickets]);
  const canManage = hasPermission('queue.manage');

  // Lokal derivatsiya (yangi hook YO'Q): now = birinchi in_progress, next = birinchi waiting.
  const nowServing = useMemo(
    () => tickets.find((tk: QueueTicket) => tk.status === 'in_progress'),
    [tickets],
  );
  const nextWaiting = useMemo(
    () => tickets.find((tk: QueueTicket) => tk.status === 'waiting'),
    [tickets],
  );

  const onStatus = (id: string, status: QueueStatus) => updateStatus.mutate({ id, status });
  // Faqat hozir o'zgartirilayotgan karta tugmalarini bloklash (per-card), butun board emas.
  const busyId = updateStatus.isPending ? updateStatus.variables?.id : undefined;

  const patientName = (id: string | null) => (id ? (lookups.patientNameById.get(id) ?? '—') : '—');
  const serviceName = (id: string | null) =>
    id ? (lookups.serviceNameById.get(id) ?? null) : null;

  return (
    <Container size="xl">
      <Stack gap="lg">
        <div className={classes.header}>
          <div className={classes.titleBlock}>
            <span className={classes.title}>{t('queue.title')}</span>
            <span className={classes.subtitle}>
              {[branches.data?.find((b) => b.id === branchFilter)?.name, t('queue.live_subtitle')]
                .filter(Boolean)
                .join(' · ')}
            </span>
          </div>
          <div className={classes.headerActions}>
            <Button
              variant="outline"
              color="gray"
              className={classes.boardButton}
              leftSection={<IconLayoutGrid size={18} />}
              onClick={() => navigate('/queue/board')}
            >
              {t('queue.display_board')}
            </Button>
            <Select
              data={branches.data?.map((b) => ({ value: b.id, label: b.name })) ?? []}
              value={branchFilter}
              onChange={setBranchFilter}
              placeholder={t('queue.select_branch')}
              aria-label={t('queue.select_branch')}
            />
            {hasPermission('queue.create') && (
              <Button leftSection={<IconPlus size={18} />} onClick={open} disabled={!branchFilter}>
                {t('queue.new_ticket')}
              </Button>
            )}
          </div>
        </div>

        {!branchFilter && <Text c="dimmed">{t('queue.select_branch_hint')}</Text>}

        {branchFilter &&
          (queue.isLoading ? (
            <StateView status="loading" skeleton="table" />
          ) : queue.isError ? (
            <StateView
              status="error"
              title={t('states.error_title')}
              retryLabel={t('states.retry')}
              onRetry={() => queue.refetch()}
            />
          ) : (
            <>
              <div className={classes.heroRow}>
                <div className={classes.hero}>
                  <span className={classes.eyebrow}>{t('queue.now_serving')}</span>
                  {nowServing ? (
                    <div className={classes.heroBody}>
                      <span className={classes.heroNumber}>
                        {formatTicketNumber(nowServing.queueNumber)}
                      </span>
                      <span className={classes.heroDivider} />
                      <div className={classes.heroMeta}>
                        <span className={classes.heroPatient}>
                          {patientName(nowServing.patientId)}
                        </span>
                        {serviceName(nowServing.serviceId) && (
                          <span className={classes.heroService}>
                            {serviceName(nowServing.serviceId)}
                          </span>
                        )}
                      </div>
                    </div>
                  ) : (
                    <span className={classes.heroPlaceholder}>{t('queue.not_called_yet')}</span>
                  )}
                </div>

                <div className={classes.next}>
                  <span className={classes.nextEyebrow}>{t('queue.next_in_queue')}</span>
                  {nextWaiting ? (
                    <>
                      <span className={classes.nextNumber}>
                        {formatTicketNumber(nextWaiting.queueNumber)}
                      </span>
                      <span className={classes.nextName}>{patientName(nextWaiting.patientId)}</span>
                      <span className={classes.nextWaited}>
                        {t('queue.waited_minutes', {
                          count: waitedMinutes(nextWaiting.createdAt),
                        })}
                      </span>
                      {canManage && (
                        <Button
                          className={classes.callButton}
                          disabled={busyId === nextWaiting.id}
                          onClick={() => onStatus(nextWaiting.id, 'in_progress')}
                        >
                          {t('queue.call_arrow')}
                        </Button>
                      )}
                    </>
                  ) : (
                    <span className={classes.nextPlaceholder}>{t('queue.not_called_yet')}</span>
                  )}
                </div>
              </div>

              <div className={classes.board}>
                {columns.map((column) => (
                  <QueueColumn
                    key={column.key}
                    column={column}
                    title={t(titleKey[column.key])}
                    lookups={lookups}
                    canManage={canManage}
                    busyId={busyId}
                    onStatus={onStatus}
                  />
                ))}
              </div>
            </>
          ))}
      </Stack>

      {branchFilter && <CheckInDialog opened={opened} onClose={close} branchId={branchFilter} />}
    </Container>
  );
}
