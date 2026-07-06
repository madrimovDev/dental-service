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
import { allowedLabOrderStatuses, parseToothNumbers, toLabOrderVM } from '../../clinical.mappers';
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
        <Box
          style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-card)',
            boxShadow: 'var(--shadow-sm)',
            overflow: 'hidden',
          }}
        >
          {/* Table header */}
          <Box
            style={{
              borderBottom: '1px solid var(--border)',
              color: 'var(--ink-3)',
              display: 'grid',
              fontSize: 11,
              fontWeight: 600,
              gap: 12,
              gridTemplateColumns: '40px 1fr 1fr 90px auto',
              letterSpacing: '.02em',
              padding: '10px 18px',
              textTransform: 'uppercase',
            }}
          >
            <span>{t('lab_order.tooth_numbers')}</span>
            <span>{t('lab_order.order_type')}</span>
            <span>
              {t('lab_order.material')} · {t('lab_order.shade')}
            </span>
            <span>{t('lab_order.expected_date')}</span>
            <span style={{ textAlign: 'right' }}>{t('lab_order.status')}</span>
          </Box>

          {listQuery.data?.map(toLabOrderVM).map((vm) => {
            const teeth = vm.items.flatMap((it) => it.toothNumbers);
            const materials = vm.items
              .map((it) => [it.material, it.shade].filter(Boolean).join(' · '))
              .filter(Boolean)
              .join(', ');
            const descriptions = vm.items
              .map((it) =>
                it.quantity && it.quantity > 1
                  ? `${it.description} ×${it.quantity}`
                  : it.description,
              )
              .filter(Boolean);
            return (
              <Box
                key={vm.id}
                style={{
                  borderTop: '1px solid var(--border)',
                  display: 'grid',
                  gap: 12,
                  gridTemplateColumns: '40px 1fr 1fr 90px auto',
                  padding: '14px 18px',
                }}
              >
                {/* Tish */}
                <Box style={{ fontSize: 12 }}>
                  {teeth.length > 0 ? <Mono>{teeth.join(', ')}</Mono> : <span>—</span>}
                </Box>

                {/* Ish turi + lab nomi + tavsif */}
                <Box style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
                  <Group gap={6} wrap="nowrap">
                    <IconDental size={15} style={{ color: 'var(--ink-3)', flex: '0 0 auto' }} />
                    <Text fw={700} size="sm" style={{ color: 'var(--ink)' }} truncate>
                      {vm.labName}
                    </Text>
                  </Group>
                  <Tag>{t(vm.typeLabelKey)}</Tag>
                  {descriptions.length > 0 && (
                    <Text size="xs" style={{ color: 'var(--ink-3)' }}>
                      {descriptions.join(', ')}
                    </Text>
                  )}
                </Box>

                {/* Material · rang + narx */}
                <Box style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
                  <Text size="sm" style={{ color: 'var(--ink-2)' }}>
                    {materials || '—'}
                  </Text>
                  {vm.costText && (
                    <Box style={{ fontSize: 12 }}>
                      <Mono>
                        {vm.costText} {vm.currency}
                      </Mono>
                    </Box>
                  )}
                </Box>

                {/* Muddat */}
                <Box style={{ display: 'flex', flexDirection: 'column', fontSize: 11.5, gap: 2 }}>
                  {vm.expectedDateText ? <Mono>{vm.expectedDateText}</Mono> : <span>—</span>}
                  {vm.sentDateText && (
                    <Text size="xs" style={{ color: 'var(--ink-3)' }}>
                      {t('lab_order.sent_date')}: {vm.sentDateText}
                    </Text>
                  )}
                  {vm.deliveredDateText && (
                    <Text size="xs" style={{ color: 'var(--ink-3)' }}>
                      {t('lab_order.delivered_date')}: {vm.deliveredDateText}
                    </Text>
                  )}
                </Box>

                {/* Holat — status icon o'ngda + boshqaruv Select */}
                <Box
                  style={{
                    alignItems: 'flex-end',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 6,
                  }}
                >
                  <StatusPill status={vm.statusTone}>{t(vm.statusLabelKey)}</StatusPill>
                  {canManage && (
                    <Select
                      size="xs"
                      w={150}
                      value={vm.status}
                      onChange={(v) =>
                        v && updateStatusMut.mutate({ id: vm.id, status: v as LabOrderStatus })
                      }
                      // B2 (CLI-439): joriy status + faqat ruxsat etilgan keyingi
                      // statuslar (forward-only + cancelled) — 6ta shartsiz emas.
                      data={allowedLabOrderStatuses(vm.status).map((s) => ({
                        value: s,
                        label: t(`lab_order.status_${s}`),
                      }))}
                    />
                  )}
                </Box>
              </Box>
            );
          })}
        </Box>
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
                      aria-label={t('common.delete')}
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
