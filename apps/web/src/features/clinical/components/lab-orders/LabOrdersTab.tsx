import type { LabOrderItem, LabOrderStatus, LabOrderType } from '@dental/api-client';
import { Mono, StatusPill, Tag } from '@dental/ui';
import {
  ActionIcon,
  Box,
  Button,
  Card,
  Group,
  Modal,
  NumberInput,
  Paper,
  Select,
  Stack,
  Text,
  Textarea,
  TextInput,
  Title,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { IconDental, IconPlus, IconTrash } from '@tabler/icons-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@/stores/auth-store.ts';
import { useCreateLabOrder, useLabOrders, useUpdateLabOrderStatus } from '../../clinical.api';
import { parseToothNumbers, toLabOrderVM } from '../../clinical.mappers';

type Props = { patientId: string };

const TYPE_OPTIONS: LabOrderType[] = [
  'crown',
  'bridge',
  'prosthetic',
  'aligners',
  'denture',
  'inlay_onlay',
  'other',
];

const STATUS_OPTIONS: LabOrderStatus[] = [
  'draft',
  'sent',
  'in_progress',
  'ready',
  'delivered',
  'cancelled',
];

type ItemDraft = LabOrderItem & { toothNumbersText: string };

export function LabOrdersTab({ patientId }: Props) {
  const { t } = useTranslation();
  const { user, hasPermission } = useAuthStore();
  const [opened, { open, close }] = useDisclosure(false);

  const [labName, setLabName] = useState('');
  const [orderType, setOrderType] = useState<LabOrderType>('crown');
  const [expectedDate, setExpectedDate] = useState('');
  const [cost, setCost] = useState<number | undefined>(undefined);
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState<ItemDraft[]>([]);

  const listQuery = useLabOrders(patientId);
  const createMut = useCreateLabOrder(patientId);
  const updateStatusMut = useUpdateLabOrderStatus(patientId);

  const canManage = hasPermission('lab_order.manage');
  const canView = hasPermission('lab_order.view');

  if (!canView) return <Text c="dimmed">{t('patients.no_medical_permission')}</Text>;

  const addItem = () => {
    setItems([...items, { description: '', toothNumbersText: '' }]);
  };

  const resetForm = () => {
    setLabName('');
    setOrderType('crown');
    setExpectedDate('');
    setCost(undefined);
    setNotes('');
    setItems([]);
  };

  const submit = () => {
    if (!user) return;
    createMut.mutate(
      {
        patientId,
        doctorId: user.id,
        labName,
        orderType,
        items: items.map((i) => ({
          description: i.description,
          toothNumbers: i.toothNumbersText ? parseToothNumbers(i.toothNumbersText) : undefined,
          material: i.material,
          shade: i.shade,
          quantity: i.quantity,
        })),
        expectedDate: expectedDate || undefined,
        cost,
        notes: notes || undefined,
      },
      {
        onSuccess: () => {
          resetForm();
          close();
        },
      },
    );
  };

  return (
    <Stack gap="md">
      <Group justify="space-between">
        <Title order={4}>{t('lab_order.title')}</Title>
        {canManage && (
          <Button leftSection={<IconPlus size={16} />} onClick={open}>
            {t('lab_order.create')}
          </Button>
        )}
      </Group>

      {listQuery.isLoading && <Text>{t('common.loading')}</Text>}
      {!listQuery.isLoading && listQuery.data?.length === 0 && (
        <Paper withBorder p="md">
          <Text c="dimmed">{t('lab_order.empty')}</Text>
        </Paper>
      )}

      {listQuery.data?.map(toLabOrderVM).map((vm) => (
        <Card key={vm.id} withBorder padding="md">
          <Stack gap="xs">
            <Group justify="space-between">
              <Box>
                <Group gap={6}>
                  <IconDental size={16} />
                  <Text fw={700}>{vm.labName}</Text>
                </Group>
                <Group gap="xs" mt={4}>
                  <Tag>{t(vm.typeLabelKey)}</Tag>
                  <StatusPill status={vm.statusTone}>{t(vm.statusLabelKey)}</StatusPill>
                  {vm.costText && (
                    <Mono>
                      {vm.costText} {vm.currency}
                    </Mono>
                  )}
                </Group>
              </Box>
              {canManage && (
                <Select
                  size="xs"
                  w={150}
                  value={vm.status}
                  onChange={(v) =>
                    v && updateStatusMut.mutate({ id: vm.id, status: v as LabOrderStatus })
                  }
                  data={STATUS_OPTIONS.map((s) => ({
                    value: s,
                    label: t(`lab_order.status_${s}`),
                  }))}
                />
              )}
            </Group>
            {vm.items.map((it, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: stable items from server-side row
              <Text key={`${vm.id}-item-${i}`} size="sm" pl="md">
                • {it.description}
                {it.toothNumbers.length > 0 &&
                  ` ${t('lab_order.teeth_inline', { teeth: it.toothNumbers.join(', ') })}`}
                {it.material && `, ${it.material}`}
                {it.shade && `, shade: ${it.shade}`}
                {it.quantity && it.quantity > 1 && ` x${it.quantity}`}
              </Text>
            ))}
            {vm.sentDateText && (
              <Text size="xs" c="dimmed">
                {t('lab_order.sent_date')}: {vm.sentDateText}
                {vm.expectedDateText &&
                  ` · ${t('lab_order.expected_date')}: ${vm.expectedDateText}`}
                {vm.deliveredDateText &&
                  ` · ${t('lab_order.delivered_date')}: ${vm.deliveredDateText}`}
              </Text>
            )}
          </Stack>
        </Card>
      ))}

      <Modal opened={opened} onClose={close} title={t('lab_order.create')} size="xl">
        <Stack gap="md">
          <Group grow>
            <TextInput
              label={t('lab_order.lab_name')}
              value={labName}
              onChange={(e) => setLabName(e.currentTarget.value)}
              required
            />
            <Select
              label={t('lab_order.order_type')}
              data={TYPE_OPTIONS.map((tp) => ({
                value: tp,
                label: t(`lab_order.type_${tp}`),
              }))}
              value={orderType}
              onChange={(v) => v && setOrderType(v as LabOrderType)}
            />
          </Group>
          <Group grow>
            <TextInput
              label={t('lab_order.expected_date')}
              type="date"
              value={expectedDate}
              onChange={(e) => setExpectedDate(e.currentTarget.value)}
            />
            <NumberInput
              label={t('lab_order.cost')}
              min={0}
              value={cost}
              onChange={(v) => setCost(typeof v === 'number' ? v : undefined)}
            />
          </Group>
          <Group justify="space-between">
            <Text fw={600}>{t('lab_order.items')}</Text>
            <Button
              size="xs"
              variant="light"
              leftSection={<IconPlus size={14} />}
              onClick={addItem}
            >
              {t('lab_order.add_item')}
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
                  label={t('lab_order.description')}
                  value={it.description}
                  onChange={(e) => {
                    const next = [...items];
                    next[i] = { ...it, description: e.currentTarget.value };
                    setItems(next);
                  }}
                />
                <Group grow>
                  <TextInput
                    label={t('lab_order.tooth_numbers')}
                    placeholder="26, 27"
                    value={it.toothNumbersText}
                    onChange={(e) => {
                      const next = [...items];
                      next[i] = { ...it, toothNumbersText: e.currentTarget.value };
                      setItems(next);
                    }}
                  />
                  <TextInput
                    label={t('lab_order.material')}
                    value={it.material ?? ''}
                    onChange={(e) => {
                      const next = [...items];
                      next[i] = { ...it, material: e.currentTarget.value || undefined };
                      setItems(next);
                    }}
                  />
                  <TextInput
                    label={t('lab_order.shade')}
                    value={it.shade ?? ''}
                    onChange={(e) => {
                      const next = [...items];
                      next[i] = { ...it, shade: e.currentTarget.value || undefined };
                      setItems(next);
                    }}
                  />
                  <NumberInput
                    label={t('lab_order.quantity')}
                    min={1}
                    value={it.quantity ?? 1}
                    onChange={(v) => {
                      const next = [...items];
                      next[i] = { ...it, quantity: typeof v === 'number' ? v : 1 };
                      setItems(next);
                    }}
                  />
                </Group>
              </Stack>
            </Card>
          ))}
          <Textarea
            label={t('lab_order.notes')}
            value={notes}
            onChange={(e) => setNotes(e.currentTarget.value)}
            rows={2}
          />
          <Group justify="flex-end">
            <Button variant="default" onClick={close}>
              {t('common.cancel')}
            </Button>
            <Button
              onClick={submit}
              loading={createMut.isPending}
              disabled={!labName || items.length === 0 || items.some((i) => !i.description)}
            >
              {t('lab_order.save')}
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
}
