import type { PaymentMethod, Service } from '@dental/api-client';
import {
  ActionIcon,
  Badge,
  Button,
  Card,
  Container,
  Divider,
  Group,
  NumberInput,
  Paper,
  Select,
  SimpleGrid,
  Stack,
  Table,
  Text,
  Textarea,
  Title,
} from '@mantine/core';
import { IconCash, IconReceipt, IconRefresh, IconTrash } from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '@/lib/api.ts';
import { useAuthStore } from '@/stores/auth-store.ts';

const formatUZS = (n: string | number) =>
  new Intl.NumberFormat('uz-UZ').format(typeof n === 'string' ? Number(n) : n) + " so'm";

type CartItem = { service: Service; quantity: number; unitPrice: number };

export function CashierPage() {
  const { t } = useTranslation();
  const { hasPermission, activeBranchId } = useAuthStore();
  const qc = useQueryClient();

  const [cart, setCart] = useState<CartItem[]>([]);
  const [discount, setDiscount] = useState<number | ''>(0);
  const [paidAmount, setPaidAmount] = useState<number | ''>('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash');
  const [patientId, setPatientId] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [branchSelect, setBranchSelect] = useState<string | null>(activeBranchId);

  const branchesQuery = useQuery({ queryKey: ['branches'], queryFn: api.branches.list });
  const servicesQuery = useQuery({ queryKey: ['services'], queryFn: api.services.list });
  const txQuery = useQuery({
    queryKey: ['cashier', 'today', branchSelect],
    queryFn: () => {
      const today = new Date().toISOString().slice(0, 10);
      return api.cashier.list({
        branchId: branchSelect ?? undefined,
        from: today,
        to: today,
        pageSize: 100,
      });
    },
  });

  const summaryQuery = useQuery({
    queryKey: ['cashier', 'summary', branchSelect],
    queryFn: () => {
      if (!branchSelect) return null;
      const today = new Date().toISOString().slice(0, 10);
      return api.cashier.dailySummary(branchSelect, today);
    },
    enabled: !!branchSelect,
  });

  const total = cart.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0);
  const netTotal = total - (typeof discount === 'number' ? discount : 0);

  const createMut = useMutation({
    mutationFn: () => {
      if (!branchSelect) throw new Error('No branch');
      return api.cashier.create({
        branchId: branchSelect,
        patientId: patientId ?? undefined,
        items: cart.map((i) => ({
          serviceId: i.service.id,
          serviceName: i.service.nameUz,
          quantity: i.quantity,
          unitPrice: i.unitPrice,
        })),
        discount: typeof discount === 'number' ? discount : 0,
        paidAmount: typeof paidAmount === 'number' ? paidAmount : netTotal,
        paymentMethod,
        notes: notes || undefined,
      });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['cashier'] });
      setCart([]);
      setDiscount(0);
      setPaidAmount('');
      setNotes('');
      setPatientId(null);
    },
  });

  const refundMut = useMutation({
    mutationFn: api.cashier.refund,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['cashier'] }),
  });

  const addService = (service: Service) => {
    setCart((prev) => {
      const existing = prev.find((i) => i.service.id === service.id);
      if (existing) {
        return prev.map((i) =>
          i.service.id === service.id ? { ...i, quantity: i.quantity + 1 } : i,
        );
      }
      return [...prev, { service, quantity: 1, unitPrice: 0 }];
    });
  };

  const updateCartItem = (id: string, patch: Partial<CartItem>) => {
    setCart((prev) => prev.map((i) => (i.service.id === id ? { ...i, ...patch } : i)));
  };

  const removeCartItem = (id: string) => {
    setCart((prev) => prev.filter((i) => i.service.id !== id));
  };

  return (
    <Container size="xl">
      <Stack gap="lg">
        <Group justify="space-between">
          <Title order={2}>{t('cashier.title')}</Title>
          <Select
            label={t('cashier.branch')}
            data={branchesQuery.data?.map((b) => ({ value: b.id, label: b.name })) ?? []}
            value={branchSelect}
            onChange={setBranchSelect}
          />
        </Group>

        <SimpleGrid cols={{ base: 1, lg: 2 }} spacing="lg">
          {/* LEFT: POS form */}
          {hasPermission('cashier.create_transaction') && (
            <Paper withBorder p="lg" radius="md">
              <Stack gap="md">
                <Title order={4}>{t('cashier.new_payment')}</Title>

                <Select
                  label={t('cashier.add_service')}
                  placeholder={t('cashier.search_service')}
                  data={
                    servicesQuery.data
                      ?.filter((s) => s.isActive)
                      .map((s) => ({
                        value: s.id,
                        label: `${s.code} — ${s.nameUz}`,
                      })) ?? []
                  }
                  searchable
                  value={null}
                  onChange={(id) => {
                    const svc = servicesQuery.data?.find((s) => s.id === id);
                    if (svc) addService(svc);
                  }}
                />

                {cart.length > 0 && (
                  <Card withBorder padding="sm">
                    <Stack gap="xs">
                      {cart.map((i) => (
                        <Group key={i.service.id} justify="space-between" wrap="nowrap">
                          <Text size="sm" fw={500} style={{ flex: 1 }}>
                            {i.service.nameUz}
                          </Text>
                          <NumberInput
                            value={i.quantity}
                            onChange={(v) =>
                              updateCartItem(i.service.id, {
                                quantity: typeof v === 'number' ? v : 1,
                              })
                            }
                            min={1}
                            w={70}
                            size="xs"
                          />
                          <NumberInput
                            value={i.unitPrice}
                            onChange={(v) =>
                              updateCartItem(i.service.id, {
                                unitPrice: typeof v === 'number' ? v : 0,
                              })
                            }
                            min={0}
                            step={1000}
                            w={120}
                            size="xs"
                            suffix=" so'm"
                          />
                          <ActionIcon
                            color="red"
                            variant="subtle"
                            onClick={() => removeCartItem(i.service.id)}
                          >
                            <IconTrash size={14} />
                          </ActionIcon>
                        </Group>
                      ))}
                    </Stack>
                  </Card>
                )}

                <NumberInput
                  label={t('cashier.discount')}
                  value={discount}
                  onChange={(v) => setDiscount(typeof v === 'number' ? v : 0)}
                  min={0}
                  step={1000}
                  suffix=" so'm"
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
                    suffix=" so'm"
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
                    {t('cashier.total')}: {formatUZS(netTotal)}
                  </Text>
                  <Button
                    leftSection={<IconCash size={18} />}
                    size="md"
                    disabled={cart.length === 0 || !branchSelect}
                    loading={createMut.isPending}
                    onClick={() => createMut.mutate()}
                  >
                    {t('cashier.charge')}
                  </Button>
                </Group>
              </Stack>
            </Paper>
          )}

          {/* RIGHT: Daily summary + recent transactions */}
          <Stack gap="md">
            {summaryQuery.data && (
              <Paper withBorder p="lg" radius="md">
                <Stack gap="xs">
                  <Title order={4}>📊 {t('cashier.daily_summary')}</Title>
                  {summaryQuery.data.breakdown.length === 0 ? (
                    <Text c="dimmed">{t('cashier.no_transactions_today')}</Text>
                  ) : (
                    <Table>
                      <Table.Tbody>
                        {summaryQuery.data.breakdown.map((b, i) => (
                          // biome-ignore lint/suspicious/noArrayIndexKey: stable group rows
                          <Table.Tr key={`b-${i}`}>
                            <Table.Td>{t(`cashier.method.${b.paymentMethod}`)}</Table.Td>
                            <Table.Td>
                              <Badge color={b.type === 'refund' ? 'red' : 'teal'}>
                                {t(`cashier.type.${b.type}`)}
                              </Badge>
                            </Table.Td>
                            <Table.Td>{b.count}</Table.Td>
                            <Table.Td fw={600}>{formatUZS(b.total)}</Table.Td>
                          </Table.Tr>
                        ))}
                      </Table.Tbody>
                    </Table>
                  )}
                </Stack>
              </Paper>
            )}

            <Paper withBorder p="lg" radius="md">
              <Title order={4} mb="md">
                <IconReceipt size={18} style={{ verticalAlign: 'middle', marginRight: 6 }} />
                {t('cashier.today_transactions')}
              </Title>
              {txQuery.data && txQuery.data.data.length === 0 && (
                <Text c="dimmed">{t('cashier.no_transactions_today')}</Text>
              )}
              {txQuery.data && txQuery.data.data.length > 0 && (
                <Table verticalSpacing="xs">
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>{t('cashier.receipt')}</Table.Th>
                      <Table.Th>{t('cashier.amount')}</Table.Th>
                      <Table.Th>{t('cashier.method_short')}</Table.Th>
                      <Table.Th>{t('cashier.status')}</Table.Th>
                      <Table.Th />
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {txQuery.data.data.map((tx) => (
                      <Table.Tr key={tx.id}>
                        <Table.Td>
                          <Text ff="monospace" size="xs">
                            {tx.receiptNumber}
                          </Text>
                        </Table.Td>
                        <Table.Td>{formatUZS(tx.totalAmount)}</Table.Td>
                        <Table.Td>{t(`cashier.method.${tx.paymentMethod}`)}</Table.Td>
                        <Table.Td>
                          <Badge
                            color={
                              tx.type === 'refund'
                                ? 'orange'
                                : tx.status === 'voided'
                                  ? 'red'
                                  : 'teal'
                            }
                            size="xs"
                          >
                            {tx.type === 'refund' ? t('cashier.type.refund') : tx.status}
                          </Badge>
                        </Table.Td>
                        <Table.Td>
                          {hasPermission('cashier.refund') &&
                            tx.status === 'completed' &&
                            tx.type === 'payment' && (
                              <ActionIcon
                                variant="subtle"
                                color="orange"
                                onClick={() => {
                                  if (confirm(t('cashier.confirm_refund'))) {
                                    refundMut.mutate(tx.id);
                                  }
                                }}
                              >
                                <IconRefresh size={14} />
                              </ActionIcon>
                            )}
                        </Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              )}
            </Paper>
          </Stack>
        </SimpleGrid>
      </Stack>
    </Container>
  );
}
