import type { QueueStatus } from '@dental/api-client';
import {
  ActionIcon,
  Badge,
  Button,
  Card,
  Container,
  Group,
  Modal,
  Select,
  Stack,
  Text,
  Title,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { IconPlayerPlay, IconPlus, IconX } from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '@/lib/api.ts';
import { useAuthStore } from '@/stores/auth-store.ts';

const statusColor: Record<QueueStatus, string> = {
  waiting: 'yellow',
  in_progress: 'blue',
  done: 'teal',
  missed: 'red',
};

export function QueuePage() {
  const { t } = useTranslation();
  const { hasPermission, activeBranchId } = useAuthStore();
  const qc = useQueryClient();
  const [opened, { open, close }] = useDisclosure(false);
  const [branchFilter, setBranchFilter] = useState<string | null>(activeBranchId);
  const [selectedPatient, setSelectedPatient] = useState<string | null>(null);
  const [selectedService, setSelectedService] = useState<string | null>(null);

  const branches = useQuery({ queryKey: ['branches'], queryFn: api.branches.list });
  const patients = useQuery({
    queryKey: ['patients', 'list-all'],
    queryFn: () => api.patients.list({ pageSize: 100 }),
  });
  const services = useQuery({ queryKey: ['services'], queryFn: api.services.list });

  const queueQuery = useQuery({
    queryKey: ['queue', branchFilter],
    queryFn: () => api.queue.today(branchFilter ?? ''),
    enabled: !!branchFilter,
    refetchInterval: 10_000, // auto-refresh every 10s
  });

  const createMut = useMutation({
    mutationFn: () => {
      if (!branchFilter) throw new Error('No branch');
      return api.queue.create({
        branchId: branchFilter,
        patientId: selectedPatient ?? undefined,
        serviceId: selectedService ?? undefined,
      });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['queue'] });
      close();
      setSelectedPatient(null);
      setSelectedService(null);
    },
  });

  const updateStatusMut = useMutation({
    mutationFn: ({ id, status }: { id: string; status: QueueStatus }) =>
      api.queue.updateStatus(id, status),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['queue'] }),
  });

  const waiting = (queueQuery.data ?? []).filter((q) => q.status === 'waiting');
  const inProgress = (queueQuery.data ?? []).filter((q) => q.status === 'in_progress');
  const done = (queueQuery.data ?? []).filter((q) => q.status === 'done' || q.status === 'missed');

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
            {/* Waiting */}
            <Card withBorder padding="md" radius="md">
              <Stack gap="sm">
                <Text fw={600} size="lg">
                  ⏳ {t('queue.waiting')} ({waiting.length})
                </Text>
                {waiting.length === 0 && (
                  <Text c="dimmed" size="sm">
                    —
                  </Text>
                )}
                {waiting.map((q) => {
                  const patient = patients.data?.data.find((p) => p.id === q.patientId);
                  return (
                    <Card key={q.id} withBorder padding="sm" radius="sm">
                      <Group justify="space-between">
                        <Stack gap={2}>
                          <Group gap="xs">
                            <Badge size="lg" color="yellow">
                              #{q.queueNumber}
                            </Badge>
                            <Text size="sm">{patient?.fullName ?? '—'}</Text>
                          </Group>
                          <Text size="xs" c="dimmed">
                            {new Date(q.createdAt).toLocaleTimeString('uz-UZ', {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </Text>
                        </Stack>
                        {hasPermission('queue.manage') && (
                          <ActionIcon
                            color="blue"
                            onClick={() =>
                              updateStatusMut.mutate({ id: q.id, status: 'in_progress' })
                            }
                          >
                            <IconPlayerPlay size={16} />
                          </ActionIcon>
                        )}
                      </Group>
                    </Card>
                  );
                })}
              </Stack>
            </Card>

            {/* In Progress */}
            <Card withBorder padding="md" radius="md">
              <Stack gap="sm">
                <Text fw={600} size="lg">
                  🔄 {t('queue.in_progress')} ({inProgress.length})
                </Text>
                {inProgress.length === 0 && (
                  <Text c="dimmed" size="sm">
                    —
                  </Text>
                )}
                {inProgress.map((q) => {
                  const patient = patients.data?.data.find((p) => p.id === q.patientId);
                  return (
                    <Card key={q.id} withBorder padding="sm" radius="sm">
                      <Group justify="space-between">
                        <Stack gap={2}>
                          <Group gap="xs">
                            <Badge size="lg" color="blue">
                              #{q.queueNumber}
                            </Badge>
                            <Text size="sm">{patient?.fullName ?? '—'}</Text>
                          </Group>
                          {q.calledAt && (
                            <Text size="xs" c="dimmed">
                              {t('queue.called_at')}{' '}
                              {new Date(q.calledAt).toLocaleTimeString('uz-UZ', {
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </Text>
                          )}
                        </Stack>
                        {hasPermission('queue.manage') && (
                          <Group gap="xs">
                            <Button
                              size="xs"
                              color="teal"
                              onClick={() => updateStatusMut.mutate({ id: q.id, status: 'done' })}
                            >
                              {t('queue.done')}
                            </Button>
                            <ActionIcon
                              color="red"
                              variant="subtle"
                              onClick={() => updateStatusMut.mutate({ id: q.id, status: 'missed' })}
                            >
                              <IconX size={16} />
                            </ActionIcon>
                          </Group>
                        )}
                      </Group>
                    </Card>
                  );
                })}
              </Stack>
            </Card>

            {/* Done/Missed */}
            <Card withBorder padding="md" radius="md">
              <Stack gap="sm">
                <Text fw={600} size="lg">
                  ✓ {t('queue.completed')} ({done.length})
                </Text>
                {done.length === 0 && (
                  <Text c="dimmed" size="sm">
                    —
                  </Text>
                )}
                {done.map((q) => {
                  const patient = patients.data?.data.find((p) => p.id === q.patientId);
                  return (
                    <Card key={q.id} withBorder padding="xs" radius="sm">
                      <Group gap="xs">
                        <Badge size="md" color={statusColor[q.status]}>
                          #{q.queueNumber}
                        </Badge>
                        <Text size="xs">{patient?.fullName ?? '—'}</Text>
                        <Text size="xs" c="dimmed" ml="auto">
                          {q.status === 'done' ? '✓' : '✗'}
                        </Text>
                      </Group>
                    </Card>
                  );
                })}
              </Stack>
            </Card>
          </Group>
        )}
      </Stack>

      <Modal opened={opened} onClose={close} title={t('queue.new_ticket')}>
        <Stack gap="md">
          <Select
            label={t('queue.patient')}
            data={patients.data?.data.map((p) => ({ value: p.id, label: p.fullName })) ?? []}
            searchable
            clearable
            value={selectedPatient}
            onChange={setSelectedPatient}
          />
          <Select
            label={t('queue.service')}
            data={
              services.data
                ?.filter((s) => s.isActive)
                .map((s) => ({
                  value: s.id,
                  label: s.nameUz,
                })) ?? []
            }
            searchable
            clearable
            value={selectedService}
            onChange={setSelectedService}
          />
          <Group justify="flex-end">
            <Button variant="default" onClick={close}>
              {t('common.cancel')}
            </Button>
            <Button onClick={() => createMut.mutate()} loading={createMut.isPending}>
              {t('queue.add')}
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Container>
  );
}
