import { StateView } from '@dental/ui';
import { Group, Stack, Text } from '@mantine/core';
import { IconCalendarPlus, IconCash } from '@tabler/icons-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { useAppointments } from '@/features/appointments/appointments.api.ts';
import { useAuthStore } from '@/stores/auth-store.ts';
import { useTodayRange } from '../dashboard.api.ts';
import { ScheduleList } from './widgets/ScheduleList.tsx';

const fmtTime = (iso: string) =>
  new Date(iso).toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit' });

/** Davomiylik (daqiqa) = end − start (sof arifmetika, hook YO'Q). */
const fmtDuration = (start: string, end: string) => {
  const min = Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60000);
  return min > 0 ? `${min}m` : undefined;
};

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

export function AssistantDashboard() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { activeBranchId, hasPermission } = useAuthStore();
  const range = useTodayRange();
  const appointments = useAppointments({ branchId: activeBranchId ?? undefined, ...range });
  const appts = appointments.data ?? [];

  const canAppointment = hasPermission('appointment.view');
  const canCashier = hasPermission('cashier.view');

  return (
    <Stack gap="lg">
      {/* 1a. Header — greeting YO'Q (DS0 topbar); amal tugmalari o'ngga surilgan. */}
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

      {appointments.isLoading ? (
        <StateView status="loading" skeleton="cards" />
      ) : appointments.isError ? (
        <StateView
          status="error"
          title={t('states.error_title')}
          retryLabel={t('states.retry')}
          onRetry={() => appointments.refetch()}
        />
      ) : (
        // Assistant: KPI yo'q, rail yo'q (navbat/recall/faollik OMIT) → bitta ustun jadval.
        <ScheduleList
          title={t('dashboard.today_appointments')}
          calendarLabel={t('dashboard.calendar_link', 'Kalendar')}
          onCalendar={() => navigate('/appointments')}
          rows={appts.map((a) => ({
            id: a.id,
            time: fmtTime(a.startTime),
            patient: '—',
            duration: fmtDuration(a.startTime, a.endTime),
            status: a.status,
            statusLabel: t(`appointments.status.${a.status}`, a.status),
          }))}
          emptyText={t('dashboard.no_appointments')}
          onRowClick={() => navigate('/appointments')}
        />
      )}
    </Stack>
  );
}
