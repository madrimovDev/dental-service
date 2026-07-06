import { PageHead, StateView } from '@dental/ui';
import { Anchor, Stack, Table } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { formatCurrency } from '@/lib/format';
import { useAllTransactions } from '../cashier.api';

const fmtDate = (iso: string) => {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()}`;
};

export function TransactionsScreen() {
  const { t } = useTranslation();
  const { data, isLoading, isError } = useAllTransactions();

  if (isLoading) return <StateView status="loading" skeleton="table" />;
  if (isError) return <StateView status="error" />;

  const transactions = data?.data ?? [];

  return (
    <Stack>
      <PageHead title={t('nav.transactions')} />
      {!transactions.length ? (
        <StateView status="empty" />
      ) : (
        <Table striped highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>{t('common.date')}</Table.Th>
              <Table.Th>{t('common.patient')}</Table.Th>
              <Table.Th>{t('cashier.transactionType')}</Table.Th>
              <Table.Th>{t('cashier.amount')}</Table.Th>
              <Table.Th>{t('cashier.paymentMethod')}</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {transactions.map((tx) => (
              <Table.Tr key={tx.id}>
                <Table.Td>{fmtDate(tx.createdAt)}</Table.Td>
                <Table.Td>
                  {tx.patientId ? (
                    <Anchor component={Link} to={`/patients/${tx.patientId}`} size="sm">
                      {t('common.view')}
                    </Anchor>
                  ) : (
                    '—'
                  )}
                </Table.Td>
                <Table.Td>{t(`cashier.type.${tx.type}`)}</Table.Td>
                <Table.Td>{formatCurrency(Number(tx.totalAmount), t)}</Table.Td>
                <Table.Td>{t(`cashier.method.${tx.paymentMethod}`)}</Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      )}
    </Stack>
  );
}
