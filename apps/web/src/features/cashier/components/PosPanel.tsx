import type { CashierTransaction, PaymentMethod, Service } from '@dental/api-client';
import { StatusPill } from '@dental/ui';
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
  computeTender,
  findActivePrice,
  toTransactionVM,
} from '../cashier.mappers';
import {
  CARD_PROVIDERS,
  type CardProvider,
  type CartItem,
  type TransactionVM,
} from '../cashier.types';
import { CartTable } from './CartTable';
import { ReceiptModal } from './ReceiptModal';

export interface PosPanelProps {
  branchId: string;
  patientId: string | null;
  /** Tanlangan bemor ismi (chekda ko'rsatiladi). */
  patientName?: string;
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
  hintKey: string;
  Icon: typeof IconCash;
}> = [
  {
    value: 'cash',
    i18nKey: 'cashier.method.cash',
    hintKey: 'cashierPos.method_hint.cash',
    Icon: IconCash,
  },
  {
    value: 'card',
    i18nKey: 'cashier.method.card',
    hintKey: 'cashierPos.method_hint.card',
    Icon: IconCreditCard,
  },
  {
    value: 'transfer',
    i18nKey: 'cashier.method.transfer',
    hintKey: 'cashierPos.method_hint.transfer',
    Icon: IconBuildingBank,
  },
];

/**
 * Charge muvaffaqiyatidan keyin chek modaliga uzatiladigan snapshot.
 * ReceiptModal (Task D) kontrakti = `transaction: TransactionVM`
 * (server javobidan `toTransactionVM`) + ixtiyoriy `cart` POS satrlari.
 */
type ReceiptSnapshot = {
  transaction: TransactionVM;
  cart: CartItem[];
  patientName?: string;
};

