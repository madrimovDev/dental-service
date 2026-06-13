import { StateView } from '@dental/ui';
import { Container, Stack, Title } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { useActiveLabOrders } from '../dashboard.api.ts';
import { MiniList } from './widgets/MiniList.tsx';

const fmtDate = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('uz-UZ') : '—');

export function TechnicianDashboard() {
  const { t } = useTranslation();
  const labOrders = useActiveLabOrders();
  const orders = labOrders.data ?? [];

  return (
    <Container size="lg">
      <Stack gap="lg">
        <Title order={2}>{t('nav.dashboard')}</Title>

        {labOrders.isLoading ? (
          <StateView status="loading" skeleton="cards" />
        ) : labOrders.isError ? (
          <StateView
            status="error"
            title={t('states.error_title')}
            retryLabel={t('states.retry')}
            onRetry={() => labOrders.refetch()}
          />
        ) : (
          <MiniList
            title={t('dashboard.lab_queue')}
            items={orders.map((o) => ({
              id: o.id,
              label: o.labName,
              right: `${t(`lab_order.status_${o.status}`, o.status)} · ${fmtDate(o.expectedDate)}`,
            }))}
            emptyText={t('dashboard.no_lab_orders')}
          />
        )}
      </Stack>
    </Container>
  );
}
