import { Card, Container, Grid, Stack, Text, Title } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@/stores/auth-store.ts';

export function DashboardPage() {
  const { t } = useTranslation();
  const { user, permissions } = useAuthStore();
  const isOwner = permissions.includes('@owner');

  return (
    <Container size="lg">
      <Stack gap="lg">
        <Title order={2}>{t('dashboard.welcome', { name: user?.fullName ?? user?.email })}</Title>

        <Grid>
          <Grid.Col span={{ base: 12, sm: 6, md: 4 }}>
            <Card withBorder shadow="sm" padding="lg" radius="md">
              <Stack gap="xs">
                <Title order={4}>{t('dashboard.your_role')}</Title>
                <Text size="lg" c="teal" fw={600}>
                  {isOwner ? 'Tenant Owner' : t('dashboard.role_staff')}
                </Text>
                <Text size="sm" c="dimmed">
                  {isOwner
                    ? t('dashboard.owner_desc')
                    : t('dashboard.permissions_count', { count: permissions.length })}
                </Text>
              </Stack>
            </Card>
          </Grid.Col>

          <Grid.Col span={{ base: 12, sm: 6, md: 4 }}>
            <Card withBorder shadow="sm" padding="lg" radius="md">
              <Stack gap="xs">
                <Title order={4}>📋 {t('dashboard.phase_1')}</Title>
                <Text size="sm">M1: Auth + RBAC ✅</Text>
                <Text size="sm" c="dimmed">
                  M2: Patient + Staff (kelajakda)
                </Text>
                <Text size="sm" c="dimmed">
                  M3: Appointment + Cashier
                </Text>
              </Stack>
            </Card>
          </Grid.Col>

          <Grid.Col span={{ base: 12, sm: 6, md: 4 }}>
            <Card withBorder shadow="sm" padding="lg" radius="md">
              <Stack gap="xs">
                <Title order={4}>🚀 {t('dashboard.quick_start')}</Title>
                <Text size="sm">{t('dashboard.tip_branches')}</Text>
                <Text size="sm">{t('dashboard.tip_users')}</Text>
                <Text size="sm">{t('dashboard.tip_roles')}</Text>
              </Stack>
            </Card>
          </Grid.Col>
        </Grid>
      </Stack>
    </Container>
  );
}
