import { Box, NumberInput, Stack, Text } from '@mantine/core';
import { IconX } from '@tabler/icons-react';
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
    <Stack gap={2}>
      {/* Ustun-header row (dizayn §4.3). */}
      <Box
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr auto auto',
          gap: 12,
          alignItems: 'center',
          padding: '6px 4px',
          background: 'var(--surface-2)',
          borderRadius: 7,
          fontSize: 11,
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: 0.3,
          color: 'var(--ink-3)',
        }}
      >
        <Text inherit>{t('cashier.add_service')}</Text>
        <Text inherit style={{ textAlign: 'right' }}>
          {t('cashier.price')}
        </Text>
        <Box w={28} />
      </Box>

      {cart.map((i) => (
        <Box
          key={i.service.id}
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr auto auto',
            gap: 12,
            alignItems: 'center',
            padding: '6px 4px',
          }}
        >
          {/* Nom + kategoriya sub-line. */}
          <Box style={{ minWidth: 0 }}>
            <Text size="sm" fw={600} lineClamp={1} style={{ fontSize: 13.5 }}>
              {i.service.nameUz}
            </Text>
            {i.service.category ? (
              <Text style={{ fontSize: 11.5, color: 'var(--ink-3)' }} lineClamp={1}>
                {i.service.category}
              </Text>
            ) : null}
          </Box>

          {/* Tahrirlanadigan soni + narx (funksiya saqlanadi, inline/kichik). */}
          <Box
            style={{ display: 'flex', gap: 6, alignItems: 'center', justifyContent: 'flex-end' }}
          >
            <NumberInput
              aria-label={t('cashier.quantity')}
              value={i.quantity}
              onChange={(v) => onUpdate(i.service.id, { quantity: typeof v === 'number' ? v : 1 })}
              min={1}
              w={56}
              size="xs"
            />
            <NumberInput
              aria-label={t('cashier.price')}
              value={i.unitPrice}
              onChange={(v) => onUpdate(i.service.id, { unitPrice: typeof v === 'number' ? v : 0 })}
              min={0}
              step={1000}
              w={120}
              size="xs"
              thousandSeparator=" "
              suffix={` ${t('common.currency')}`}
              styles={{ input: { fontFamily: 'var(--font-mono)', textAlign: 'right' } }}
            />
          </Box>

          {/* Token × remove tugma (#fff yo'q; hover danger-soft/danger). */}
          <Box
            component="button"
            type="button"
            aria-label={t('cashier.remove')}
            onClick={() => onRemove(i.service.id)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 28,
              height: 28,
              borderRadius: 7,
              border: 'none',
              cursor: 'pointer',
              background: 'transparent',
              color: 'var(--ink-3)',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'var(--danger-soft)';
              e.currentTarget.style.color = 'var(--danger)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent';
              e.currentTarget.style.color = 'var(--ink-3)';
            }}
          >
            <IconX size={15} />
          </Box>
        </Box>
      ))}
    </Stack>
  );
}
