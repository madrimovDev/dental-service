import { StateView } from '@dental/ui';
import { Box, Group, Stack, Text, Title } from '@mantine/core';
import { IconCalendarPlus, IconCash } from '@tabler/icons-react';
import dayjs from 'dayjs';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { useRecentActivity } from '@/features/audit/audit.api.ts';
import { useRecallSummary } from '@/features/recalls/recalls.api.ts';
import { formatCurrency } from '@/lib/format';
import { useAuthStore } from '@/stores/auth-store.ts';
import {
  useDebtAging,
  useDefaultPeriod,
  useDoctorNames,
  useManagerKpi,
  useOwnerToday,
} from '../dashboard.api.ts';
import { OnboardingChecklist } from './OnboardingChecklist.tsx';
import { OwnerAlertsPanel } from './OwnerAlertsPanel.tsx';
import { BranchesToday, DoctorsToday } from './OwnerTodaySections.tsx';
import { MiniList } from './widgets/MiniList.tsx';
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

/**
 * Activity feed rail kartasi — faqat `audit_log.view` ruxsati bor bo'lganda render qilinadi.
 * Hook shu komponent ichida — permission yo'q bo'lsa mount bo'lmaydi, 403 so'rov yuborilmaydi.
 * before/after backend'da qaytarilmaydi (metadata-only endpoint).
 */
function ActivityRailCard() {
  const { t } = useTranslation();
  const { data: rows, isLoading } = useRecentActivity();

  if (isLoading) {
    return (
      <MiniList title={t('dashboard.activityFeed')} items={[]} emptyText={t('common.loading')} />
    );
  }

  const items = (rows ?? []).map((r) => ({
    id: r.id,
    label: `${r.actorName ?? t('audit.system')} — ${t(`audit.action.${r.action}`, r.action)} ${t(`audit.resource.${r.resourceType}`, r.resourceType)}`,
    right: dayjs(r.createdAt).fromNow(),
  }));

  return (
    <MiniList title={t('dashboard.activityFeed')} items={items} emptyText={t('audit.empty')} />
  );
}

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

/** KPI kartani bosiladigan qiladi (spec UI-M1: «4 KPI bosiladi»). */
function KpiLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link to={to} style={{ color: 'inherit', textDecoration: 'none', display: 'block' }}>
      {children}
    </Link>
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
  const { revenue, appointments } = useManagerKpi(period);
  const doctorNames = useDoctorNames();
  const debt = useDebtAging().data;
  const today = useOwnerToday().data;
  const methodsHint = today
    ? [
        ...today.byPaymentMethod
          .filter((m) => m.total !== 0)
          .map(
            (m) =>
              `${t(`ownerHome.method${m.paymentMethod.charAt(0).toUpperCase()}${m.paymentMethod.slice(1)}`)} ${formatCurrency(m.total, t)}`,
          ),
        t('ownerHome.kpiRevenueHint', { refunded: formatCurrency(today.refunded, t) }),
      ].join(' · ')
    : undefined;

  const appt = appointments.data;

  const canAppointment = hasPermission('appointment.view');
  const canCashier = hasPermission('cashier.view');
  const canRecall = hasPermission('recall.view');
  const canAuditView = hasPermission('audit_log.view');

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
            <KpiLink to="/cashier">
              <StatCard
                label={t('ownerHome.kpiRevenueToday')}
                value={today ? formatCurrency(today.netTotal, t) : '—'}
                color="teal"
                hint={methodsHint}
              />
            </KpiLink>
            {hasPermission('report.view') && (
              <KpiLink to="/reports">
                <StatCard
                  label={t('ownerHome.kpiDebt')}
                  value={debt ? formatCurrency(debt.totalDebt, t) : '—'}
                  color={debt && debt.over90Count > 0 ? 'var(--danger)' : undefined}
                  hint={
                    debt
                      ? t('ownerHome.kpiDebtHint', {
                          count: debt.patientCount,
                          over: debt.over90Count,
                        })
                      : undefined
                  }
                />
              </KpiLink>
            )}
            <KpiLink to="/appointments">
              <StatCard
                label={t('ownerHome.kpiUtil')}
                value={appt ? fmtPct(appt.slotUtilization) : '—'}
              />
            </KpiLink>
            <KpiLink to="/reports">
              <StatCard
                label={t('ownerHome.kpiNoShow')}
                value={appt ? fmtPct(appt.noShowRate) : '—'}
              />
            </KpiLink>
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
            {/* Chap ustun — kanvas: «Filiallar bugun» jadvali + «Shifokorlar bugun». */}
            <Stack gap="md" style={{ minWidth: 0 }}>
              <BranchesToday data={today} />
              <DoctorsToday data={today} names={doctorNames.data} />
            </Stack>

            {/* O'ng rail (360px) — masalalar paneli + recall/faollik kartalari.
                Navbat/recall/faollik kartalari OMIT (data-gap, ds12 — manager'da hook yo'q). */}
            <Stack gap={16}>
              <OwnerAlertsPanel />
              {/* Recall rail — faqat recall.view ruxsati bor bo'lsa render qilinadi.
                  RecallRailCard ichida hook bor → mount bo'lmasa 403 so'rov yuborilmaydi. */}
              {canRecall && <RecallRailCard />}
              {/* Activity feed rail — faqat audit_log.view ruxsati bor bo'lsa render qilinadi.
                  ActivityRailCard ichida hook bor → mount bo'lmasa so'rov yuborilmaydi. */}
              {canAuditView && <ActivityRailCard />}
            </Stack>
          </Box>
        </>
      )}
    </Stack>
  );
}
