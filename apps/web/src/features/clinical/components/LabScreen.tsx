import { PageHead, StateView, StatusPill } from '@dental/ui';
import { Anchor, Stack, Table } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { useAllLabOrders } from '../clinical.api';
import { labOrderStatusToTone } from '../clinical.mappers';

const fmtDate = (iso: string) => {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()}`;
};

export function LabScreen() {
  const { t } = useTranslation();
  const { data, isLoading, isError } = useAllLabOrders();

  if (isLoading) return <StateView status="loading" skeleton="table" />;
  if (isError) return <StateView status="error" />;

  return (
    <Stack>
      <PageHead title={t('nav.lab')} />
      {!data?.length ? (
        <StateView status="empty" />
      ) : (
        <Table striped highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>{t('common.date')}</Table.Th>
              <Table.Th>{t('common.patient')}</Table.Th>
              <Table.Th>{t('lab.orderType')}</Table.Th>
              <Table.Th>{t('lab.expectedDate')}</Table.Th>
              <Table.Th>{t('common.status')}</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {data.map((order) => (
              <Table.Tr key={order.id}>
                <Table.Td>{fmtDate(order.createdAt)}</Table.Td>
                <Table.Td>
                  <Anchor component={Link} to={`/patients/${order.patientId}`} size="sm">
                    {t('common.view')}
                  </Anchor>
                </Table.Td>
                <Table.Td>{t(`lab_order.type_${order.orderType}`)}</Table.Td>
                <Table.Td>{order.expectedDate ? fmtDate(order.expectedDate) : '—'}</Table.Td>
                <Table.Td>
                  <StatusPill status={labOrderStatusToTone(order.status)}>
                    {t(`lab_order.status_${order.status}`)}
                  </StatusPill>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      )}
    </Stack>
  );
}
