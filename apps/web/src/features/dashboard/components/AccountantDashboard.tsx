import { StateView } from '@dental/ui';
import { Box, Group, Stack, Text, Title } from '@mantine/core';
import { IconCalendarPlus, IconCash } from '@tabler/icons-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { useDailySummary } from '@/features/cashier/cashier.api.ts';
import { formatCurrency } from '@/lib/format';
import { useAuthStore } from '@/stores/auth-store.ts';
import { useDefaultPeriod, useRevenueReport } from '../dashboard.api.ts';
import { toStatDelta } from '../dashboard.mappers';
import { BarMini } from './widgets/BarMini.tsx';
import { MiniList } from './widgets/MiniList.tsx';
import { Sparkline } from './widgets/Sparkline.tsx';
import { StatCard } from './widgets/StatCard.tsx';

const CARD_RADIUS = 'var(--radius-card)';
// Off-scale literal (parity): KPI grid gap 14px (4px shkalada yo'q: 12/16).
const KPI_GAP = 14;

/** DS1 token karta SHELL — inline (off-scale 16px radius + shadow-sm). */
function CardShell({ children }: { children: ReactNode }) {
  return (
    <Box
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: CARD_RADIUS,
        boxShadow: 'var(--shadow-sm)',
        padding: '18px 18px 8px',
      }}
    >
      {children}
    </Box>
  );
}

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

export function AccountantDashboard() {
  const { t } = useTranslation();
  const { activeBranchId, hasPermission } = useAuthStore();
  const period = useDefaultPeriod();
  const revenue = useRevenueReport(period);
  const summary = useDailySummary(activeBranchId);

  const rev = revenue.data;

  const canAppointment = hasPermission('appointment.view');
  const canCashier = hasPermission('cashier.view');

  return (
    <Stack gap="lg">
      {/* 1a. Header qatori — greeting YO'Q (DS0 topbar sarlavhani olib boradi); amal tugmalari o'ngga surilgan. */}
      {(canAppointment || canCashier) && (
        <Group gap="xs" justify="flex-end">
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
          {/* 1b. KPI qatori — repeat(4,1fr), gap 14px (off-scale literal, parity).
              Buxgalterda 2 KPI bor → qolgan 2 ustun bo'sh (grid bir xil shell). */}
          <Box
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(4, 1fr)',
              gap: KPI_GAP,
            }}
          >
            <StatCard
              label={t('dashboard.revenue_total')}
              value={rev ? formatCurrency(rev.total, t) : '—'}
              color="teal"
              delta={toStatDelta(rev?.comparison?.previous, t)}
              spark={<Sparkline points={(rev?.byPeriod ?? []).map((p) => p.total)} />}
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
          </Box>

          {/* 1c. Ikki ustunli tana — minmax(0,1fr) 360px, gap 16, align-items:start. */}
          <Box
            style={{
              display: 'grid',
              gridTemplateColumns: 'minmax(0, 1fr) 360px',
              gap: 16,
              alignItems: 'start',
            }}
          >
            {/* Chap ustun — haftalik tushum kartasi (line chart deferred → BarMini by-service). */}
            <Stack gap="md" style={{ minWidth: 0 }}>
              <CardShell>
                <Stack gap="sm">
                  <Title order={4} fw={700} c="var(--ink)">
                    {t('dashboard.weekly_revenue', 'Haftalik tushum')}
                  </Title>
                  {/* Line chart (7-kunlik seriya) DEFERRED — data-gap (ds12);
                      mavjud by-service BarMini re-skin sifatida saqlanadi. */}
                  <BarMini
                    data={(rev?.byService ?? []).slice(0, 8).map((s) => ({
                      label: s.serviceName,
                      value: s.total,
                      display: formatCurrency(s.total, t),
                    }))}
                  />
                </Stack>
              </CardShell>
            </Stack>

            {/* O'ng rail (360px) — kunlik kassa breakdown ro'yxati saqlanadi.
                Navbat/recall/faollik kartalari OMIT (data-gap, ds12). */}
            <Stack gap="md">
              <MiniList
                title={t('dashboard.daily_cash')}
                items={(summary.data?.breakdown ?? []).map((b, i) => ({
                  id: `${b.paymentMethod}-${b.type}-${i}`,
                  label: `${b.paymentMethod} · ${b.type}`,
                  right: `${formatCurrency(Number(b.total), t)} (${b.count})`,
                }))}
                emptyText={t('dashboard.empty')}
              />
            </Stack>
          </Box>
        </>
      )}
    </Stack>
  );
}
