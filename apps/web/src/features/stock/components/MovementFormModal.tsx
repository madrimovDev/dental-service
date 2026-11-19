import { ApiError } from '@dental/api-client';
import { Button, Group, Modal, NumberInput, Select, Stack, Text, TextInput } from '@mantine/core';
import { useForm } from '@mantine/form';
import { notifications } from '@mantine/notifications';
import { zod4Resolver } from 'mantine-form-zod-resolver';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useCreateMovement } from '../stock.api';
import { formatQty } from '../stock.mappers';
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

  const isAdjustment = form.values.type === 'adjustment';

  // Inventarizatsiyaga o'tganda boshlang'ich qiymat = joriy qoldiq (delta emas, sanalgan miqdor);
  // boshqa turga qaytganda 1.
  const handleTypeChange = (value: string | null) => {
    if (value !== 'in' && value !== 'out' && value !== 'adjustment') return;
    form.setFieldValue('type', value);
    if (value === 'adjustment' && item) form.setFieldValue('quantity', item.quantity);
    else if (form.values.type === 'adjustment') form.setFieldValue('quantity', 1);
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
            {
              onSuccess: handleClose,
              // FX-162: 409 stock.insufficient — server inglizcha matni o'rniga tarjima + details.
              onError: (error) => {
                const details = (error instanceof ApiError ? error.details : null) as {
                  available?: number;
                  requested?: number;
                } | null;
                const insufficient =
                  error instanceof ApiError && error.code === 'stock.insufficient';
                notifications.show({
                  color: 'red',
                  title: t('common.error'),
                  message: insufficient
                    ? t('stock.insufficient', {
                        available: formatQty(Number(details?.available ?? 0)),
                        requested: formatQty(Number(details?.requested ?? 0)),
                        unit: item?.unit ?? '',
                      })
                    : error.message || t('common.error'),
                });
              },
            },
          ),
        )}
      >
        <Stack gap="md">
          <Select
            label={t('stock.type')}
            data={typeOptions}
            allowDeselect={false}
            {...form.getInputProps('type')}
            onChange={handleTypeChange}
          />
          {isAdjustment && item && (
            <Text size="sm" c="dimmed">
              {t('stock.current_qty', { qty: formatQty(item.quantity), unit: item.unit })}
            </Text>
          )}
          <NumberInput
            label={isAdjustment ? t('stock.counted_qty') : t('stock.quantity')}
            description={isAdjustment ? t('stock.adjustment_hint') : undefined}
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
