import type { LabOrderStatus, LabOrderType } from '@dental/api-client';
import { Mono, StateView, StatusPill, Tag } from '@dental/ui';
import {
  ActionIcon,
  Box,
  Button,
  Card,
  Group,
  Modal,
  NumberInput,
  Select,
  Stack,
  Text,
  Textarea,
  TextInput,
  Title,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { useDisclosure } from '@mantine/hooks';
import { IconDental, IconPlus, IconTrash } from '@tabler/icons-react';
import { zod4Resolver } from 'mantine-form-zod-resolver';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@/stores/auth-store.ts';
import { useCreateLabOrder, useLabOrders, useUpdateLabOrderStatus } from '../../clinical.api';
import { parseToothNumbers, toLabOrderVM } from '../../clinical.mappers';
import { type LabOrderFormValues, labOrderFormSchema } from '../../clinical.schema';

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

export function LabOrdersTab({ patientId }: Props) {
  const { t } = useTranslation();
  const { user, hasPermission } = useAuthStore();
  const [opened, { open, close }] = useDisclosure(false);

  const form = useForm<LabOrderFormValues>({
    initialValues: {
      labName: '',
      orderType: 'crown',
      expectedDate: '',
      cost: undefined,
      notes: '',
      items: [],
    },
    validate: zod4Resolver(labOrderFormSchema),
  });

  const listQuery = useLabOrders(patientId);
  const createMut = useCreateLabOrder(patientId);
  const updateStatusMut = useUpdateLabOrderStatus(patientId);

  const canManage = hasPermission('lab_order.manage');
  const canView = hasPermission('lab_order.view');

  if (!canView) return <Text c="dimmed">{t('patients.no_medical_permission')}</Text>;

  const addItem = () => {
    // Barcha matn maydonlari '' bilan boshlanadi — getInputProps'siz undefined
    // bo'lsa TextInput uncontrolled→controlled o'tib React warning beradi.
    form.insertListItem('items', {
      description: '',
      toothNumbersText: '',
      material: '',
      shade: '',
    });
  };

  const submit = form.onSubmit((values) => {
    if (!user) return;
    createMut.mutate(
      {
        patientId,
        doctorId: user.id,
        labName: values.labName,
        orderType: values.orderType as LabOrderType,
        items: values.items.map((i) => ({
          description: i.description,
          toothNumbers: i.toothNumbersText ? parseToothNumbers(i.toothNumbersText) : undefined,
          // bo'sh string → undefined (oldingi raw-useState xulqini saqlash).
          material: i.material || undefined,
          shade: i.shade || undefined,
          quantity: i.quantity,
        })),
        // <input type="date"> date-only string beradi; backend timestamptz uchun
        // ISO datetime kutadi (z.iso.datetime()) — yuborishdan oldin aylantiramiz (CLI-147).
        expectedDate: values.expectedDate ? new Date(values.expectedDate).toISOString() : undefined,
        cost: values.cost,
        notes: values.notes || undefined,
      },
      {
        onSuccess: () => {
          form.reset();
          close();
        },
      },
    );
  });

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

      {listQuery.isError ? (
        <StateView
          status="error"
          title={t('states.error_title')}
          retryLabel={t('states.retry')}
          onRetry={() => listQuery.refetch()}
        />
      ) : listQuery.isLoading ? (
        <StateView status="loading" skeleton="cards" />
      ) : (listQuery.data?.length ?? 0) === 0 ? (
        <StateView status="empty" title={t('lab_order.empty')} />
      ) : (
        listQuery.data?.map(toLabOrderVM).map((vm) => (
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
                  {it.shade && `, ${t('lab_order.shade')}: ${it.shade}`}
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
        ))
      )}

      <Modal opened={opened} onClose={close} title={t('lab_order.create')} size="xl">
        <form onSubmit={submit}>
          <Stack gap="md">
            <Group grow>
              <TextInput
                label={t('lab_order.lab_name')}
                required
                {...form.getInputProps('labName')}
              />
              <Select
                label={t('lab_order.order_type')}
                data={TYPE_OPTIONS.map((tp) => ({
                  value: tp,
                  label: t(`lab_order.type_${tp}`),
                }))}
                {...form.getInputProps('orderType')}
              />
            </Group>
            <Group grow>
              <TextInput
                label={t('lab_order.expected_date')}
                type="date"
                {...form.getInputProps('expectedDate')}
              />
              <NumberInput
                label={t('lab_order.cost')}
                min={0}
                {...form.getInputProps('cost')}
                onChange={(v) => form.setFieldValue('cost', typeof v === 'number' ? v : undefined)}
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
            {form.values.items.map((_, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: ephemeral draft list
              <Card withBorder key={`item-${i}`} padding="sm">
                <Stack gap="xs">
                  <Group justify="space-between">
                    <Text fw={600}>#{i + 1}</Text>
                    <ActionIcon
                      color="red"
                      variant="subtle"
                      onClick={() => form.removeListItem('items', i)}
                    >
                      <IconTrash size={16} />
                    </ActionIcon>
                  </Group>
                  <TextInput
                    label={t('lab_order.description')}
                    {...form.getInputProps(`items.${i}.description`)}
                  />
                  <Group grow>
                    <TextInput
                      label={t('lab_order.tooth_numbers')}
                      placeholder="26, 27"
                      {...form.getInputProps(`items.${i}.toothNumbersText`)}
                    />
                    <TextInput
                      label={t('lab_order.material')}
                      {...form.getInputProps(`items.${i}.material`)}
                    />
                    <TextInput
                      label={t('lab_order.shade')}
                      {...form.getInputProps(`items.${i}.shade`)}
                    />
                    <NumberInput
                      label={t('lab_order.quantity')}
                      min={1}
                      {...form.getInputProps(`items.${i}.quantity`)}
                      onChange={(v) =>
                        form.setFieldValue(
                          `items.${i}.quantity`,
                          typeof v === 'number' ? v : undefined,
                        )
                      }
                    />
                  </Group>
                </Stack>
              </Card>
            ))}
            <Textarea label={t('lab_order.notes')} rows={2} {...form.getInputProps('notes')} />
            <Group justify="flex-end">
              <Button variant="default" onClick={close}>
                {t('common.cancel')}
              </Button>
              <Button type="submit" loading={createMut.isPending} disabled={!form.isValid()}>
                {t('lab_order.save')}
              </Button>
            </Group>
          </Stack>
        </form>
      </Modal>
    </Stack>
  );
}
