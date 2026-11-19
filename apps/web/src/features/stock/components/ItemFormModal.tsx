import type { Branch } from '@dental/api-client';
import { Button, Group, Modal, NumberInput, Select, Stack, TextInput } from '@mantine/core';
import { useForm } from '@mantine/form';
import { zod4Resolver } from 'mantine-form-zod-resolver';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useCreateItem, useUpdateItem } from '../stock.api';
import { type ItemFormSchema, itemFormSchema } from '../stock.schema';
import type { StockItemVM } from '../stock.types';

const EMPTY: ItemFormSchema = {
  name: '',
  unit: '',
  branchId: undefined,
  category: '',
  price: '',
  quantity: 0,
  minThreshold: 0,
};

export interface ItemFormModalProps {
  opened: boolean;
  onClose: () => void;
  branches: Branch[];
  /** Berilsa — tahrirlash rejimi (metadata; qoldiq o'zgarmaydi). */
  item?: StockItemVM | null;
}

export function ItemFormModal({ opened, onClose, branches, item }: ItemFormModalProps) {
  const { t } = useTranslation();
  const create = useCreateItem();
  const update = useUpdateItem();
  const isEdit = !!item;

  const form = useForm<ItemFormSchema>({
    initialValues: EMPTY,
    validate: zod4Resolver(itemFormSchema),
  });

  // biome-ignore lint/correctness/useExhaustiveDependencies: faqat opened/item.id ga reset
  useEffect(() => {
    if (!opened) return;
    form.setValues(
      item
        ? {
            name: item.name,
            unit: item.unit,
            branchId: item.branchId ?? undefined,
            category: item.category ?? '',
            price: item.price ?? '',
            quantity: item.quantity,
            minThreshold: item.minThreshold,
          }
        : EMPTY,
    );
  }, [opened, item?.id]);

  const handleClose = () => {
    form.reset();
    onClose();
  };

  const branchOptions = branches.map((b) => ({ value: b.id, label: b.name }));

  return (
    <Modal
      opened={opened}
      onClose={handleClose}
      title={isEdit ? t('stock.edit_item') : t('stock.create_item')}
      size="md"
    >
      <form
        onSubmit={form.onSubmit((values) => {
          // FX-129 review: bo'sh narx → `undefined` (maydon yuborilmaydi). API `price`ni
          // `z.coerce.number().optional()` deb oladi — `null` 0 ga aylanib, narxsiz mahsulotni
          // tahrirlash narxni jimgina 0 ga yozardi. Narxni tozalash qo'llab-quvvatlanmaydi.
          const price =
            values.price === '' || values.price == null ? undefined : Number(values.price);
          if (item) {
            // Tahrir: faqat metadata (qoldiq harakat/partiya orqali o'zgaradi — CLI-424).
            update.mutate(
              {
                id: item.id,
                body: {
                  name: values.name,
                  unit: values.unit,
                  category: values.category ?? '',
                  ...(price !== undefined ? { price } : {}),
                  minThreshold: values.minThreshold,
                },
              },
              { onSuccess: handleClose },
            );
            return;
          }
          create.mutate(
            {
              name: values.name,
              unit: values.unit,
              branchId: values.branchId || undefined,
              category: values.category || undefined,
              price,
              quantity: values.quantity,
              minThreshold: values.minThreshold,
            },
            { onSuccess: handleClose },
          );
        })}
      >
        <Stack gap="md">
          <TextInput label={t('stock.item_name')} withAsterisk {...form.getInputProps('name')} />
          <TextInput
            label={t('stock.unit')}
            placeholder={t('stock.unit_placeholder')}
            withAsterisk
            {...form.getInputProps('unit')}
          />
          <Select
            label={t('stock.branch')}
            data={branchOptions}
            clearable
            disabled={isEdit}
            {...form.getInputProps('branchId')}
          />
          <TextInput label={t('stock.category')} {...form.getInputProps('category')} />
          <NumberInput label={t('stock.price')} min={0} {...form.getInputProps('price')} />
          {!isEdit && (
            <NumberInput label={t('stock.quantity')} min={0} {...form.getInputProps('quantity')} />
          )}
          <NumberInput
            label={t('stock.min_threshold')}
            min={0}
            {...form.getInputProps('minThreshold')}
          />
          <Group justify="flex-end">
            <Button variant="default" onClick={handleClose}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" loading={create.isPending || update.isPending}>
              {t('common.save')}
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}
