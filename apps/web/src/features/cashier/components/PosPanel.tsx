import type { PaymentMethod, Service } from '@dental/api-client';
import {
  Button,
  Card,
  Divider,
  Group,
  NumberInput,
  Select,
  Stack,
  Text,
  Textarea,
  Title,
} from '@mantine/core';
import { IconCash } from '@tabler/icons-react';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BalanceBadge } from '@/components/BalanceBadge';
import { usePatientBalance } from '@/features/patients/patients.api';
import { formatCurrency } from '@/lib/format';
import { fetchServicePrices, useCreateTransaction, useServices } from '../cashier.api';
import { buildCreatePayload, computeNetTotal, findActivePrice } from '../cashier.mappers';
import type { CartItem } from '../cashier.types';
import { CartTable } from './CartTable';

export interface PosPanelProps {
  branchId: string;
  patientId: string | null;
  /** Savat bo'sh emasligini ota-komponentga bildiradi (rejim almashganda ogohlantirish uchun). */
  onDirtyChange?: (dirty: boolean) => void;
}

export function PosPanel({ branchId, patientId, onDirtyChange }: PosPanelProps) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const servicesQuery = useServices();
  const createMut = useCreateTransaction();
  const balanceQuery = usePatientBalance(patientId ?? '');

  const [cart, setCart] = useState<CartItem[]>([]);
  const [discount, setDiscount] = useState<number | ''>(0);
  const [paidAmount, setPaidAmount] = useState<number | ''>('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash');
  const [notes, setNotes] = useState('');

  const discountNum = typeof discount === 'number' ? discount : 0;
  const netTotal = computeNetTotal(cart, discountNum);

  // Savat holatini ota-komponentga bildirish (rejim almashganda yo'qotishni ogohlantirish uchun).
  useEffect(() => {
    onDirtyChange?.(cart.length > 0);
  }, [cart.length, onDirtyChange]);

  const addService = async (service: Service) => {
    setCart((prev) => {
      const existing = prev.find((i) => i.service.id === service.id);
      if (existing) {
        return prev.map((i) =>
          i.service.id === service.id ? { ...i, quantity: i.quantity + 1 } : i,
        );
      }
      return [...prev, { service, quantity: 1, unitPrice: 0 }];
    });
    // Narx avto-to'ldirish: filial narxini olib unitPrice'ni to'ldirish.
    try {
      const detail = await fetchServicePrices(qc, service.id);
      const price = findActivePrice(detail.prices, branchId);
      if (price !== null) {
        setCart((prev) =>
          prev.map((i) =>
            i.service.id === service.id && i.unitPrice === 0 ? { ...i, unitPrice: price } : i,
          ),
        );
      }
    } catch {
      // Narx topilmasa qo'lda kiritiladi.
    }
  };

  const updateCartItem = (id: string, patch: Partial<CartItem>) => {
    setCart((prev) => prev.map((i) => (i.service.id === id ? { ...i, ...patch } : i)));
  };

  const removeCartItem = (id: string) => {
    setCart((prev) => prev.filter((i) => i.service.id !== id));
  };

  const handleCharge = () => {
    const payload = buildCreatePayload({
      branchId,
      patientId,
      cart,
      discount: discountNum,
      paidAmount: typeof paidAmount === 'number' ? paidAmount : null,
      paymentMethod,
      notes,
    });
    createMut.mutate(payload, {
      onSuccess: () => {
        setCart([]);
        setDiscount(0);
        setPaidAmount('');
        setNotes('');
      },
    });
  };

  return (
    <Card withBorder padding="lg" radius="md">
      <Stack gap="md">
        <Title order={4}>{t('cashier.new_payment')}</Title>

        {patientId && balanceQuery.data && (
          <Group justify="space-between">
            <Text size="sm" c="dimmed">
              {t('cashier.previous_balance')}
            </Text>
            <BalanceBadge balance={balanceQuery.data.balance} />
          </Group>
        )}

        <Select
          label={t('cashier.add_service')}
          placeholder={t('cashier.search_service')}
          data={
            servicesQuery.data
              ?.filter((s) => s.isActive)
              .map((s) => ({ value: s.id, label: `${s.code} — ${s.nameUz}` })) ?? []
          }
          searchable
          clearable
          value={null}
          onChange={(id) => {
            const svc = servicesQuery.data?.find((s) => s.id === id);
            if (svc) void addService(svc);
          }}
        />

        {cart.length > 0 && (
          <Card withBorder padding="sm">
            <CartTable cart={cart} onUpdate={updateCartItem} onRemove={removeCartItem} />
          </Card>
        )}

        <NumberInput
          label={t('cashier.discount')}
          value={discount}
          onChange={(v) => setDiscount(typeof v === 'number' ? v : 0)}
          min={0}
          step={1000}
          thousandSeparator=" "
          suffix={` ${t('common.currency')}`}
        />

        <Group grow>
          <Select
            label={t('cashier.payment_method')}
            data={[
              { value: 'cash', label: t('cashier.method.cash') },
              { value: 'card', label: t('cashier.method.card') },
              { value: 'transfer', label: t('cashier.method.transfer') },
              { value: 'other', label: t('cashier.method.other') },
            ]}
            value={paymentMethod}
            onChange={(v) => setPaymentMethod((v ?? 'cash') as PaymentMethod)}
          />
          <NumberInput
            label={t('cashier.paid_amount')}
            value={paidAmount}
            onChange={(v) => setPaidAmount(typeof v === 'number' ? v : '')}
            min={0}
            step={1000}
            thousandSeparator=" "
            suffix={` ${t('common.currency')}`}
          />
        </Group>

        <Textarea
          label={t('cashier.notes')}
          rows={2}
          value={notes}
          onChange={(e) => setNotes(e.currentTarget.value)}
        />

        <Divider />
        <Group justify="space-between">
          <Text fw={700} size="lg">
            {t('cashier.total')}: {formatCurrency(netTotal, t)}
          </Text>
          <Button
            leftSection={<IconCash size={18} />}
            size="md"
            color="teal"
            disabled={cart.length === 0 || netTotal <= 0}
            loading={createMut.isPending}
            onClick={handleCharge}
          >
            {t('cashier.charge')}
          </Button>
        </Group>
      </Stack>
    </Card>
  );
}
