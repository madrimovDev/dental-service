import { Container, Grid, Stack, Text, Title } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { useAppointments } from '@/features/appointments/appointments.api.ts';
import { useAuthStore } from '@/stores/auth-store.ts';
import { useTodayRange } from '../dashboard.api.ts';
import { MiniList } from './widgets/MiniList.tsx';

const fmtTime = (iso: string) =>
  new Date(iso).toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit' });

export function AssistantDashboard() {
  const { t } = useTranslation();
  const { activeBranchId } = useAuthStore();
  const range = useTodayRange();
  const appointments = useAppointments({ branchId: activeBranchId ?? undefined, ...range });
  const appts = appointments.data ?? [];

  return (
    <Container size="lg">
      <Stack gap="lg">
        <Title order={2}>{t('nav.dashboard')}</Title>

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
              <Text fw={600}>{t('dashboard.assistant_tasks')}</Text>
              <Text size="sm" c="dimmed">
                {t('dashboard.assistant_tasks_placeholder')}
              </Text>
            </Stack>
          </Grid.Col>
        </Grid>
      </Stack>
    </Container>
  );
}
