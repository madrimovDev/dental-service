import { Container, Grid, SimpleGrid, Stack, Title } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import {
  useBranchNames,
  useDefaultPeriod,
  useDoctorNames,
  useManagerKpi,
} from '../dashboard.api.ts';
import { BarMini } from './widgets/BarMini.tsx';
import { MiniList } from './widgets/MiniList.tsx';
import { StatCard } from './widgets/StatCard.tsx';

const fmtUZS = (n: number) => `${new Intl.NumberFormat('uz-UZ').format(Math.round(n))} so'm`;
const fmtPct = (n: number) => `${Math.round(n * 100)}%`;

export function ManagerDashboard() {
  const { t } = useTranslation();
  const period = useDefaultPeriod();
  const { revenue, appointments, doctors, treatmentPlans } = useManagerKpi(period);
  const branchNames = useBranchNames();
  const doctorNames = useDoctorNames();

  const rev = revenue.data;
  const appt = appointments.data;
  const plan = treatmentPlans.data;

  return (
    <Container size="lg">
      <Stack gap="lg">
        <Title order={2}>{t('nav.dashboard')}</Title>

        <SimpleGrid cols={{ base: 1, sm: 2, md: 4 }}>
          <StatCard
            label={t('dashboard.revenue_total')}
            value={rev ? fmtUZS(rev.total) : '—'}
            color="teal"
          />
          <StatCard
            label={t('dashboard.no_show_rate')}
            value={appt ? fmtPct(appt.noShowRate) : '—'}
          />
          <StatCard
            label={t('dashboard.slot_utilization')}
            value={appt ? fmtPct(appt.slotUtilization) : '—'}
          />
          <StatCard label={t('dashboard.plan_completion')} value={plan ? fmtPct(plan.rate) : '—'} />
        </SimpleGrid>

        <Grid>
          <Grid.Col span={{ base: 12, md: 6 }}>
            <MiniList
              title={t('dashboard.revenue_by_branch')}
              items={(rev?.byBranch ?? []).map((b) => ({
                id: b.branchId,
                label: branchNames.data?.get(b.branchId) ?? b.branchId,
                right: fmtUZS(b.total),
              }))}
              emptyText={t('dashboard.empty')}
            />
          </Grid.Col>
          <Grid.Col span={{ base: 12, md: 6 }}>
            <MiniList
              title={t('dashboard.top_doctors')}
              items={(doctors.data ?? []).map((d) => ({
                id: d.doctorId,
                label: doctorNames.data?.get(d.doctorId) ?? d.doctorId,
                right: `${d.completed}/${d.total}`,
              }))}
              emptyText={t('dashboard.empty')}
            />
          </Grid.Col>
          <Grid.Col span={12}>
            <BarMini
              data={(rev?.byService ?? []).slice(0, 8).map((s) => ({
                label: s.serviceName,
                value: s.total,
                display: fmtUZS(s.total),
              }))}
            />
          </Grid.Col>
        </Grid>
      </Stack>
    </Container>
  );
}
