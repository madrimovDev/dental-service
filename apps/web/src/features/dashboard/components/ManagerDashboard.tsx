import { StateView } from '@dental/ui';
import { Box, Group, Stack, Text } from '@mantine/core';
import { IconCalendarPlus, IconCash } from '@tabler/icons-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { useRecallSummary } from '@/features/recalls/recalls.api.ts';
import { formatCurrency } from '@/lib/format';
import { useAuthStore } from '@/stores/auth-store.ts';
import {
  useBranchNames,
  useDefaultPeriod,
  useDoctorNames,
  useManagerKpi,
} from '../dashboard.api.ts';
import { toStatDelta } from '../dashboard.mappers';
import { OnboardingChecklist } from './OnboardingChecklist.tsx';
import { BarMini } from './widgets/BarMini.tsx';
import { MiniList } from './widgets/MiniList.tsx';
import { Sparkline } from './widgets/Sparkline.tsx';
import { StatCard } from './widgets/StatCard.tsx';

const fmtPct = (n: number) => `${Math.round(n * 100)}%`;

/**
 * Recall rail kartasi — faqat `recall.view` ruxsati bor bo'lganda render qilinadi.
 * Hook shu komponent ichida — Permission yo'q bo'lsa komponent mount bo'lmaydi,
 * shu sababli 403 so'rov ham yuborilmaydi (RBAC gap avoidance pattern).
 */
function RecallRailCard() {
  const { t } = useTranslation();
  const { data: kpi } = useRecallSummary();
  return (
    <MiniList
      title={t('recall.title')}
      items={[
        {
          id: 'pending',
          label: t('recall.kpi.pending'),
          right: String(kpi?.pending ?? '—'),
        },
        {
          id: 'overdue',
          label: t('recall.kpi.overdue'),
          right: String(kpi?.overdue ?? '—'),
        },
      ]}
      emptyText={t('dashboard.empty')}
    />
  );
}

// Off-scale literal (parity): tokenlar --radius-xl:14px da to'xtaydi; DS1 karta 16px.
const CARD_RADIUS = 16;
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

export function ManagerDashboard() {
  const { t } = useTranslation();
  const { hasPermission } = useAuthStore();
  const period = useDefaultPeriod();
  const { revenue, appointments, doctors, treatmentPlans } = useManagerKpi(period);
  const branchNames = useBranchNames();
  const doctorNames = useDoctorNames();

  const rev = revenue.data;
  const appt = appointments.data;
  const plan = treatmentPlans.data;

  const canAppointment = hasPermission('appointment.view');
  const canCashier = hasPermission('cashier.view');
  const canRecall = hasPermission('recall.view');

  return (
    <Stack gap="lg">
      {/* 1a. Header qatori — greeting YO'Q (DS0 topbar sarlavhani olib boradi); amal tugmalari o'ngga surilgan. */}
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

      <OnboardingChecklist />

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
          {/* 1b. KPI qatori — repeat(4,1fr), gap 14px (off-scale literal, parity). */}
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
              label={t('dashboard.no_show_rate')}
              value={appt ? fmtPct(appt.noShowRate) : '—'}
            />
            <StatCard
              label={t('dashboard.slot_utilization')}
              value={appt ? fmtPct(appt.slotUtilization) : '—'}
            />
            <StatCard
              label={t('dashboard.plan_completion')}
              value={plan ? fmtPct(plan.rate) : '—'}
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
            <Stack gap={16} style={{ minWidth: 0 }}>
              <CardShell>
                <Stack gap="sm">
                  <Text fw={700} fz="md" c="var(--ink)">
                    {t('dashboard.weekly_revenue', 'Haftalik tushum')}
                  </Text>
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

            {/* O'ng rail (360px) — revenue-by-branch + top-doctors ro'yxatlari saqlanadi.
                Navbat/recall/faollik kartalari OMIT (data-gap, ds12 — manager'da hook yo'q). */}
            <Stack gap={16}>
              <MiniList
                title={t('dashboard.revenue_by_branch')}
                items={(rev?.byBranch ?? []).map((b) => ({
                  id: b.branchId,
                  label: branchNames.data?.get(b.branchId) ?? b.branchId,
                  right: formatCurrency(b.total, t),
                }))}
                emptyText={t('dashboard.empty')}
              />
              <MiniList
                title={t('dashboard.top_doctors')}
                items={(doctors.data ?? []).map((d) => ({
                  id: d.doctorId,
                  label: doctorNames.data?.get(d.doctorId) ?? d.doctorId,
                  right: `${d.completed}/${d.total}`,
                }))}
                emptyText={t('dashboard.empty')}
              />
              {/* Recall rail — faqat recall.view ruxsati bor bo'lsa render qilinadi.
                  RecallRailCard ichida hook bor → mount bo'lmasa 403 so'rov yuborilmaydi. */}
              {canRecall && <RecallRailCard />}
            </Stack>
          </Box>
        </>
      )}
    </Stack>
  );
}
