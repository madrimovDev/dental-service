import type { AppointmentStatus } from '@dental/api-client';
import {
  Badge,
  Button,
  Card,
  Container,
  Group,
  Modal,
  MultiSelect,
  Select,
  Stack,
  Text,
  Textarea,
  Title,
} from '@mantine/core';
import { DateTimePicker } from '@mantine/dates';
import { useForm } from '@mantine/form';
import { useDisclosure } from '@mantine/hooks';
import { IconCalendarPlus } from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { zodResolver } from 'mantine-form-zod-resolver';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { api } from '@/lib/api.ts';
import { useAuthStore } from '@/stores/auth-store.ts';

const schema = z.object({
  branchId: z.string().min(1),
  patientId: z.string().min(1),
  doctorId: z.string().min(1),
  startTime: z.date(),
  endTime: z.date(),
  serviceIds: z.array(z.string()).default([]),
  notes: z.string().optional(),
});
type FormValues = z.infer<typeof schema>;

const statusColor: Record<AppointmentStatus, string> = {
  scheduled: 'blue',
  confirmed: 'cyan',
  in_progress: 'orange',
  completed: 'teal',
  no_show: 'red',
  cancelled: 'gray',
};

const fmtTime = (iso: string) => {
  const d = new Date(iso);
  return d.toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit' });
};
const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('uz-UZ');

