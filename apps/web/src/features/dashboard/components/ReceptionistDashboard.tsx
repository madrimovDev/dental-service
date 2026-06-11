import { Container, Grid, SimpleGrid, Stack, Title } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { useAppointments } from '@/features/appointments/appointments.api.ts';
import { useQueueToday } from '@/features/queue/queue.api.ts';
import { useAuthStore } from '@/stores/auth-store.ts';
import { useTodayRange } from '../dashboard.api.ts';
import { MiniList } from './widgets/MiniList.tsx';
import { StatCard } from './widgets/StatCard.tsx';

const fmtTime = (iso: string) =>
  new Date(iso).toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit' });

export function ReceptionistDashboard() {
  const { t } = useTranslation();
  const { activeBranchId } = useAuthStore();
  const range = useTodayRange();
  const appointments = useAppointments({ branchId: activeBranchId ?? undefined, ...range });
  const queue = useQueueToday(activeBranchId);

  const appts = appointments.data ?? [];
  const noShow = appts.filter((a) => a.status === 'no_show').length;

  return (
    <Container size="lg">
      <Stack gap="lg">
        <Title order={2}>{t('nav.dashboard')}</Title>

        <SimpleGrid cols={{ base: 1, sm: 3 }}>
          <StatCard label={t('dashboard.today_total')} value={appts.length} color="teal" />
          <StatCard label={t('dashboard.no_show')} value={noShow} />
          <StatCard label={t('dashboard.queue')} value={(queue.data ?? []).length} />
        </SimpleGrid>

        <Grid>
          <Grid.Col span={{ base: 12, md: 6 }}>
            <MiniList
              title={t('dashboard.today_appointments')}
              items={appts.map((a) => ({
                id: a.id,
                label: `${fmtTime(a.startTime)} · ${t(`appointments.status.${a.status}`, a.status)}`,
                to: `/appointments`,
              }))}
              emptyText={t('dashboard.no_appointments')}
            />
          </Grid.Col>
          <Grid.Col span={{ base: 12, md: 6 }}>
            <MiniList
              title={t('dashboard.queue')}
              items={(queue.data ?? []).map((q) => ({
                id: q.id,
                label: `#${q.queueNumber}`,
                right: t(`queue.${q.status}`, q.status),
                to: `/queue`,
              }))}
              emptyText={t('dashboard.no_queue')}
            />
          </Grid.Col>
        </Grid>
      </Stack>
    </Container>
  );
}
