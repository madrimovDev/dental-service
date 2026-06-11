import type { QueueStatus } from '@dental/api-client';
import { Button, Container, Group, Select, Stack, Text, Title } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { IconPlus } from '@tabler/icons-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
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
import { QueueColumn, titleKey } from './QueueColumn';

export function QueueBoard() {
  const { t } = useTranslation();
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

  const columns = useMemo(() => groupByStatus(queue.data ?? []), [queue.data]);
  const canManage = hasPermission('queue.manage');

  const onStatus = (id: string, status: QueueStatus) => updateStatus.mutate({ id, status });

  return (
    <Container size="xl">
      <Stack gap="lg">
        <Group justify="space-between">
          <Title order={2}>{t('queue.title')}</Title>
          <Group>
            <Select
              data={branches.data?.map((b) => ({ value: b.id, label: b.name })) ?? []}
              value={branchFilter}
              onChange={setBranchFilter}
              placeholder={t('queue.select_branch')}
            />
            {hasPermission('queue.create') && (
              <Button leftSection={<IconPlus size={18} />} onClick={open} disabled={!branchFilter}>
                {t('queue.new_ticket')}
              </Button>
            )}
          </Group>
        </Group>

        {!branchFilter && <Text c="dimmed">{t('queue.select_branch_hint')}</Text>}

        {branchFilter && (
          <Group align="flex-start" grow>
            {columns.map((column) => (
              <QueueColumn
                key={column.key}
                column={column}
                title={t(titleKey[column.key])}
                lookups={lookups}
                canManage={canManage}
                onStatus={onStatus}
              />
            ))}
          </Group>
        )}
      </Stack>

      {branchFilter && <CheckInDialog opened={opened} onClose={close} branchId={branchFilter} />}
    </Container>
  );
}
