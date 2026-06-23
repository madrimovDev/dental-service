import { StateView } from '@dental/ui';
import { Group, Stack, Text } from '@mantine/core';
import { IconCalendarPlus, IconCash } from '@tabler/icons-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { useAuthStore } from '@/stores/auth-store.ts';
import { useActiveLabOrders } from '../dashboard.api.ts';
import { MiniList } from './widgets/MiniList.tsx';

const fmtDate = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('uz-UZ') : '—');

/** DS1 header amal-tugmasi (token surface, permission bilan gate qilinadi). */
function HeaderAction({ to, icon, label }: { to: string; icon: ReactNode; label: string }) {
  return (
    <Text
      component={Link}
      to={to}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        height: 40,
        padding: '0 14px',
        border: '1px solid var(--border)',
        borderRadius: 10,
        background: 'var(--surface)',
        color: 'var(--ink)',
        fontSize: 13,
        fontWeight: 600,
        textDecoration: 'none',
      }}
    >
      <span style={{ display: 'inline-flex', color: 'var(--ink-3)' }}>{icon}</span>
      {label}
    </Text>
  );
}

export function TechnicianDashboard() {
  const { t } = useTranslation();
  const { hasPermission } = useAuthStore();
  const labOrders = useActiveLabOrders();
  const orders = labOrders.data ?? [];

  const canAppointment = hasPermission('appointment.view');
  const canCashier = hasPermission('cashier.view');

  return (
    <Stack gap="lg">
      {/* 1a. Header — greeting YO'Q (DS0 topbar); amal tugmalari ruxsat bilan gate qilinadi. */}
      {(canAppointment || canCashier) && (
        <Group gap={8} justify="flex-end">
          {canAppointment && (
            <HeaderAction
              to="/appointments"
              icon={<IconCalendarPlus size={17} />}
              label={t('dashboard.new_appointment', 'Yangi yozilish')}
            />
          )}
          {canCashier && (
            <HeaderAction
              to="/cashier"
              icon={<IconCash size={17} />}
              label={t('dashboard.open_cashier', 'Kassa')}
            />
          )}
        </Group>
      )}

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
        // Technician: faol lab-buyurtmalar ro'yxati (token re-skin qilingan MiniList).
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
  );
}
