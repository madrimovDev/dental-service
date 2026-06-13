import { StateView } from '@dental/ui';
import { Container, Grid, SimpleGrid, Stack, Title } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { useDailySummary } from '@/features/cashier/cashier.api.ts';
import { useAuthStore } from '@/stores/auth-store.ts';
import { useDefaultPeriod, useRevenueReport } from '../dashboard.api.ts';
import { MiniList } from './widgets/MiniList.tsx';
import { StatCard } from './widgets/StatCard.tsx';

const fmtUZS = (n: number) => `${new Intl.NumberFormat('uz-UZ').format(Math.round(n))} so'm`;

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
                value={rev ? fmtUZS(rev.total) : '—'}
                color="teal"
              />
              <StatCard
                label={t('dashboard.daily_cash')}
                value={
                  summary.data
                    ? fmtUZS(summary.data.breakdown.reduce((s, b) => s + Number(b.total), 0))
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
                    right: `${fmtUZS(Number(b.total))} (${b.count})`,
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
