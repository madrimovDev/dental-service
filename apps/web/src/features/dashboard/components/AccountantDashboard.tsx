import { StateView } from '@dental/ui';
import { Container, Grid, SimpleGrid, Stack, Title } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { useDailySummary } from '@/features/cashier/cashier.api.ts';
import { formatCurrency } from '@/lib/format';
import { useAuthStore } from '@/stores/auth-store.ts';
import { useDefaultPeriod, useRevenueReport } from '../dashboard.api.ts';
import { MiniList } from './widgets/MiniList.tsx';
import { StatCard } from './widgets/StatCard.tsx';

export function AccountantDashboard() {
  const { t } = useTranslation();
  const { activeBranchId } = useAuthStore();
  const period = useDefaultPeriod();
  const revenue = useRevenueReport(period);
  const summary = useDailySummary(activeBranchId);

  const rev = revenue.data;

  return (
    <Container size="lg">
      <Stack gap="lg">
        <Title order={2}>{t('nav.dashboard')}</Title>

        {revenue.isLoading ? (
          <StateView status="loading" skeleton="cards" />
        ) : revenue.isError ? (
          <StateView
            status="error"
            title={t('states.error_title')}
            retryLabel={t('states.retry')}
            onRetry={() => revenue.refetch()}
          />
        ) : (
          <>
            <SimpleGrid cols={{ base: 1, sm: 2 }}>
              <StatCard
                label={t('dashboard.revenue_total')}
                value={rev ? formatCurrency(rev.total, t) : '—'}
                color="teal"
              />
              <StatCard
                label={t('dashboard.daily_cash')}
                value={
                  summary.data
                    ? formatCurrency(
                        summary.data.breakdown.reduce((s, b) => s + Number(b.total), 0),
                        t,
                      )
                    : '—'
                }
              />
            </SimpleGrid>

            <Grid>
              <Grid.Col span={12}>
                <MiniList
                  title={t('dashboard.daily_cash')}
                  items={(summary.data?.breakdown ?? []).map((b, i) => ({
                    id: `${b.paymentMethod}-${b.type}-${i}`,
                    label: `${b.paymentMethod} · ${b.type}`,
                    right: `${formatCurrency(Number(b.total), t)} (${b.count})`,
                  }))}
                  emptyText={t('dashboard.empty')}
                />
              </Grid.Col>
            </Grid>
          </>
        )}
      </Stack>
    </Container>
  );
}
