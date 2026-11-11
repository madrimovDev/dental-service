import { StateView } from '@dental/ui';
import { Box, Group, Stack, Text } from '@mantine/core';
import { IconCalendarPlus, IconCash, IconSearch } from '@tabler/icons-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { useAllLabOrders } from '@/features/clinical/clinical.api.ts';
import { useCallOwnTicket } from '@/features/queue/queue.api.ts';
import { useAuthStore } from '@/stores/auth-store.ts';
import { useDoctorAppointments, useTodayRange } from '../dashboard.api.ts';
import { useDoctorPending } from '../doctor.api.ts';
import { usePatientNames } from '../reception.api.ts';
import { buildPendingRows, DoctorPendingPanel } from './widgets/DoctorPendingPanel.tsx';
import { LabPanel } from './widgets/LabPanel.tsx';
import { NextPatientCard } from './widgets/NextPatientCard.tsx';
import { ScheduleList } from './widgets/ScheduleList.tsx';

const fmtDay = (iso: string) =>
  new Date(iso).toLocaleDateString('uz-UZ', { day: '2-digit', month: '2-digit' });

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
  const canPending = canAppointment && hasPermission('medical_record.view');
  const pending = useDoctorPending(canPending);
  const names = usePatientNames(appts.map((a) => a.patientId));
  const canCashier = hasPermission('cashier.view');
  const callOwn = useCallOwnTicket();
  const canLab = hasPermission('lab_order.view');
  const labOrders = useAllLabOrders();
  const labRows = canLab
    ? (labOrders.data?.data ?? [])
        .filter(
          (l) => l.doctorId === user?.id && ['sent', 'in_progress', 'ready'].includes(l.status),
        )
        .slice(0, 4)
    : [];
  const left = appts.filter((a) => a.status === 'scheduled' || a.status === 'confirmed').length;

  return (
    <Stack gap="lg">
      {/* 1a. Header — greeting YO'Q (DS0 topbar sarlavhani olib boradi); amal tugmalari o'ngga surilgan. */}
      <Group gap="xs" justify="space-between" wrap="wrap">
        <Text size="sm" c="dimmed">
          {t('doctorDay.subtitle', { total: appts.length, left })}
        </Text>
        <Group gap="xs">
          <HeaderAction
            to="/patients"
            icon={<IconSearch size={17} />}
            label={t('doctorDay.search_patient')}
          />
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
      </Group>

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
          <Box style={{ display: 'flex', flexWrap: 'wrap', gap: 20, alignItems: 'flex-start' }}>
            <Stack gap="md" style={{ flex: '999 1 600px', minWidth: 0 }}>
              {pending.data?.nextPatient && (
                <NextPatientCard
                  next={pending.data.nextPatient}
                  canCall={hasPermission('queue.view')}
                  calling={callOwn.isPending}
                  onCall={() => {
                    const id = pending.data?.nextPatient?.queueTicketId;
                    if (id) callOwn.mutate(id, { onSuccess: () => void pending.refetch() });
                  }}
                />
              )}
              <ScheduleList
                title={t('dashboard.today_appointments')}
                calendarLabel={t('dashboard.calendar_link', 'Kalendar')}
                onCalendar={() => navigate('/appointments')}
                rows={appts.map((a) => ({
                  id: a.id,
                  time: fmtTime(a.startTime),
                  patient: names.get(a.patientId) ?? '—',
                  duration: fmtDuration(a.startTime, a.endTime),
                  status: a.status,
                  statusLabel: t(`appointments.status.${a.status}`, a.status),
                }))}
                emptyText={t('dashboard.no_appointments')}
                onRowClick={() => navigate('/appointments')}
              />
            </Stack>

            <Stack gap="md" style={{ flex: '1 1 340px', minWidth: 300 }}>
              {canPending && pending.data && (
                <DoctorPendingPanel
                  title={t('doctorDay.pending_title', 'Mendan kutilmoqda')}
                  emptyText={t('doctorDay.pending_empty', 'Hammasi bajarilgan')}
                  rows={buildPendingRows(
                    pending.data,
                    (key, n) => t(`doctorDay.pending_${key}`, { count: n }),
                    (days) => t('doctorDay.pending_plans_oldest', { count: days ?? 0 }),
                  )}
                />
              )}
              {canLab && (
                <LabPanel
                  title={t('doctorDay.lab_title')}
                  newLabel={t('doctorDay.lab_new')}
                  emptyText={t('doctorDay.lab_empty')}
                  rows={labRows.map((l) => ({
                    id: l.id,
                    what: `${t(`doctorDay.lab_type.${l.orderType}`, l.orderType)} · ${l.labName}`,
                    meta: l.expectedDate ? fmtDay(l.expectedDate) : '',
                    status: l.status,
                    statusLabel: t(`doctorDay.lab_status.${l.status}`, l.status),
                  }))}
                />
              )}
            </Stack>
          </Box>
        </>
      )}
    </Stack>
  );
}
