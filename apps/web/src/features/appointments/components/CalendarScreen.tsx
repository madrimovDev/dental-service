import { Button, IconButton, Mono, StateView, StatusPill, Tabs } from '@dental/ui';
import { Group, Modal, Select, Stack, Text, Textarea } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { ChevronRight } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { usePatients } from '@/features/patients';
import { useAuthStore } from '@/stores/auth-store.ts';
import {
  useAppointments,
  useBranches,
  useCancelAppointment,
  useDoctors,
  useServices,
} from '../appointments.api';
import { localDateKey, localTimeLabel } from '../appointments.mappers';
import type { AppointmentStatus, CalendarEvent } from '../appointments.types';
import { CalendarGrid } from './CalendarGrid';
import { DayStatsCard } from './DayStatsCard';
import { NewAppointmentWizard } from './NewAppointmentWizard';
import { StatusLegend } from './StatusLegend';
import { WaitlistCard } from './WaitlistCard';
import { WeekGrid } from './WeekGrid';

/** Haftaboshi (dushanba) — local. */
function startOfWeek(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay();
  const diff = (day + 6) % 7; // dushanba = 0
  d.setDate(d.getDate() - diff);
  return d;
}

/** Bugun (local kun)mi — sana sarlavhasi "Bugun" pill uchun. */
function isToday(date: Date): boolean {
  const now = new Date();
  return (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  );
}

/** AppointmentStatus → R0 StatusPill semantik variant. */
const statusVariant: Record<AppointmentStatus, StatusPillVariant> = {
  scheduled: 'accent',
  confirmed: 'info',
  in_progress: 'warning',
  completed: 'success',
  no_show: 'danger',
  cancelled: 'neutral',
};

type StatusPillVariant = 'neutral' | 'success' | 'warning' | 'danger' | 'info' | 'accent';

