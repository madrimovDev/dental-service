import { PageHead, StateView, StatusPill } from '@dental/ui';
import { Anchor, Stack, Table } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { formatCurrency } from '@/lib/format';
import { useAllTreatmentPlans } from '../clinical.api';
import { planStatusToTone } from '../clinical.mappers';

const fmtDate = (iso: string) => {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()}`;
};

export function PlansScreen() {
  const { t } = useTranslation();
  const { data, isLoading, isError } = useAllTreatmentPlans();

  if (isLoading) return <StateView status="loading" skeleton="table" />;
  if (isError) return <StateView status="error" />;

  return (
    <Stack>
      <PageHead title={t('nav.plans')} />
      {!data?.length ? (
        <StateView status="empty" />
      ) : (
        <Table striped highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>{t('common.date')}</Table.Th>
              <Table.Th>{t('common.patient')}</Table.Th>
              <Table.Th>{t('plans.title')}</Table.Th>
              <Table.Th>{t('common.status')}</Table.Th>
              <Table.Th>{t('plans.total')}</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {data.map((plan) => (
              <Table.Tr key={plan.id}>
                <Table.Td>{fmtDate(plan.createdAt)}</Table.Td>
                <Table.Td>
                  <Anchor component={Link} to={`/patients/${plan.patientId}`} size="sm">
                    {t('common.view')}
                  </Anchor>
                </Table.Td>
                <Table.Td>{plan.title}</Table.Td>
                <Table.Td>
                  <StatusPill status={planStatusToTone(plan.status)}>
                    {t(`treatment_plan.status_${plan.status}`)}
                  </StatusPill>
                </Table.Td>
                <Table.Td>{formatCurrency(Number(plan.totalCost), t)}</Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      )}
    </Stack>
  );
}
