import {
  Button,
  CopyButton,
  Group,
  Paper,
  Stack,
  Switch,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { authFetch } from '../../lib/api';
import { fetchClinicDetail } from './clinics.api';

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

export const ClinicDetailPage = () => {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [resetToken, setResetToken] = useState<string | null>(null);

  const { data, isError } = useQuery({
    queryKey: ['clinic', id],
    queryFn: () => fetchClinicDetail(id ?? ''),
    enabled: Boolean(id),
  });

  const updateModules = useMutation({
    mutationFn: async (modules: string[]) => {
      if (!data?.license) return;
      const res = await authFetch(`/v1/admin/licenses/${data.license.licenseKey}/modules`, {
        method: 'PATCH',
        body: JSON.stringify({ modules }),
      });
      if (!res.ok) throw new Error("Modulni yangilab bo'lmadi");
    },
    onSuccess: () => {
      setMutationError(null);
      qc.invalidateQueries({ queryKey: ['clinic', id] });
    },
    onError: (err) => {
      setMutationError(err instanceof Error ? err.message : "Modulni yangilab bo'lmadi");
    },
  });

  const reactivate = useMutation({
    mutationFn: async () => {
      if (!data?.license?.fingerprint) return;
      const res = await authFetch('/v1/reactivate', {
        method: 'POST',
        body: JSON.stringify({
          licenseKey: data.license.licenseKey,
          fingerprint: data.license.fingerprint,
        }),
      });
      if (!res.ok) throw new Error("Litsenziyani qayta faollashtirib bo'lmadi");
    },
    onSuccess: () => {
      setMutationError(null);
      qc.invalidateQueries({ queryKey: ['clinic', id] });
    },
    onError: (err) => {
      setMutationError(
        err instanceof Error ? err.message : "Litsenziyani qayta faollashtirib bo'lmadi",
      );
    },
  });

  const generateResetToken = useMutation({
    mutationFn: async () => {
      if (!data?.license?.id) return null;
      const res = await authFetch(`/v1/${data.license.id}/reset-token`, {
        method: 'POST',
      });
      if (!res.ok) throw new Error("Parol-tiklash tokenini yaratib bo'lmadi");
      return res.json() as Promise<{ resetToken: string; expiresAt: string }>;
    },
    onSuccess: (result) => {
      setMutationError(null);
      if (result) setResetToken(result.resetToken);
    },
    onError: (err) => {
      setMutationError(
        err instanceof Error ? err.message : "Parol-tiklash tokenini yaratib bo'lmadi",
      );
    },
  });

  const deactivate = useMutation({
    mutationFn: async () => {
      if (!data?.clinic) return;
      const ok = confirm(
        'Litsenziyani bekor qilishni tasdiqlaysizmi? Klinika xizmatdan foydalana olmay qoladi.',
      );
      if (!ok) return;
      const res = await authFetch(`/v1/admin/clinics/${data.clinic.id}/deactivate`, {
        method: 'PATCH',
      });
      if (!res.ok) throw new Error("Litsenziyani bekor qilib bo'lmadi");
    },
    onSuccess: () => {
      setMutationError(null);
      qc.invalidateQueries({ queryKey: ['clinic', id] });
    },
    onError: (err) => {
      setMutationError(err instanceof Error ? err.message : "Litsenziyani bekor qilib bo'lmadi");
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
      {mutationError && (
        <Text c="red" mb="md">
          {mutationError}
        </Text>
      )}
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
        <Text c="dimmed">
          Fingerprint: {data.license?.fingerprint ?? '— (hali faollashtirilmagan)'}
        </Text>
        <Text c={data.license?.isActive ? 'teal' : 'red'} mt="xs">
          Holat: {data.license?.isActive ? 'Faol' : 'Bekor qilingan'}
        </Text>
        <Group mt="sm">
          <Button
            size="xs"
            variant="outline"
            onClick={() => reactivate.mutate()}
            disabled={!data.license?.fingerprint}
          >
            Reactivate
          </Button>
          <Button size="xs" variant="outline" color="red" onClick={() => deactivate.mutate()}>
            Bekor qilish
          </Button>
          <Button
            size="xs"
            variant="outline"
            onClick={() => generateResetToken.mutate()}
            loading={generateResetToken.isPending}
          >
            Parol-tiklash tokeni yaratish
          </Button>
        </Group>
        {resetToken && (
          <Stack gap={4} mt="sm">
            <TextInput
              label="Parol-tiklash tokeni"
              value={resetToken}
              readOnly
              rightSection={
                <CopyButton value={resetToken}>
                  {({ copied, copy }) => (
                    <Button size="xs" variant="subtle" onClick={copy}>
                      {copied ? 'Nusxalandi' : 'Nusxalash'}
                    </Button>
                  )}
                </CopyButton>
              }
            />
            <Text size="sm" c="dimmed">
              Bir marta ko'rsatiladi — mijozga bering. 24 soat amal qiladi.
            </Text>
          </Stack>
        )}
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