export function AppointmentsPage() {
  const { t } = useTranslation();
  const { hasPermission, activeBranchId } = useAuthStore();
  const qc = useQueryClient();
  const [opened, { open, close }] = useDisclosure(false);
  const [branchFilter, setBranchFilter] = useState<string | null>(activeBranchId);

  const branches = useQuery({ queryKey: ['branches'], queryFn: api.branches.list });
  const patients = useQuery({
    queryKey: ['patients', 'list-all'],
    queryFn: () => api.patients.list({ pageSize: 100 }),
  });
  const services = useQuery({ queryKey: ['services'], queryFn: api.services.list });
  const users = useQuery({
    queryKey: ['users', 'assignments'],
    queryFn: api.users.listAssignments,
  });

  // Next 7 days
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const weekEnd = new Date(today);
  weekEnd.setDate(weekEnd.getDate() + 7);

  const apptsQuery = useQuery({
    queryKey: ['appointments', { branchFilter, from: today.toISOString() }],
    queryFn: () =>
      api.appointments.list({
        branchId: branchFilter ?? undefined,
        from: today.toISOString(),
        to: weekEnd.toISOString(),
      }),
  });

  const form = useForm<FormValues>({
    initialValues: {
      branchId: activeBranchId ?? '',
      patientId: '',
      doctorId: '',
      startTime: new Date(),
      endTime: new Date(Date.now() + 30 * 60 * 1000),
      serviceIds: [],
      notes: '',
    },
    validate: zodResolver(schema),
  });

  const createMut = useMutation({
    mutationFn: (values: FormValues) =>
      api.appointments.create({
        branchId: values.branchId,
        patientId: values.patientId,
        doctorId: values.doctorId,
        startTime: values.startTime.toISOString(),
        endTime: values.endTime.toISOString(),
        serviceIds: values.serviceIds,
        notes: values.notes,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['appointments'] });
      close();
      form.reset();
    },
  });

  const cancelMut = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason?: string }) =>
      api.appointments.cancel(id, reason),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['appointments'] }),
  });

  // Group appointments by date
  const grouped = (apptsQuery.data ?? []).reduce<Record<string, typeof apptsQuery.data>>(
    (acc, a) => {
      const d = a.startTime.slice(0, 10);
      if (!acc[d]) acc[d] = [];
      acc[d]?.push(a);
      return acc;
    },
    {},
  );

  const doctorOptions =
    users.data
      ?.filter((a) => a.roleName.toLowerCase().includes('doctor') || a.isActive)
      .map((a) => ({ value: a.userId, label: a.userFullName ?? a.userEmail })) ?? [];
  const uniqueDoctors = Array.from(new Map(doctorOptions.map((d) => [d.value, d])).values());

  return (
    <Container size="xl">
      <Stack gap="lg">
        <Group justify="space-between">
          <Title order={2}>{t('appointments.title')}</Title>
          <Group>
            <Select
              data={branches.data?.map((b) => ({ value: b.id, label: b.name })) ?? []}
              value={branchFilter}
              onChange={setBranchFilter}
              placeholder={t('appointments.filter_branch')}
              clearable
            />
            {hasPermission('appointment.create') && (
              <Button leftSection={<IconCalendarPlus size={18} />} onClick={open}>
                {t('appointments.create')}
              </Button>
            )}
          </Group>
        </Group>

        {apptsQuery.isLoading && <Text>{t('common.loading')}</Text>}
        {apptsQuery.data && apptsQuery.data.length === 0 && (
          <Text c="dimmed">{t('appointments.empty_week')}</Text>
        )}
        {Object.entries(grouped).map(([date, items]) => (
          <Stack key={date} gap="sm">
            <Text fw={600} size="sm" c="dimmed">
              {fmtDate(date)}
            </Text>
            {items?.map((a) => {
              const patient = patients.data?.data.find((p) => p.id === a.patientId);
              const doctor = users.data?.find((u) => u.userId === a.doctorId);
              return (
                <Card key={a.id} withBorder padding="md" radius="md">
                  <Group justify="space-between">
                    <Stack gap={2}>
                      <Group gap="xs">
                        <Text fw={600} size="lg">
                          {fmtTime(a.startTime)} — {fmtTime(a.endTime)}
                        </Text>
                        <Badge color={statusColor[a.status]}>
                          {t(`appointments.status.${a.status}`)}
                        </Badge>
                      </Group>
                      <Text size="sm">{patient?.fullName ?? '—'}</Text>
                      <Text size="xs" c="dimmed">
                        {doctor?.userFullName ?? doctor?.userEmail ?? '—'}
                      </Text>
                    </Stack>
                    {hasPermission('appointment.cancel') &&
                      a.status !== 'cancelled' &&
                      a.status !== 'completed' && (
                        <Button
                          variant="subtle"
                          color="red"
                          size="xs"
                          onClick={() => {
                            const reason = prompt(t('appointments.cancel_reason')) ?? undefined;
                            cancelMut.mutate({ id: a.id, reason });
                          }}
                        >
                          {t('common.cancel')}
                        </Button>
                      )}
                  </Group>
                </Card>
              );
            })}
          </Stack>
        ))}
      </Stack>

      <Modal opened={opened} onClose={close} title={t('appointments.create')} size="lg">
        <form onSubmit={form.onSubmit((values) => createMut.mutate(values))}>
          <Stack gap="md">
            <Select
              label={t('appointments.branch')}
              data={branches.data?.map((b) => ({ value: b.id, label: b.name })) ?? []}
              required
              {...form.getInputProps('branchId')}
            />
            <Select
              label={t('appointments.patient')}
              data={patients.data?.data.map((p) => ({ value: p.id, label: p.fullName })) ?? []}
              searchable
              required
              {...form.getInputProps('patientId')}
            />
            <Select
              label={t('appointments.doctor')}
              data={uniqueDoctors}
              required
              {...form.getInputProps('doctorId')}
            />
            <Group grow>
              <DateTimePicker
                label={t('appointments.start_time')}
                required
                {...form.getInputProps('startTime')}
              />
              <DateTimePicker
                label={t('appointments.end_time')}
                required
                {...form.getInputProps('endTime')}
              />
            </Group>
            <MultiSelect
              label={t('appointments.services')}
              data={
                services.data
                  ?.filter((s) => s.isActive)
                  .map((s) => ({ value: s.id, label: s.nameUz })) ?? []
              }
              searchable
              {...form.getInputProps('serviceIds')}
            />
            <Textarea label={t('appointments.notes')} rows={2} {...form.getInputProps('notes')} />

            <Group justify="flex-end">
              <Button variant="default" onClick={close}>
                {t('common.cancel')}
              </Button>
              <Button type="submit" loading={createMut.isPending}>
                {t('common.save')}
              </Button>
            </Group>
          </Stack>
        </form>
      </Modal>
    </Container>
  );
}
