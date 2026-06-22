import { Button, Group, Modal, NumberInput, Select, Stack, TextInput } from '@mantine/core';
import { useForm } from '@mantine/form';
import { zod4Resolver } from 'mantine-form-zod-resolver';
import { useTranslation } from 'react-i18next';
import { useCreateBatch } from '../stock.api';
import { batchFormSchema } from '../stock.schema';
import type { StockItemVM } from '../stock.types';

export function BatchFormModal({
  opened,
  onClose,
  items,
}: {
  opened: boolean;
  onClose: () => void;
  items: StockItemVM[];
}) {
  const { t } = useTranslation();
  const createMut = useCreateBatch();
  const form = useForm({
    initialValues: {
      itemId: '',
      qtyReceived: 1,
      supplierName: '',
      batchNumber: '',
      expiryDate: '',
      costPerUnit: '' as number | '',
    },
    validate: zod4Resolver(batchFormSchema),
  });

  const close = () => {
    form.reset();
    onClose();
  };

  const submit = form.onSubmit((v) =>
    createMut.mutate(
      {
        itemId: v.itemId,
        qtyReceived: v.qtyReceived,
        supplierName: v.supplierName || undefined,
        batchNumber: v.batchNumber || undefined,
        expiryDate: v.expiryDate ? new Date(v.expiryDate).toISOString() : undefined,
        costPerUnit: typeof v.costPerUnit === 'number' ? v.costPerUnit : undefined,
      },
      { onSuccess: close },
    ),
  );

  return (
    <Modal opened={opened} onClose={close} title={t('stock.batch.receive')} size="md">
      <form onSubmit={submit}>
        <Stack gap="md">
          <Select
            label={t('stock.batch.item')}
            data={items.map((i) => ({ value: i.id, label: i.name }))}
            searchable
            value={form.values.itemId || null}
            onChange={(v) => form.setFieldValue('itemId', v ?? '')}
            error={form.errors.itemId}
          />
          <Group grow>
            <NumberInput
              label={t('stock.batch.qty')}
              min={0}
              {...form.getInputProps('qtyReceived')}
            />
            <NumberInput
              label={t('stock.batch.cost')}
              min={0}
              value={form.values.costPerUnit}
              onChange={(v) => form.setFieldValue('costPerUnit', typeof v === 'number' ? v : '')}
            />
          </Group>
          <Group grow>
            <TextInput label={t('stock.batch.supplier')} {...form.getInputProps('supplierName')} />
            <TextInput label={t('stock.batch.number')} {...form.getInputProps('batchNumber')} />
          </Group>
          <TextInput
            label={t('stock.batch.expiry')}
            type="date"
            {...form.getInputProps('expiryDate')}
          />
          <Group justify="flex-end">
            <Button variant="default" onClick={close}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" loading={createMut.isPending} disabled={!form.values.itemId}>
              {t('stock.batch.receive')}
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}
