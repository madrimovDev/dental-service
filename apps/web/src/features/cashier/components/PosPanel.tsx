import type { CashierTransaction, PaymentMethod, Service } from '@dental/api-client';
import {
  Box,
  Card,
  Group,
  Loader,
  NumberInput,
  Stack,
  Text,
  Textarea,
  TextInput,
  UnstyledButton,
} from '@mantine/core';
import {
  IconBuildingBank,
  IconCash,
  IconCreditCard,
  IconPlus,
  IconSearch,
} from '@tabler/icons-react';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BalanceBadge } from '@/components/BalanceBadge';
import { usePatientBalance } from '@/features/patients/patients.api';
import { formatCurrency } from '@/lib/format';
import { fetchServicePrices, useCreateTransaction, useServices } from '../cashier.api';
import {
  buildCreatePayload,
  computeNetTotal,
  findActivePrice,
  toTransactionVM,
} from '../cashier.mappers';
import type { CartItem, TransactionVM } from '../cashier.types';
import { CartTable } from './CartTable';
import { ReceiptModal } from './ReceiptModal';

export interface PosPanelProps {
  branchId: string;
  patientId: string | null;
  /** Savat bo'sh emasligini ota-komponentga bildiradi (rejim almashganda ogohlantirish uchun). */
  onDirtyChange?: (dirty: boolean) => void;
}

/** Quick-add xizmat pill (hover → primary token chrome; addService() semantikasi saqlanadi). */
function ServicePill({
  service,
  onAdd,
}: {
  service: Service;
  onAdd: (s: Service) => void | Promise<void>;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <UnstyledButton
      onClick={() => void onAdd(service)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        height: 31,
        padding: '0 12px',
        borderRadius: 99,
        border: `1px solid ${hovered ? 'var(--primary)' : 'var(--border)'}`,
        background: hovered ? 'var(--primary-soft)' : 'var(--surface)',
        color: hovered ? 'var(--primary)' : 'var(--ink-2)',
        fontSize: 13,
        fontWeight: 600,
        fontFamily: 'var(--font-sans)',
      }}
    >
      <IconPlus size={14} style={{ color: 'var(--primary)' }} />
      {service.nameUz}
    </UnstyledButton>
  );
}

/** Discount foiz pillari (so'm emas — call-site so'mga aylantiradi, mapper o'zgarmaydi). */
const DISCOUNT_PCTS = [0, 5, 10, 15] as const;
type DiscountPct = (typeof DISCOUNT_PCTS)[number];

/** To'lov usuli toggle tugmalari (3 ta; `other` enum saqlanadi lekin toggle'da yo'q). */
const PAYMENT_OPTIONS: ReadonlyArray<{
  value: Extract<PaymentMethod, 'cash' | 'card' | 'transfer'>;
  i18nKey: string;
  Icon: typeof IconCash;
}> = [
  { value: 'cash', i18nKey: 'cashier.method.cash', Icon: IconCash },
  { value: 'card', i18nKey: 'cashier.method.card', Icon: IconCreditCard },
  { value: 'transfer', i18nKey: 'cashier.method.transfer', Icon: IconBuildingBank },
];

/**
 * Charge muvaffaqiyatidan keyin chek modaliga uzatiladigan snapshot.
 * ReceiptModal (Task D) kontrakti = `transaction: TransactionVM`
 * (server javobidan `toTransactionVM`) + ixtiyoriy `cart` POS satrlari.
 */
type ReceiptSnapshot = {
  transaction: TransactionVM;
  cart: CartItem[];
};

