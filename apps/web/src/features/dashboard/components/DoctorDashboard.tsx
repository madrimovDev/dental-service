import { Container, Grid, SimpleGrid, Stack, Text, Title } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@/stores/auth-store.ts';
import { useDoctorAppointments, useTodayRange } from '../dashboard.api.ts';
import { MiniList } from './widgets/MiniList.tsx';
import { StatCard } from './widgets/StatCard.tsx';

const fmtTime = (iso: string) =>
  new Date(iso).toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit' });

export function DoctorDashboard() {
  const { t } = useTranslation();
  const { user, activeBranchId } = useAuthStore();
  const range = useTodayRange();
  // Bugungi bemorlar = joriy doktorning (auth user id) bugungi qabullari.
  const appointments = useDoctorAppointments(user?.id, activeBranchId, range);
  const appts = appointments.data ?? [];

  return (
    <Container size="lg">
      <Stack gap="lg">
        <Title order={2}>{t('nav.dashboard')}</Title>

        <SimpleGrid cols={{ base: 1, sm: 2 }}>
          <StatCard label={t('dashboard.today_total')} value={appts.length} color="teal" />
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
            <Stack gap="xs">
              <Text fw={600}>{t('dashboard.doctor_pending')}</Text>
              <Text size="sm" c="dimmed">
                {t('dashboard.doctor_pending_placeholder')}
              </Text>
            </Stack>
          </Grid.Col>
        </Grid>
      </Stack>
    </Container>
  );
}
