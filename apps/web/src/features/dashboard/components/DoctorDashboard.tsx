import { StateView } from '@dental/ui';
import { Box, Group, Stack, Text } from '@mantine/core';
import { IconCalendarPlus, IconCash } from '@tabler/icons-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/auth-store.ts';
import { useDoctorAppointments, useTodayRange } from '../dashboard.api.ts';
import { ScheduleList } from './widgets/ScheduleList.tsx';
import { StatCard } from './widgets/StatCard.tsx';

// Off-scale literal (parity): KPI grid gap 14px (4px shkalada yo'q: 12/16).
const KPI_GAP = 14;

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

export function DoctorDashboard() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user, activeBranchId, hasPermission } = useAuthStore();
  const range = useTodayRange();
  // Bugungi bemorlar = joriy doktorning (auth user id) bugungi qabullari.
  const appointments = useDoctorAppointments(user?.id, activeBranchId, range);
  const appts = appointments.data ?? [];

  const canAppointment = hasPermission('appointment.view');
  const canCashier = hasPermission('cashier.view');

  return (
    <Stack gap="lg">
      {/* 1a. Header — greeting YO'Q (DS0 topbar sarlavhani olib boradi); amal tugmalari o'ngga surilgan. */}
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
        <>
          {/* 1b. KPI qatori — repeat(4,1fr), gap 14px (off-scale literal, parity).
              Doktorda 1 KPI bor → qolgan ustunlar bo'sh (grid bir xil shell). */}
          <Box style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: KPI_GAP }}>
            <StatCard label={t('dashboard.today_total')} value={appts.length} tone="primary" />
          </Box>

          {/* Doctor: rail yo'q (navbat/recall/faollik OMIT — data-gap, ds12) → bitta ustun jadval. */}
          <ScheduleList
            title={t('dashboard.today_appointments')}
            calendarLabel={t('dashboard.calendar_link', 'Kalendar')}
            onCalendar={() => navigate('/appointments')}
            rows={appts.map((a) => ({
              id: a.id,
              time: fmtTime(a.startTime),
              // Bemor ismi dashboard data'sida yo'q (faqat ID) — placeholder, hook qo'shilmaydi.
              patient: '—',
              duration: fmtDuration(a.startTime, a.endTime),
              status: a.status,
              statusLabel: t(`appointments.status.${a.status}`, a.status),
            }))}
            emptyText={t('dashboard.no_appointments')}
            onRowClick={() => navigate('/appointments')}
          />
        </>
      )}
    </Stack>
  );
}
