import { ActionIcon, Group, NumberInput, Stack, Text } from '@mantine/core';
import { IconTrash } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import type { CartItem } from '../cashier.types';

export interface CartTableProps {
  cart: CartItem[];
  onUpdate: (serviceId: string, patch: Partial<CartItem>) => void;
  onRemove: (serviceId: string) => void;
}

export function CartTable({ cart, onUpdate, onRemove }: CartTableProps) {
  const { t } = useTranslation();
  if (cart.length === 0) return null;

  return (
    <Stack gap="xs">
      {cart.map((i) => (
        <Group key={i.service.id} justify="space-between" wrap="nowrap" gap="xs">
          <Text size="sm" fw={500} style={{ flex: 1 }}>
            {i.service.nameUz}
          </Text>
          <NumberInput
            aria-label={t('cashier.quantity')}
            value={i.quantity}
            onChange={(v) => onUpdate(i.service.id, { quantity: typeof v === 'number' ? v : 1 })}
            min={1}
            w={70}
            size="xs"
          />
          <NumberInput
            aria-label={t('cashier.price')}
            value={i.unitPrice}
            onChange={(v) => onUpdate(i.service.id, { unitPrice: typeof v === 'number' ? v : 0 })}
            min={0}
            step={1000}
            w={130}
            size="xs"
            thousandSeparator=" "
            suffix={` ${t('common.currency')}`}
          />
          <ActionIcon
            color="red"
            variant="subtle"
            aria-label={t('cashier.remove')}
            onClick={() => onRemove(i.service.id)}
          >
            <IconTrash size={14} />
          </ActionIcon>
        </Group>
      ))}
    </Stack>
  );
}