export function PosPanel({ branchId, patientId, patientName, onDirtyChange }: PosPanelProps) {
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
  const [cardProvider, setCardProvider] = useState<CardProvider>('terminal');
  const [notes, setNotes] = useState('');
  const [receipt, setReceipt] = useState<ReceiptSnapshot | null>(null);

  // Foiz → so'm chegirma. gross = savat jami (chegirmasiz) = computeNetTotal(cart, 0).
  const gross = computeNetTotal(cart, 0);
  const discAmt = Math.round((gross * discountPct) / 100);
  const netTotal = computeNetTotal(cart, discAmt);
  // Naqdda qaytim, qarz qoldig'i (sof hisob — mappers.computeTender).
  const tender = computeTender(
    paymentMethod,
    netTotal,
    typeof paidAmount === 'number' ? paidAmount : null,
  );

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
      // Bemor ortiqcha bergan bo'lsa ham serverga net yoziladi (qaytim kassada qoladi).
      paidAmount: tender.paid,
      paymentMethod,
      cardProvider: paymentMethod === 'card' ? cardProvider : null,
      notes,
    });
    // Savat snapshot'i (charge'dan oldin — onSuccess reset'idan keyin ham mavjud bo'lsin).
    const cartSnapshot = [...cart];
    createMut.mutate(payload, {
      onSuccess: (data: CashierTransaction) => {
        // Server tranzaksiyasi → VM (chek manbasi). data yo'q bo'lsa modal ochilmaydi.
        if (data) {
          setReceipt({
            transaction: toTransactionVM(data),
            cart: cartSnapshot,
            patientName: patientId ? patientName : undefined,
          });
        }
        setCart([]);
        setSearch('');
        setDiscountPct(0);
        setPaidAmount('');
        setCardProvider('terminal');
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
          borderRadius: 'var(--radius-card)',
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
            {PAYMENT_OPTIONS.map(({ value, i18nKey, hintKey, Icon }) => {
              const active = paymentMethod === value;
              return (
                <UnstyledButton
                  key={value}
                  onClick={() => setPaymentMethod(value)}
                  aria-pressed={active}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'flex-start',
                    justifyContent: 'center',
                    gap: 2,
                    minHeight: 56,
                    padding: '8px 12px',
                    borderRadius: 10,
                    border: active ? '1.5px solid var(--primary)' : '1.5px solid var(--border)',
                    background: active ? 'var(--primary-soft)' : 'var(--surface)',
                    color: active ? 'var(--primary)' : 'var(--ink-2)',
                    fontFamily: 'var(--font-sans)',
                  }}
                >
                  <Group gap={6} wrap="nowrap">
                    <Icon size={16} />
                    <Text inherit fw={700} style={{ fontSize: 13.5 }}>
                      {t(i18nKey)}
                    </Text>
                  </Group>
                  <Text inherit style={{ fontSize: 11.5, color: 'var(--ink-3)', fontWeight: 500 }}>
                    {t(hintKey)}
                  </Text>
                </UnstyledButton>
              );
            })}
          </Box>

          {/* Karta sub-turi (faqat karta tanlanganda) — tashqi integratsiya yo'q, faqat yorliq. */}
          {paymentMethod === 'card' && (
            <Group gap={8} mt={10} role="radiogroup" aria-label={t('cashierPos.card_provider')}>
              {CARD_PROVIDERS.map((p) => {
                const active = cardProvider === p;
                return (
                  <UnstyledButton
                    key={p}
                    role="radio"
                    aria-checked={active}
                    onClick={() => setCardProvider(p)}
                    style={{
                      height: 30,
                      padding: '0 12px',
                      borderRadius: 99,
                      fontSize: 12.5,
                      fontWeight: 600,
                      fontFamily: 'var(--font-sans)',
                      border: active ? '1px solid var(--primary)' : '1px solid var(--border)',
                      background: active ? 'var(--primary)' : 'var(--surface)',
                      color: active ? 'var(--on-primary)' : 'var(--ink-2)',
                    }}
                  >
                    {t(`cashierPos.provider.${p}`)}
                  </UnstyledButton>
                );
              })}
            </Group>
          )}
        </Box>

        {/* Bemor berdi · Qaytim · Qarz qoladi + eslatma */}
        <Box style={{ padding: '0 18px 14px' }}>
          <Stack gap="sm">
            <Box
              style={{
                display: 'grid',
                gridTemplateColumns: paymentMethod === 'cash' ? '1.2fr 1fr 1fr' : '1.2fr 1fr',
                gap: 12,
                alignItems: 'end',
              }}
            >
              <NumberInput
                label={
                  paymentMethod === 'cash' ? t('cashierPos.received') : t('cashier.paid_amount')
                }
                value={paidAmount}
                onChange={(v) => setPaidAmount(typeof v === 'number' ? v : '')}
                placeholder={formatCurrency(netTotal, t)}
                min={0}
                step={1000}
                thousandSeparator=" "
                suffix={` ${t('common.currency')}`}
                styles={{ input: { fontFamily: 'var(--font-mono)', fontWeight: 600 } }}
              />
              {paymentMethod === 'cash' && (
                <Box data-testid="tender-change">
                  <Text style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink-2)' }}>
                    {t('cashierPos.change')}
                  </Text>
                  <Text
                    fw={700}
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: 16,
                      color: 'var(--primary)',
                      marginTop: 6,
                    }}
                  >
                    {formatCurrency(tender.change, t)}
                  </Text>
                </Box>
              )}
              <Box data-testid="tender-debt">
                <Text style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink-2)' }}>
                  {t('cashierPos.debt_left')}
                </Text>
                <Text
                  fw={700}
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 16,
                    marginTop: 6,
                    color: tender.debt > 0 ? 'var(--danger)' : 'var(--ink-2)',
                  }}
                >
                  {formatCurrency(tender.debt, t)}
                </Text>
              </Box>
            </Box>
            <Textarea
              label={t('cashier.notes')}
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.currentTarget.value)}
            />
          </Stack>
        </Box>

        {/* Fiskal chek holati (NoOp provider → «Yuborilmagan»; Soliq real bo'lganda yangilanadi). */}
        <Group
          gap={10}
          wrap="nowrap"
          data-testid="fiscal-state"
          style={{
            margin: '0 18px 14px',
            padding: '10px 12px',
            borderRadius: 10,
            background: 'var(--surface-2)',
          }}
        >
          <Text style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--ink)' }}>
            {t('cashierPos.fiscal.label')}
          </Text>
          <StatusPill status="waiting">{t('cashierPos.fiscal.not_sent')}</StatusPill>
          <Text style={{ fontSize: 11.5, color: 'var(--ink-3)' }}>
            {t('cashierPos.fiscal.hint')}
          </Text>
        </Group>

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
        </Box>
      </Card>

      {receipt && (
        <ReceiptModal
          opened
          onClose={() => setReceipt(null)}
          transaction={receipt.transaction}
          cart={receipt.cart}
          patientName={receipt.patientName}
        />
      )}
    </>
  );
}