export function CalendarScreen() {
  const { t, i18n } = useTranslation();
  const { hasPermission, activeBranchId } = useAuthStore();
  const [view, setView] = useState<'day' | 'week'>('day');
  const [branchId, setBranchId] = useState<string | null>(activeBranchId);
  const [date, setDate] = useState(() => new Date());
  const [opened, { open, close }] = useDisclosure(false);
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [cancelReason, setCancelReason] = useState('');

  const { rangeStart, rangeEnd, dayKeys } = useMemo(() => {
    if (view === 'week') {
      const start = startOfWeek(date);
      const end = new Date(start);
      end.setDate(end.getDate() + 7);
      const keys = Array.from({ length: 7 }, (_, i) => {
        const d = new Date(start);
        d.setDate(d.getDate() + i);
        return localDateKey(d.toISOString());
      });
      return { rangeStart: start, rangeEnd: end, dayKeys: keys };
    }
    const start = new Date(date);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    return { rangeStart: start, rangeEnd: end, dayKeys: [localDateKey(start.toISOString())] };
  }, [view, date]);

  const {
    data: appts,
    isLoading: apptsLoading,
    isError: apptsError,
    refetch: refetchAppts,
  } = useAppointments({
    branchId: branchId ?? undefined,
    from: rangeStart.toISOString(),
    to: rangeEnd.toISOString(),
  });
  const { data: doctors } = useDoctors();
  const { data: patientsData } = usePatients({ page: 1, pageSize: 100 });
  const { data: servicesData } = useServices();
  const { data: branchesData } = useBranches();
  const cancelMut = useCancelAppointment();

  const branchOptions = useMemo(
    () => (branchesData ?? []).map((b) => ({ value: b.id, label: b.name })),
    [branchesData],
  );

  const patientNameMap = useMemo(() => {
    return new Map((patientsData?.items ?? []).map((p) => [p.id, p.fullName]));
  }, [patientsData]);
  const patientName = (patientId: string) => patientNameMap.get(patientId) ?? '—';

  const doctorNameMap = useMemo(
    () => new Map((doctors ?? []).map((d) => [d.id, d.name])),
    [doctors],
  );
  const serviceNameMap = useMemo(
    () => new Map((servicesData ?? []).map((s) => [s.id, s.nameUz])),
    [servicesData],
  );

  // Sana sarlavhasi: "DD-oy · hafta-kuni" — Intl orqali (yangi i18n kalit yo'q).
  const titleLabel = useMemo(() => {
    const dayMonth = new Intl.DateTimeFormat(i18n.language, {
      day: 'numeric',
      month: 'long',
    }).format(date);
    const weekday = new Intl.DateTimeFormat(i18n.language, { weekday: 'long' }).format(date);
    return `${dayMonth} · ${weekday}`;
  }, [date, i18n.language]);

  // Rail kartalari `Appointment[]` kutadi (DS4-2 DayStatsCard/WaitlistCard) —
  // `useAppointments` allaqachon `Appointment[]` qaytaradi.
  const apptList = useMemo(() => appts ?? [], [appts]);

  // Sub-sarlavha hisoblari (client-side, appts/doctors/branch'dan).
  const apptCount = appts?.length ?? 0;
  const activeDoctorCount = useMemo(
    () => new Set(apptList.map((a) => a.doctorId)).size,
    [apptList],
  );
  const branchLabel = useMemo(() => {
    if (branchId == null) return null;
    return branchOptions.find((b) => b.value === branchId)?.label ?? null;
  }, [branchId, branchOptions]);

  const shift = (delta: number) => {
    setDate((prev) => {
      const next = new Date(prev);
      next.setDate(next.getDate() + delta * (view === 'week' ? 7 : 1));
      return next;
    });
  };

  const openDetail = (event: CalendarEvent) => {
    setCancelReason('');
    setSelectedEvent(event);
  };
  const closeDetail = () => setSelectedEvent(null);

  const appt = selectedEvent?.appointment;
  const canCancel =
    appt != null &&
    hasPermission('appointment.cancel') &&
    appt.status !== 'cancelled' &&
    appt.status !== 'completed';

  const confirmCancel = () => {
    if (appt == null) return;
    cancelMut.mutate(
      { id: appt.id, reason: cancelReason.trim() || undefined },
      { onSuccess: closeDetail },
    );
  };

  return (
    <div>
      <Group justify="flex-end" gap="xs" mb="md">
        {hasPermission('appointment.create') && (
          <Button variant="primary" onClick={open}>
            {t('appointments.create')}
          </Button>
        )}
      </Group>

      {/* Header row: chevron-nav + sana sarlavha + Bugun pill + Day/Week toggle + branch filter */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 14,
          marginTop: 'var(--space-4)',
          flexWrap: 'wrap',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <IconButton bordered label={t('common.back')} onClick={() => shift(-1)}>
            <ChevronRight style={{ transform: 'rotate(180deg)' }} />
          </IconButton>
          <IconButton bordered label={t('common.next')} onClick={() => shift(1)}>
            <ChevronRight />
          </IconButton>
          <Button variant="default" onClick={() => setDate(new Date())}>
            {t('appointments.today')}
          </Button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span
              style={{
                fontSize: 17,
                fontWeight: 700,
                color: 'var(--ink)',
                fontFamily: 'var(--font-sans)',
              }}
            >
              {titleLabel}
            </span>
            {isToday(date) && (
              // Statik joriy-kun markeri — LOCKED StatusPill `accent` variant
              // (--primary-soft fon, kontrast-validatsiyalangan matn light+dark, DS0/CLI-80).
              <StatusPill status="accent" dot={false}>
                {t('appointments.today')}
              </StatusPill>
            )}
          </div>
          <span style={{ fontSize: 12, color: 'var(--ink-3)', fontFamily: 'var(--font-sans)' }}>
            {t('appointments.summary_appts', { count: apptCount })} ·{' '}
            {t('appointments.summary_doctors', { count: activeDoctorCount })}
            {branchLabel != null ? ` · ${branchLabel}` : ''}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginLeft: 'auto' }}>
          <Tabs
            value={view}
            onChange={(v) => setView(v as 'day' | 'week')}
            variant="pill"
            items={[
              { id: 'day', label: t('appointments.view_day') },
              { id: 'week', label: t('appointments.view_week') },
            ]}
          />
          <Select
            placeholder={t('appointments.filter_branch')}
            aria-label={t('appointments.filter_branch')}
            clearable
            data={branchOptions}
            value={branchId}
            onChange={setBranchId}
          />
        </div>
      </div>

      {/* Status legend strip */}
      <div style={{ marginTop: 14 }}>
        <StatusLegend />
      </div>

      {/* Body: kalendar (left) + 296px rail (right) */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1fr) 296px',
          gap: 16,
          marginTop: 16,
        }}
      >
        <div style={{ minWidth: 0 }}>
          {apptsLoading ? (
            <StateView status="loading" skeleton="cards" />
          ) : apptsError ? (
            <StateView
              status="error"
              title={t('states.error_title')}
              retryLabel={t('states.retry')}
              onRetry={() => refetchAppts()}
            />
          ) : view === 'day' ? (
            <CalendarGrid
              appointments={appts ?? []}
              doctors={doctors ?? []}
              patientName={patientName}
              onSlotClick={openDetail}
            />
          ) : (
            <WeekGrid
              appointments={appts ?? []}
              dayKeys={dayKeys}
              patientName={patientName}
              onSlotClick={openDetail}
            />
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <DayStatsCard appts={apptList} />
          <WaitlistCard appts={apptList} />
        </div>
      </div>

      <Modal opened={opened} onClose={close} title={t('appointments.create')} size="lg">
        <NewAppointmentWizard onClose={close} />
      </Modal>
      <Modal opened={appt != null} onClose={closeDetail} title={t('appointments.title')} size="md">
        {appt != null && (
          <Stack gap="sm">
            <Mono>
              {localTimeLabel(appt.startTime)} — {localTimeLabel(appt.endTime)}
            </Mono>
            <Text size="sm">
              {t('appointments.patient')}: {patientName(appt.patientId)}
            </Text>
            <Text size="sm">
              {t('appointments.doctor')}: {doctorNameMap.get(appt.doctorId) ?? '—'}
            </Text>
            <Text size="sm">
              {t('appointments.services')}:{' '}
              {(appt.serviceIds ?? []).map((id) => serviceNameMap.get(id) ?? id).join(', ') || '—'}
            </Text>
            <div>
              <StatusPill status={statusVariant[appt.status]}>
                {t(`appointments.status.${appt.status}`)}
              </StatusPill>
            </div>
            {canCancel && (
              <Stack gap="xs" mt="sm">
                <Textarea
                  label={t('appointments.cancel_reason')}
                  rows={2}
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.currentTarget.value)}
                />
                <Button variant="danger" disabled={cancelMut.isPending} onClick={confirmCancel}>
                  {t('common.cancel')}
                </Button>
              </Stack>
            )}
          </Stack>
        )}
      </Modal>
    </div>
  );
}
