import type { PrescriptionItem } from '@dental/api-client';
import {
  ActionIcon,
  Box,
  Button,
  Card,
  Group,
  Modal,
  NumberInput,
  Paper,
  Stack,
  Text,
  Textarea,
  TextInput,
  Title,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { IconPlus, IconTrash } from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '@/lib/api.ts';
import { useAuthStore } from '@/stores/auth-store.ts';

type Props = { patientId: string };

type ItemDraft = {
  medicationName: string;
  dosage: string;
  frequency: string;
  durationDays?: number;
  instructions?: string;
};

export function PrescriptionsTab({ patientId }: Props) {
  const { t } = useTranslation();
  const { user, hasPermission } = useAuthStore();
  const qc = useQueryClient();
  const [opened, { open, close }] = useDisclosure(false);

  const [diagnosis, setDiagnosis] = useState('');
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState<ItemDraft[]>([]);

  const listQuery = useQuery({
    queryKey: ['prescriptions', patientId],
    queryFn: () => api.prescriptions.list(patientId),
  });

  const createMut = useMutation({
    mutationFn: () => {
      if (!user) throw new Error('No user');
      return api.prescriptions.create({
        patientId,
        doctorId: user.id,
        items: items as PrescriptionItem[],
        diagnosis: diagnosis || undefined,
        notes: notes || undefined,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['prescriptions', patientId] });
      setDiagnosis('');
      setNotes('');
      setItems([]);
      close();
    },
  });

  const canManage = hasPermission('prescription.manage');
  const canView = hasPermission('prescription.view');

  if (!canView) {
    return <Text c="dimmed">{t('patients.no_medical_permission')}</Text>;
  }

  const addItem = () => {
    setItems([...items, { medicationName: '', dosage: '', frequency: '' }]);
  };

  return (
    <Stack gap="md">
      <Group justify="space-between">
        <Title order={4}>{t('prescription.title')}</Title>
        {canManage && (
          <Button leftSection={<IconPlus size={16} />} onClick={open}>
            {t('prescription.create')}
          </Button>
        )}
      </Group>

      {listQuery.isLoading && <Text>{t('common.loading')}</Text>}
      {!listQuery.isLoading && listQuery.data?.length === 0 && (
        <Paper withBorder p="md">
          <Text c="dimmed">{t('prescription.empty')}</Text>
        </Paper>
      )}

      {listQuery.data?.map((rx) => (
        <Card key={rx.id} withBorder padding="md">
          <Stack gap="xs">
            <Group justify="space-between">
              <Text fw={700}>💊 {new Date(rx.issuedDate).toLocaleDateString()}</Text>
              {rx.diagnosis && (
                <Text size="sm" c="dimmed">
                  {t('prescription.diagnosis')}: {rx.diagnosis}
                </Text>
              )}
            </Group>
            <Box>
              {rx.items.map((it, i) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: stable items from server-side row
                <Text key={`rx-${rx.id}-${i}`} size="sm">
                  <strong>{it.medicationName}</strong> — {it.dosage}, {it.frequency}
                  {it.durationDays && `, ${it.durationDays} kun`}
                  {it.instructions && ` (${it.instructions})`}
                </Text>
              ))}
            </Box>
            {rx.notes && (
              <Text size="sm" c="dimmed">
                {rx.notes}
              </Text>
            )}
          </Stack>
        </Card>
      ))}

      <Modal opened={opened} onClose={close} title={t('prescription.create')} size="xl">
        <Stack gap="md">
          <TextInput
            label={t('prescription.diagnosis')}
            value={diagnosis}
            onChange={(e) => setDiagnosis(e.currentTarget.value)}
          />
          <Group justify="space-between">
            <Text fw={600}>{t('prescription.items')}</Text>
            <Button
              size="xs"
              variant="light"
              leftSection={<IconPlus size={14} />}
              onClick={addItem}
            >
              {t('prescription.add_item')}
            </Button>
          </Group>
          {items.map((it, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: ephemeral draft list
            <Card withBorder key={`item-${i}`} padding="sm">
              <Stack gap="xs">
                <Group justify="space-between">
                  <Text fw={600}>#{i + 1}</Text>
                  <ActionIcon
                    color="red"
                    variant="subtle"
                    onClick={() => setItems(items.filter((_, idx) => idx !== i))}
                  >
                    <IconTrash size={16} />
                  </ActionIcon>
                </Group>
                <TextInput
                  label={t('prescription.medication_name')}
                  value={it.medicationName}
                  onChange={(e) => {
                    const next = [...items];
                    next[i] = { ...it, medicationName: e.currentTarget.value };
                    setItems(next);
                  }}
                />
                <Group grow>
                  <TextInput
                    label={t('prescription.dosage')}
                    value={it.dosage}
                    onChange={(e) => {
                      const next = [...items];
                      next[i] = { ...it, dosage: e.currentTarget.value };
                      setItems(next);
                    }}
                  />
                  <TextInput
                    label={t('prescription.frequency')}
                    placeholder={t('prescription.frequency_placeholder')}
                    value={it.frequency}
                    onChange={(e) => {
                      const next = [...items];
                      next[i] = { ...it, frequency: e.currentTarget.value };
                      setItems(next);
                    }}
                  />
                  <NumberInput
                    label={t('prescription.duration_days')}
                    min={1}
                    value={it.durationDays}
                    onChange={(v) => {
                      const next = [...items];
                      next[i] = { ...it, durationDays: typeof v === 'number' ? v : undefined };
                      setItems(next);
                    }}
                  />
                </Group>
                <Textarea
                  label={t('prescription.instructions')}
                  value={it.instructions ?? ''}
                  onChange={(e) => {
                    const next = [...items];
                    next[i] = { ...it, instructions: e.currentTarget.value || undefined };
                    setItems(next);
                  }}
                  rows={2}
                />
              </Stack>
            </Card>
          ))}
          <Textarea
            label={t('prescription.notes')}
            value={notes}
            onChange={(e) => setNotes(e.currentTarget.value)}
            rows={2}
          />
          <Group justify="flex-end">
            <Button variant="default" onClick={close}>
              {t('common.cancel')}
            </Button>
            <Button
              onClick={() => createMut.mutate()}
              loading={createMut.isPending}
              disabled={items.length === 0 || items.some((i) => !i.medicationName || !i.dosage)}
            >
              {t('prescription.save')}
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
}