export function PosPanel({ branchId, patientId, onDirtyChange }: PosPanelProps) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const servicesQuery = useServices();
  const createMut = useCreateTransaction();
  const balanceQuery = usePatientBalance(patientId ?? '');

  const [cart, setCart] = useState<CartItem[]>([]);
  const [search, setSearch] = useState('');
  const [discountPct, setDiscountPct] = useState<DiscountPct>(0);
  const [paidAmount, setPaidAmount] = useState<number | ''>('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash');
  const [notes, setNotes] = useState('');
  const [receipt, setReceipt] = useState<ReceiptSnapshot | null>(null);

  // Foiz → so'm chegirma. gross = savat jami (chegirmasiz) = computeNetTotal(cart, 0).
  const gross = computeNetTotal(cart, 0);
  const discAmt = Math.round((gross * discountPct) / 100);
  const netTotal = computeNetTotal(cart, discAmt);

  // Savat holatini ota-komponentga bildirish (rejim almashganda yo'qotishni ogohlantirish uchun).
  useEffect(() => {
    onDirtyChange?.(cart.length > 0);
  }, [cart.length, onDirtyChange]);

  const activeServices = useMemo(
    () => servicesQuery.data?.filter((s) => s.isActive) ?? [],
    [servicesQuery.data],
  );

  const filteredServices = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return activeServices;
    return activeServices.filter(
      (s) => s.nameUz.toLowerCase().includes(q) || s.code.toLowerCase().includes(q),
    );
  }, [activeServices, search]);

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
      discount: discAmt,
      paidAmount: typeof paidAmount === 'number' ? paidAmount : null,
      paymentMethod,
      notes,
    });
    // Savat snapshot'i (charge'dan oldin — onSuccess reset'idan keyin ham mavjud bo'lsin).
    const cartSnapshot = [...cart];
    createMut.mutate(payload, {
      onSuccess: (data: CashierTransaction) => {
        // Server tranzaksiyasi → VM (chek manbasi). data yo'q bo'lsa modal ochilmaydi.
        if (data) {
          setReceipt({ transaction: toTransactionVM(data), cart: cartSnapshot });
        }
        setCart([]);
        setSearch('');
        setDiscountPct(0);
        setPaidAmount('');
        setNotes('');
      },
    });
  };

  const itemCount = cart.reduce((sum, i) => sum + i.quantity, 0);

  return (
    <>
      <Card
        padding={0}
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 16,
          boxShadow: 'var(--shadow-sm)',
          overflow: 'hidden',
          fontFamily: 'var(--font-sans)',
        }}
      >
        {/* Header: "Joriy chek" + bemor balans */}
        <Group
          justify="space-between"
          wrap="nowrap"
          style={{
            padding: '16px 18px',
            borderBottom: '1px solid var(--border)',
          }}
        >
          <Text fw={700} style={{ fontSize: 15, color: 'var(--ink)' }}>
            {t('cashier.new_payment')}
          </Text>
          {patientId && balanceQuery.data && (
            <Group gap={8} wrap="nowrap">
              <Text size="xs" style={{ color: 'var(--ink-3)' }}>
                {t('cashier.previous_balance')}
              </Text>
              <BalanceBadge balance={balanceQuery.data.balance} />
            </Group>
          )}
        </Group>

        {/* Qidiruv + quick-add xizmat pillari */}
        <Box style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)' }}>
          <TextInput
            value={search}
            onChange={(e) => setSearch(e.currentTarget.value)}
            placeholder={t('cashier.search_service')}
            leftSection={<IconSearch size={16} style={{ color: 'var(--ink-3)' }} />}
            styles={{ input: { height: 40 } }}
          />
          {filteredServices.length > 0 && (
            <Group gap={8} mt={12}>
              {filteredServices.map((s) => (
                <ServicePill key={s.id} service={s} onAdd={addService} />
              ))}
            </Group>
          )}
        </Box>

        {/* Savat */}
        {cart.length > 0 && (
          <Box style={{ padding: '8px 18px' }}>
            <CartTable cart={cart} onUpdate={updateCartItem} onRemove={removeCartItem} />
          </Box>
        )}

        {/* Subtotal footer */}
        <Group
          justify="space-between"
          style={{ padding: '14px 18px', borderTop: '1px solid var(--border)' }}
        >
          <Text size="xs" style={{ color: 'var(--ink-3)' }}>
            {`${t('cashier.total')} · ${itemCount}`}
          </Text>
          <Text fw={600} style={{ fontFamily: 'var(--font-mono)', color: 'var(--ink)' }}>
            {formatCurrency(gross, t)}
          </Text>
        </Group>

        {/* Chegirma percent pillari */}
        <Group
          justify="space-between"
          align="center"
          style={{ padding: '12px 18px', borderTop: '1px solid var(--border)' }}
        >
          <Text size="sm" style={{ color: 'var(--ink-2)' }}>
            {t('cashier.discount')}
          </Text>
          <Group gap={6}>
            {DISCOUNT_PCTS.map((pct) => {
              const active = pct === discountPct;
              return (
                <UnstyledButton
                  key={pct}
                  onClick={() => setDiscountPct(pct)}
                  style={{
                    minWidth: 40,
                    height: 30,
                    padding: '0 10px',
                    borderRadius: 8,
                    textAlign: 'center',
                    fontSize: 13,
                    fontWeight: 600,
                    fontFamily: 'var(--font-mono)',
                    border: active ? '1px solid var(--primary)' : '1px solid var(--border)',
                    background: active ? 'var(--primary)' : 'var(--surface)',
                    color: active ? 'var(--on-primary)' : 'var(--ink-2)',
                  }}
                >
                  {`${pct}%`}
                </UnstyledButton>
              );
            })}
          </Group>
        </Group>

        {/* Jami to'lov */}
        <Group
          justify="space-between"
          align="center"
          style={{ padding: '14px 18px', borderTop: '1px solid var(--border)' }}
        >
          <Text fw={700} style={{ color: 'var(--ink)' }}>
            {t('cashier.total')}
          </Text>
          <Text
            fw={700}
            style={{ fontFamily: 'var(--font-mono)', fontSize: 22, color: 'var(--primary)' }}
          >
            {formatCurrency(netTotal, t)}
          </Text>
        </Group>

        {/* To'lov usuli toggle */}
        <Box style={{ padding: '4px 18px 14px' }}>
          <Text
            style={{
              fontSize: 11,
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: 0.4,
              color: 'var(--ink-3)',
              marginBottom: 8,
            }}
          >
            {t('cashier.payment_method')}
          </Text>
          <Box style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
            {PAYMENT_OPTIONS.map(({ value, i18nKey, Icon }) => {
              const active = paymentMethod === value;
              return (
                <UnstyledButton
                  key={value}
                  onClick={() => setPaymentMethod(value)}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 4,
                    height: 54,
                    borderRadius: 10,
                    border: active ? '1.5px solid var(--primary)' : '1.5px solid var(--border)',
                    background: active ? 'var(--primary-soft)' : 'var(--surface)',
                    color: active ? 'var(--primary)' : 'var(--ink-2)',
                    fontSize: 12.5,
                    fontWeight: 600,
                    fontFamily: 'var(--font-sans)',
                  }}
                >
                  <Icon size={18} />
                  {t(i18nKey)}
                </UnstyledButton>
              );
            })}
          </Box>
        </Box>

        {/* To'langan summa + eslatma */}
        <Box style={{ padding: '0 18px 14px' }}>
          <Stack gap="sm">
            <NumberInput
              label={t('cashier.paid_amount')}
              value={paidAmount}
              onChange={(v) => setPaidAmount(typeof v === 'number' ? v : '')}
              min={0}
              step={1000}
              thousandSeparator=" "
              suffix={` ${t('common.currency')}`}
            />
            <Textarea
              label={t('cashier.notes')}
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.currentTarget.value)}
            />
          </Stack>
        </Box>

        {/* Accept */}
        <Box style={{ padding: '0 18px 18px' }}>
          <UnstyledButton
            onClick={handleCharge}
            disabled={cart.length === 0 || netTotal <= 0 || createMut.isPending}
            data-loading={createMut.isPending || undefined}
            style={{
              width: '100%',
              height: 46,
              borderRadius: 12,
              background: 'var(--primary)',
              color: 'var(--on-primary)',
              fontSize: 14.5,
              fontWeight: 700,
              fontFamily: 'var(--font-sans)',
              opacity: cart.length === 0 || netTotal <= 0 || createMut.isPending ? 0.55 : 1,
              cursor:
                cart.length === 0 || netTotal <= 0 || createMut.isPending
                  ? 'not-allowed'
                  : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
            }}
          >
            {createMut.isPending ? (
              <Loader size={18} color="var(--on-primary)" />
            ) : (
              <IconCash size={18} />
            )}
            {t('cashier.charge')}
          </UnstyledButton>
          {/* NoOp fiskal eslatma (Soliq scaffold — Phase 2). i18n stub → Task F. */}
          <Text style={{ fontSize: 11, color: 'var(--ink-3)', textAlign: 'center', marginTop: 8 }}>
            {t('cashier.noop_fiscal', 'Fiskal hujjat keyinroq Soliqqa yuboriladi')}
          </Text>
        </Box>
      </Card>

      {receipt && (
        <ReceiptModal
          opened
          onClose={() => setReceipt(null)}
          transaction={receipt.transaction}
          cart={receipt.cart}
        />
      )}
    </>
  );
}
