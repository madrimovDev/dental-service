import {
  Button,
  Checkbox,
  Group,
  Modal,
  NumberInput,
  Select,
  Stack,
  TextInput,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { zod4Resolver } from 'mantine-form-zod-resolver';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { formatCurrency } from '@/lib/format.ts';
import { useAuthStore } from '@/stores/auth-store.ts';
import { useCreateBatch } from '../stock.api';
import { batchFormSchema } from '../stock.schema';
import type { StockItemVM } from '../stock.types';

export function BatchFormModal({
  opened,
  onClose,
  items,
  defaultItemId,
}: {
  opened: boolean;
  onClose: () => void;
  items: StockItemVM[];
  /** Qatordan «Kirim» bosilganda oldindan tanlangan material. */
  defaultItemId?: string | null;
}) {
  const { t } = useTranslation();
  const createMut = useCreateBatch();
  // Kirimni xarajatga yozish — alohida ruxsat (`expense.manage`); server ham tekshiradi (403).
  const canRecordExpense = useAuthStore((st) => st.hasPermission('expense.manage'));
  const form = useForm({
    initialValues: {
      itemId: '',
      qtyReceived: 1,
      supplierName: '',
      batchNumber: '',
      expiryDate: '',
      costPerUnit: '' as number | '',
      recordAsExpense: false,
    },
    validate: zod4Resolver(batchFormSchema),
  });

  // biome-ignore lint/correctness/useExhaustiveDependencies: faqat ochilganda/oldindan tanlangan item o'zgarganda
  useEffect(() => {
    if (opened && defaultItemId) form.setFieldValue('itemId', defaultItemId);
  }, [opened, defaultItemId]);

  const selectedItem = items.find((i) => i.id === form.values.itemId);
  const costNum = typeof form.values.costPerUnit === 'number' ? form.values.costPerUnit : null;
  const totalCost = costNum == null ? null : costNum * (Number(form.values.qtyReceived) || 0);

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
        recordAsExpense: canRecordExpense && v.recordAsExpense ? true : undefined,
      },
      { onSuccess: close },
    ),
  );

  return (
    <Modal
      opened={opened}
      onClose={close}
      title={
        selectedItem
          ? t('stockScreen.receiveTitle', { item: selectedItem.name })
          : t('stock.batch.receive')
      }
      size="md"
    >
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
          {canRecordExpense && (
            <Checkbox
              label={t('stockScreen.expenseCheck', {
                amount: totalCost == null ? '—' : formatCurrency(totalCost, t),
              })}
              description={costNum == null ? t('stockScreen.expenseNeedsCost') : undefined}
              disabled={costNum == null}
              checked={form.values.recordAsExpense && costNum != null}
              onChange={(e) => form.setFieldValue('recordAsExpense', e.currentTarget.checked)}
            />
          )}
          <Group justify="flex-end">
            <Button variant="default" onClick={close}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" loading={createMut.isPending} disabled={!form.values.itemId}>
              {selectedItem
                ? t('stockScreen.receiveButton', {
                    qty: form.values.qtyReceived,
                    unit: selectedItem.unit,
                  })
                : t('stock.batch.receive')}
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}
