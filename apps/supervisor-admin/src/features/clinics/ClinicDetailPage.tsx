import { Button, Group, Paper, Stack, Switch, Text, Title } from '@mantine/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { authFetch } from '../../lib/api';
import type { ClinicDetail } from './clinics.types';

const ALL_MODULES = [
  'patients',
  'appointments',
  'queue',
  'cashier',
  'reports',
  'staff',
  'clinical',
  'lab-orders',
  'patient-images',
  'prescriptions',
  'consent',
  'erp',
  'payroll',
  'inventory',
  'branches',
];

const fetchClinicDetail = async (id: string): Promise<ClinicDetail> => {
  const res = await authFetch(`/v1/admin/clinics/${id}`);
  if (!res.ok) throw new Error('Klinika topilmadi');
  return res.json();
};

export const ClinicDetailPage = () => {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();

  const { data, isError } = useQuery({
    queryKey: ['clinic', id],
    queryFn: () => fetchClinicDetail(id ?? ''),
    enabled: Boolean(id),
  });

  const updateModules = useMutation({
    mutationFn: async (modules: string[]) => {
      if (!data?.license) return;
      await authFetch(`/v1/admin/licenses/${data.license.licenseKey}/modules`, {
        method: 'PATCH',
        body: JSON.stringify({ modules }),
      });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['clinic', id] }),
  });

  const reactivate = useMutation({
    mutationFn: async () => {
      if (!data?.license) return;
      const fp = prompt('Yangi fingerprint kiriting:');
      if (!fp) return;
      await authFetch('/v1/reactivate', {
        method: 'POST',
        body: JSON.stringify({ licenseKey: data.license.licenseKey, fingerprint: fp }),
      });
    },
  });

  if (isError) return <Text c="red">Klinika topilmadi</Text>;
  if (!data) return null;

  const activeModules: string[] = data.license?.modules ?? [];

  const toggle = (mod: string) => {
    const updated = activeModules.includes(mod)
      ? activeModules.filter((m: string) => m !== mod)
      : [...activeModules, mod];
    updateModules.mutate(updated);
  };

  return (
    <>
      <Title order={2} mb="md">
        {data.clinic.name}
      </Title>
      <Paper p="md" withBorder mb="md">
        <Text fw={500}>Litsenziya: {data.license?.licenseKey}</Text>
        <Text c="dimmed">Tarif: {data.license?.plan}</Text>
        <Text c="dimmed">
          Amal qilish:{' '}
          {data.license?.expiresAt
            ? new Date(data.license.expiresAt).toLocaleDateString('uz')
            : '—'}
        </Text>
        <Text c="dimmed">Grace period: {data.license?.gracePeriodDays} kun</Text>
        <Group mt="sm">
          <Button size="xs" variant="outline" onClick={() => reactivate.mutate()}>
            Reactivate
          </Button>
        </Group>
      </Paper>
      <Title order={4} mb="sm">
        Modullar
      </Title>
      <Stack gap="xs">
        {ALL_MODULES.map((mod) => (
          <Group key={mod} justify="space-between">
            <Text>{mod}</Text>
            <Switch checked={activeModules.includes(mod)} onChange={() => toggle(mod)} />
          </Group>
        ))}
      </Stack>
    </>
  );
};
