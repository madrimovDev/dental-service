import { PageHead, StateView } from '@dental/ui';
import { Anchor, Stack, Table, Text } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { useAllPrescriptions } from '../clinical.api';

const fmtDate = (iso: string) => {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()}`;
};

export function RxScreen() {
  const { t } = useTranslation();
  const { data, isLoading, isError } = useAllPrescriptions();

  if (isLoading) return <StateView status="loading" skeleton="table" />;
  if (isError) return <StateView status="error" />;

  return (
    <Stack>
      <PageHead title={t('nav.rx')} />
      {!data?.length ? (
        <StateView status="empty" />
      ) : (
        <Table striped highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>{t('common.date')}</Table.Th>
              <Table.Th>{t('common.patient')}</Table.Th>
              <Table.Th>{t('rx.itemsCount')}</Table.Th>
              <Table.Th>{t('rx.diagnosis')}</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {data.map((rx) => (
              <Table.Tr key={rx.id}>
                <Table.Td>{fmtDate(rx.issuedDate)}</Table.Td>
                <Table.Td>
                  <Anchor component={Link} to={`/patients/${rx.patientId}`} size="sm">
                    {t('common.view')}
                  </Anchor>
                </Table.Td>
                <Table.Td>{rx.items.length}</Table.Td>
                <Table.Td>
                  {rx.diagnosis ? (
                    <Text size="sm" truncate="end" maw={200}>
                      {rx.diagnosis}
                    </Text>
                  ) : (
                    '—'
                  )}
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      )}
    </Stack>
  );
}
