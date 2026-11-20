import { PageHead, StateView } from '@dental/ui';
import { ActionIcon, Anchor, Stack, Table } from '@mantine/core';
import { IconCamera } from '@tabler/icons-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { formatCurrency } from '@/lib/format';
import { useAuthStore } from '@/stores/auth-store.ts';
import { useAllTransactions } from '../cashier.api';
import { TransactionPhotoModal } from './TransactionPhotoModal';

const fmtDate = (iso: string) => {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()}`;
};

export function TransactionsScreen() {
  const { t } = useTranslation();
  const { data, isLoading, isError, refetch } = useAllTransactions();
  const { hasPermission } = useAuthStore();
  // FT-06.3: to'lov rasmi faqat `cashier.photo.view`.
  const canViewPhoto = hasPermission('cashier.photo.view');
  const [photoId, setPhotoId] = useState<string | null>(null);

  if (isLoading) return <StateView status="loading" skeleton="table" />;
  if (isError)
    return (
      <StateView
        status="error"
        title={t('states.error_title')}
        retryLabel={t('states.retry')}
        onRetry={() => refetch()}
      />
    );

  const transactions = data?.data ?? [];

  return (
    <Stack>
      <PageHead title={t('nav.transactions')} />
      {!transactions.length ? (
        <StateView
          status="empty"
          title={t('states.empty_title')}
          description={t('cashier.transactions_empty_description')}
        />
      ) : (
        <Table striped highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>{t('common.date')}</Table.Th>
              <Table.Th>{t('common.patient')}</Table.Th>
              <Table.Th>{t('cashier.transactionType')}</Table.Th>
              <Table.Th>{t('cashier.amount')}</Table.Th>
              <Table.Th>{t('cashier.paymentMethod')}</Table.Th>
              {canViewPhoto && <Table.Th />}
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {transactions.map((tx) => (
              <Table.Tr key={tx.id}>
                <Table.Td>{fmtDate(tx.createdAt)}</Table.Td>
                <Table.Td>
                  {tx.patientId ? (
                    <Anchor component={Link} to={`/patients/${tx.patientId}`} size="sm">
                      {tx.patientName ?? t('common.view')}
                    </Anchor>
                  ) : (
                    '—'
                  )}
                </Table.Td>
                <Table.Td>{t(`cashier.type.${tx.type}`)}</Table.Td>
                <Table.Td>{formatCurrency(Number(tx.totalAmount), t)}</Table.Td>
                <Table.Td>{t(`cashier.method.${tx.paymentMethod}`)}</Table.Td>
                {canViewPhoto && (
                  <Table.Td>
                    {tx.type === 'payment' && tx.photoStatus && (
                      <ActionIcon
                        variant="subtle"
                        color="teal"
                        size={44}
                        data-testid={`photo-view-${tx.id}`}
                        aria-label={t('cashier.photo.view')}
                        title={t('cashier.photo.view')}
                        onClick={() => setPhotoId(tx.id)}
                      >
                        <IconCamera size={16} />
                      </ActionIcon>
                    )}
                  </Table.Td>
                )}
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      )}
      {canViewPhoto && (
        <TransactionPhotoModal transactionId={photoId} onClose={() => setPhotoId(null)} />
      )}
    </Stack>
  );
}
