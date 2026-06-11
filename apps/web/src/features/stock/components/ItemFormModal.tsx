import type { Branch } from '@dental/api-client';
import { Button, Group, Modal, NumberInput, Select, Stack, TextInput } from '@mantine/core';
import { useForm } from '@mantine/form';
import { zod4Resolver } from 'mantine-form-zod-resolver';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useCreateItem } from '../stock.api';
import { type ItemFormSchema, itemFormSchema } from '../stock.schema';

const EMPTY: ItemFormSchema = {
  name: '',
  unit: '',
  branchId: undefined,
  quantity: 0,
  minThreshold: 0,
};

export interface ItemFormModalProps {
  opened: boolean;
  onClose: () => void;
  branches: Branch[];
}

export function ItemFormModal({ opened, onClose, branches }: ItemFormModalProps) {
  const { t } = useTranslation();
  const create = useCreateItem();

  const form = useForm<ItemFormSchema>({
    initialValues: EMPTY,
    validate: zod4Resolver(itemFormSchema),
  });

  // biome-ignore lint/correctness/useExhaustiveDependencies: faqat opened ga reset
  useEffect(() => {
    if (opened) form.setValues(EMPTY);
  }, [opened]);

  const handleClose = () => {
    form.reset();
    onClose();
  };

  const branchOptions = branches.map((b) => ({ value: b.id, label: b.name }));

  return (
    <Modal opened={opened} onClose={handleClose} title={t('stock.create_item')} size="md">
      <form
        onSubmit={form.onSubmit((values) =>
          create.mutate(
            {
              name: values.name,
              unit: values.unit,
              branchId: values.branchId || undefined,
              quantity: values.quantity,
              minThreshold: values.minThreshold,
            },
            { onSuccess: handleClose },
          ),
        )}
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
            {...form.getInputProps('branchId')}
          />
          <NumberInput label={t('stock.quantity')} min={0} {...form.getInputProps('quantity')} />
          <NumberInput
            label={t('stock.min_threshold')}
            min={0}
            {...form.getInputProps('minThreshold')}
          />
          <Group justify="flex-end">
            <Button variant="default" onClick={handleClose}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" loading={create.isPending}>
              {t('common.save')}
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}
