import { Stack, Text, Title } from '@mantine/core';
import type { CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@/stores/auth-store.ts';

const cardStyle: CSSProperties = {
  borderRadius: 'var(--radius-card)',
  border: '1px solid var(--border)',
  background: 'var(--surface)',
  boxShadow: 'var(--shadow-sm)',
  padding: 16,
};

/** Fallback dashboard — noma'lum/rolsiz kontekst uchun. Greeting Title saqlanadi (mazmunli). */
export function GenericDashboard() {
  const { t } = useTranslation();
  const { user, permissions } = useAuthStore();
  const isOwner = permissions.includes('@owner');

  return (
    <div style={{ width: '100%' }}>
      <Stack gap="lg">
        <Title order={2}>{t('dashboard.welcome', { name: user?.fullName ?? user?.phone })}</Title>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
            gap: 16,
          }}
        >
          <div style={cardStyle}>
            <Stack gap="xs">
              <Title order={4}>{t('dashboard.your_role')}</Title>
              <Text size="lg" c="var(--primary)" fw={600}>
                {isOwner ? 'Tenant Owner' : t('dashboard.role_staff')}
              </Text>
              <Text size="sm" c="var(--ink-3)">
                {isOwner
                  ? t('dashboard.owner_desc')
                  : t('dashboard.permissions_count', { count: permissions.length })}
              </Text>
            </Stack>
          </div>

          <div style={cardStyle}>
            <Stack gap="xs">
              <Title order={4}>{t('dashboard.quick_start')}</Title>
              <Text size="sm" c="var(--ink)">
                {t('dashboard.tip_branches')}
              </Text>
              <Text size="sm" c="var(--ink)">
                {t('dashboard.tip_users')}
              </Text>
              <Text size="sm" c="var(--ink)">
                {t('dashboard.tip_roles')}
              </Text>
            </Stack>
          </div>
        </div>
      </Stack>
    </div>
  );
}
