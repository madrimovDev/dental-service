import { Button, Group, Modal, NumberInput, Select, Stack, TextInput } from '@mantine/core';
import { useForm } from '@mantine/form';
import { zod4Resolver } from 'mantine-form-zod-resolver';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useCreateMovement } from '../stock.api';
import { type MovementFormSchema, movementFormSchema } from '../stock.schema';
import type { StockItemVM } from '../stock.types';

export interface MovementFormModalProps {
  opened: boolean;
  onClose: () => void;
  item: StockItemVM | null;
}

/**
 * Manual harakat formasi (in / out / adjustment).
 * "Asistent chiqim" = type=out — alohida komponent emas, shu formaning bir holati.
 */
export function MovementFormModal({ opened, onClose, item }: MovementFormModalProps) {
  const { t } = useTranslation();
  const create = useCreateMovement();

  const form = useForm<MovementFormSchema>({
    initialValues: { itemId: '', type: 'in', quantity: 1, reason: '' },
    validate: zod4Resolver(movementFormSchema),
  });

  // biome-ignore lint/correctness/useExhaustiveDependencies: faqat opened/item.id ga reaksiya
  useEffect(() => {
    if (opened && item) {
      form.setValues({ itemId: item.id, type: 'in', quantity: 1, reason: '' });
    }
  }, [opened, item?.id]);

  const handleClose = () => {
    form.reset();
    onClose();
  };

  const typeOptions = (['in', 'out', 'adjustment'] as const).map((v) => ({
    value: v,
    label: t(`stock.type_label.${v}`),
  }));

  return (
    <Modal
      opened={opened}
      onClose={handleClose}
      title={item ? `${t('stock.movement')}: ${item.name}` : t('stock.movement')}
      size="md"
    >
      <form
        onSubmit={form.onSubmit((values) =>
          create.mutate(
            {
              itemId: values.itemId,
              type: values.type,
              quantity: values.quantity,
              reason: values.reason || undefined,
            },
            { onSuccess: handleClose },
          ),
        )}
      >
        <Stack gap="md">
          <Select
            label={t('stock.type')}
            data={typeOptions}
            allowDeselect={false}
            {...form.getInputProps('type')}
          />
          <NumberInput
            label={t('stock.quantity')}
            min={0}
            withAsterisk
            {...form.getInputProps('quantity')}
          />
          <TextInput label={t('stock.reason')} {...form.getInputProps('reason')} />
          <Group justify="flex-end">
            <Button variant="default" onClick={handleClose}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" loading={create.isPending} disabled={!item}>
              {t('common.save')}
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}
