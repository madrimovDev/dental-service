import type { CashierTransaction } from '@dental/api-client';
import { Mono } from '@dental/ui';
import { ActionIcon, Badge, Button, Group, Modal, Stack, Table, Text, Title } from '@mantine/core';
import { IconReceipt, IconRefresh } from '@tabler/icons-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { formatCurrency } from '@/lib/format';
import { useAuthStore } from '@/stores/auth-store.ts';
import { useRefund } from '../cashier.api';
import { toTransactionVM } from '../cashier.mappers';

export interface TransactionsTableProps {
  transactions: CashierTransaction[];
}

export function TransactionsTable({ transactions }: TransactionsTableProps) {
  const { t } = useTranslation();
  const { hasPermission } = useAuthStore();
  const refundMut = useRefund();
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const canRefund = hasPermission('cashier.refund');
  const vms = transactions.map(toTransactionVM);
  const selected = vms.find((v) => v.id === confirmId);

  const confirmRefund = () => {
    if (confirmId) {
      refundMut.mutate(confirmId);
      setConfirmId(null);
    }
  };

  return (
    <>
      <Title order={4} mb="md">
        <IconReceipt size={18} style={{ verticalAlign: 'middle', marginRight: 6 }} />
        {t('cashier.today_transactions')}
      </Title>

      {vms.length === 0 ? (
        <Text c="dimmed">{t('cashier.no_transactions_today')}</Text>
      ) : (
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
            {vms.map((tx) => (
              <Table.Tr key={tx.id}>
                <Table.Td>
                  <Mono>{tx.receiptNumber ?? '—'}</Mono>
                </Table.Td>
                <Table.Td>{formatCurrency(tx.totalAmount, t)}</Table.Td>
                <Table.Td>{t(`cashier.method.${tx.paymentMethod}`)}</Table.Td>
                <Table.Td>
                  <Badge
                    color={
                      tx.type === 'refund' ? 'orange' : tx.status === 'voided' ? 'red' : 'teal'
                    }
                    size="xs"
                  >
                    {tx.type === 'refund'
                      ? t('cashier.type.refund')
                      : t(`cashier.status_label.${tx.status}`)}
                  </Badge>
                </Table.Td>
                <Table.Td>
                  {canRefund && tx.refundable && (
                    <ActionIcon
                      variant="subtle"
                      color="orange"
                      aria-label={t('cashier.refund_modal.title')}
                      onClick={() => setConfirmId(tx.id)}
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

      <Modal
        opened={confirmId !== null}
        onClose={() => setConfirmId(null)}
        title={t('cashier.refund_modal.title')}
        centered
      >
        <Stack gap="md">
          <Text>{t('cashier.refund_modal.body')}</Text>
          {selected && (
            <Stack gap={4}>
              <Group justify="space-between">
                <Text size="sm" c="dimmed">
                  {t('cashier.refund_modal.detail_receipt')}
                </Text>
                <Mono>{selected.receiptNumber ?? '—'}</Mono>
              </Group>
              <Group justify="space-between">
                <Text size="sm" c="dimmed">
                  {t('cashier.refund_modal.detail_amount')}
                </Text>
                <Text fw={600}>{formatCurrency(selected.totalAmount, t)}</Text>
              </Group>
              <Group justify="space-between">
                <Text size="sm" c="dimmed">
                  {t('cashier.refund_modal.detail_method')}
                </Text>
                <Text>{t(`cashier.method.${selected.paymentMethod}`)}</Text>
              </Group>
            </Stack>
          )}
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setConfirmId(null)}>
              {t('cashier.refund_modal.cancel')}
            </Button>
            <Button color="orange" loading={refundMut.isPending} onClick={confirmRefund}>
              {t('cashier.refund_modal.confirm')}
            </Button>
          </Group>
        </Stack>
      </Modal>
    </>
  );
}
