import { Mono } from '@dental/ui';
import { Badge, Group, Paper, Stack, Table, Text } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { BalanceBadge } from '@/components/BalanceBadge';
import { usePatientBalance, usePatientPayments } from '../../patients.api';

export function PaymentsTab({ patientId }: { patientId: string }) {
  const { t } = useTranslation();
  const query = usePatientPayments(patientId);
  const balanceQuery = usePatientBalance(patientId);

  if (query.isLoading) return <Text>{t('common.loading')}</Text>;

  const rows = query.data?.data ?? [];

  if (rows.length === 0) {
    return (
      <Paper withBorder p="xl" radius="md">
        <Text c="dimmed">{t('patients.payments_empty')}</Text>
      </Paper>
    );
  }

  return (
    <Paper withBorder p="md" radius="md">
      <Stack gap="sm">
        {balanceQuery.data && (
          <Group justify="space-between">
            <Text fw={600}>{t('patients.balance')}</Text>
            <BalanceBadge balance={balanceQuery.data.balance} size="md" />
          </Group>
        )}
        <Table.ScrollContainer minWidth={700}>
          <Table striped highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>{t('cashier.date')}</Table.Th>
                <Table.Th>{t('cashier.receipt')}</Table.Th>
                <Table.Th>{t('cashier.amount')}</Table.Th>
                <Table.Th>{t('cashier.payment_method')}</Table.Th>
                <Table.Th>{t('cashier.status')}</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {rows.map((tx) => (
                <Table.Tr key={tx.id}>
                  <Table.Td>
                    <Mono>{new Date(tx.createdAt).toLocaleDateString()}</Mono>
                  </Table.Td>
                  <Table.Td>{tx.receiptNumber ? <Mono>{tx.receiptNumber}</Mono> : '—'}</Table.Td>
                  <Table.Td>
                    <Mono>
                      {Number(tx.paidAmount).toLocaleString()} {tx.currency}
                    </Mono>
                  </Table.Td>
                  <Table.Td>{t(`cashier.method.${tx.paymentMethod}`)}</Table.Td>
                  <Table.Td>
                    <Group gap="xs">
                      <Badge variant="light" color={tx.type === 'refund' ? 'red' : 'green'}>
                        {tx.status}
                      </Badge>
                    </Group>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      </Stack>
    </Paper>
  );
}
