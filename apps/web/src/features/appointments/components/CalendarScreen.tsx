import { ApiError } from '@dental/api-client';
import { Button, IconButton, StateView, StatusPill, Tabs, UndoToast } from '@dental/ui';
import { Group, Select } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { ChevronRight } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { fullDayRangeToInstants } from '@/features/schedule/schedule.mappers';
import { formatDayMonth, formatWeekday } from '@/lib/format';
import { useAuthStore } from '@/stores/auth-store.ts';
import {
  useAppointments,
  useBranchAvailability,
  useBranches,
  useCancelAppointment,
  useDoctors,
  useMoveAppointment,
  useServices,
  useUpdateAppointmentStatus,
} from '../appointments.api';
import {
  addDaysToDateKey,
  instantFromDayMinute,
  localDateKey,
  localMinutes,
  mondayOfWeek,
} from '../appointments.mappers';
import type { Appointment, AppointmentStatus, CalendarEvent } from '../appointments.types';
import { AppointmentPanel } from './AppointmentPanel';
import { CalendarGrid } from './CalendarGrid';
import { DayStatsCard } from './DayStatsCard';
import { FreeSlotsCard } from './FreeSlotsCard';
import { StatusLegend } from './StatusLegend';
import { WaitlistCard } from './WaitlistCard';
import { WeekGrid } from './WeekGrid';

/**
 * A11 (CLI-438): "Bugun" Tashkent-kalendar kunga qarab aniqlanadi — brauzer
 * TZ'da emas (aks holda boshqa TZ'dagi brauzerda pill noto'g'ri kunda chiqadi).
 * `dateKey`/`todayKey` ikkalasi ham `localDateKey` (Tashkent) orqali olinadi.
 */
function isToday(dateKey: string): boolean {
  return dateKey === localDateKey(new Date().toISOString());
}

/** Qaytariladigan amal — `UndoToast` tugaguncha PATCH/POST YUBORILMAYDI (strike ham yozilmaydi). */
type PendingAction = {
  /** `${id}:${kind}` — UndoToast remount kaliti. */
  key: string;
  id: string;
  status: AppointmentStatus;
  label: string;
  commit: () => void;
};

export function CalendarScreen() {
  const { t, i18n } = useTranslation();
  const { hasPermission, activeBranchId } = useAuthStore();
  const [view, setView] = useState<'day' | 'week'>('day');
  const [branchId, setBranchId] = useState<string | null>(activeBranchId);
  const [date, setDate] = useState(() => new Date());
  const navigate = useNavigate();
  const open = () => navigate('/appointments/new');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingAction | null>(null);
  const pendingRef = useRef<PendingAction | null>(null);
  /** Kutilayotgan (UndoToast) yoki yuborilgan, hali refetch bo'lmagan holatlar — optimistik ko'rinish. */
  const [overrides, setOverrides] = useState<Record<string, AppointmentStatus>>({});
  /** Sudrab ko'chirish: UndoToast tugaguncha ko'rinish yangi joyda, PATCH hali yuborilmagan. */
  const [moves, setMoves] = useState<
    Record<string, { startTime: string; endTime: string; doctorId: string }>
  >({});

  // A11 (CLI-438): pivot kun — `date` (brauzer-local Date, faqat navigatsiya/display
  // uchun) qaysi Tashkent kalendar kuniga tegishli ekanini aniqlaydi. Fetch range
  // shu kalitdan `fullDayRangeToInstants` (Tashkent +05:00 anchor, schedule.mappers)
  // orqali hisoblanadi — brauzer TZ `setHours(0,0,0,0)` ENDI ishlatilmaydi.
  const pivotKey = useMemo(() => localDateKey(date.toISOString()), [date]);

  const { rangeStart, rangeEnd, dayKeys } = useMemo(() => {
    if (view === 'week') {
      const startKey = mondayOfWeek(pivotKey);
      const weekEndKey = addDaysToDateKey(startKey, 6);
      const keys = Array.from({ length: 7 }, (_, i) => addDaysToDateKey(startKey, i));
      const { startAt, endAt } = fullDayRangeToInstants(startKey, weekEndKey);
      return { rangeStart: new Date(startAt), rangeEnd: new Date(endAt), dayKeys: keys };
    }
    const { startAt, endAt } = fullDayRangeToInstants(pivotKey, pivotKey);
    return { rangeStart: new Date(startAt), rangeEnd: new Date(endAt), dayKeys: [pivotKey] };
  }, [view, pivotKey]);

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
  const { data: servicesData } = useServices({ enabled: hasPermission('service.view') });
  const { data: branchesData } = useBranches();
  const cancelMut = useCancelAppointment();
  const statusMut = useUpdateAppointmentStatus();
  const moveMut = useMoveAppointment();
  const canViewSchedule = hasPermission('schedule.view');
  const { data: availability } = useBranchAvailability({
    branchId,
    date: pivotKey,
    enabled: canViewSchedule && view === 'day',
  });

  const branchOptions = useMemo(
    () => (branchesData ?? []).map((b) => ({ value: b.id, label: b.name })),
    [branchesData],
  );

  // SC-01: bemor ismi yozilish DTO'sidan (backend JOIN) — avval faqat birinchi 100 bemordan olinardi.
  const patientNameMap = useMemo(
    () => new Map((appts ?? []).map((a) => [a.patientId, a.patientName ?? ''])),
    [appts],
  );
  const patientName = (patientId: string) => patientNameMap.get(patientId) || '—';

  const doctorNameMap = useMemo(
    () => new Map((doctors ?? []).map((d) => [d.id, d.name])),
    [doctors],
  );
  const serviceNameMap = useMemo(
    () => new Map((servicesData ?? []).map((s) => [s.id, s.nameUz])),
    [servicesData],
  );

  // Sana sarlavhasi: "12-noyabr · payshanba" — uz'da lug'at (Intl `uz` ma'lumoti yo'q bo'lishi mumkin).
  const titleLabel = useMemo(
    () => `${formatDayMonth(date, i18n.language)} · ${formatWeekday(date, i18n.language)}`,
    [date, i18n.language],
  );

  // Rail kartalari `Appointment[]` kutadi (DS4-2 DayStatsCard/WaitlistCard) —
  // `useAppointments` allaqachon `Appointment[]` qaytaradi.
  const apptList = useMemo<Appointment[]>(
    () =>
      (appts ?? []).map((a) => {
        const status = overrides[a.id];
        const mv = moves[a.id];
        const base = mv ? { ...a, ...mv } : a;
        return status ? { ...base, status } : base;
      }),
    [appts, overrides, moves],
  );

  // Server holati override'ga yetib kelgach (refetch) override tushiriladi.
  useEffect(() => {
    setOverrides((prev) => {
      const keys = Object.keys(prev);
      if (keys.length === 0) return prev;
      const next = { ...prev };
      let changed = false;
      for (const a of appts ?? []) {
        if (next[a.id] === a.status) {
          delete next[a.id];
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [appts]);

  // Ko'chirish serverga yetib kelgach (refetch) vaqtinchalik joy tushiriladi.
  useEffect(() => {
    setMoves((prev) => {
      const keys = Object.keys(prev);
      if (keys.length === 0) return prev;
      const next = { ...prev };
      let changed = false;
      for (const a of appts ?? []) {
        const mv = next[a.id];
        if (mv && new Date(a.startTime).getTime() === new Date(mv.startTime).getTime()) {
          delete next[a.id];
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [appts]);

  // Jadvalsiz ustun (P10): `schedule.view` bor va ma'lumot kelgan bo'lsagina bilinadi.
  const unscheduledDoctorIds = useMemo(() => {
    if (view !== 'day' || availability == null) return null;
    const scheduled = new Set(availability.doctors.map((d) => d.doctorId));
    return new Set((doctors ?? []).filter((d) => !scheduled.has(d.id)).map((d) => d.id));
  }, [view, availability, doctors]);

  // Sub-sarlavha hisoblari (client-side, appts/doctors/branch'dan).
  const apptCount = apptList.length;
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

  const openDetail = (event: CalendarEvent) => setSelectedId(event.appointment.id);
  const closeDetail = () => setSelectedId(null);

  const selected = selectedId == null ? null : (apptList.find((a) => a.id === selectedId) ?? null);

  /** Optimistik holatni olib tashlash (xato yoki qaytarish). */
  const clearOverride = useCallback((id: string) => {
    setMoves((prev) => {
      if (!(id in prev)) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
    setOverrides((prev) => {
      if (!(id in prev)) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }, []);

  /** Kutilayotgan amalni darhol bajaradi (muddat tugadi / yangi amal boshlandi / ekrandan chiqildi). */
  const flushPending = useCallback(() => {
    const p = pendingRef.current;
    if (p == null) return;
    pendingRef.current = null;
    setPending(null);
    p.commit();
  }, []);

  // Sahifadan chiqilsa kutilayotgan amal yo'qolmaydi — bajariladi (UndoToast unmount'da commit qilmaydi).
  useEffect(() => () => flushPending(), [flushPending]);

  const startUndoable = (
    appt: Appointment,
    status: 'no_show' | 'cancelled',
    commit: () => void,
  ) => {
    flushPending(); // oldingi kutilayotgan amal bo'lsa — avval uni yakunla
    setOverrides((prev) => ({ ...prev, [appt.id]: status }));
    const action: PendingAction = {
      key: `${appt.id}:${status}`,
      id: appt.id,
      status,
      label: t(status === 'no_show' ? 'calendar.marked_no_show' : 'calendar.marked_cancelled', {
        name: patientName(appt.patientId),
      }),
      commit,
    };
    pendingRef.current = action;
    setPending(action);
  };

  const markNoShow = (appt: Appointment) =>
    startUndoable(appt, 'no_show', () =>
      statusMut.mutate(
        { id: appt.id, status: 'no_show' },
        { onError: () => clearOverride(appt.id) },
      ),
    );

  const markCancelled = (appt: Appointment) =>
    startUndoable(appt, 'cancelled', () =>
      cancelMut.mutate({ id: appt.id }, { onError: () => clearOverride(appt.id) }),
    );

  /** 409 va boshqa xatolar → aniq xabar (joyiga qaytadi). */
  const moveErrorMessage = (err: unknown): string => {
    if (err instanceof ApiError) {
      if (err.code === 'conflict.doctor_busy') return t('appointments.conflict');
      if (err.code === 'conflict.patient_busy') return t('appointments.patient_conflict');
      if (err.code === 'conflict.slot_busy') return t('appointments.slot_busy');
      if (err.code === 'schedule.outside_working_hours')
        return t('appointments.outside_working_hours');
    }
    return t('appointments.move_failed');
  };

  /**
   * Sudrab (yoki panel orqali) ko'chirish: joy darhol yangilanadi, `UndoToast` tugagach
   * PATCH ketadi. Server 409 qaytarsa yozilish joyiga qaytadi va xabar chiqadi.
   */
  const moveAppointment = (appt: Appointment, doctorId: string, startMinute: number) => {
    const durationMs = new Date(appt.endTime).getTime() - new Date(appt.startTime).getTime();
    const startTime = instantFromDayMinute(pivotKey, startMinute);
    const endTime = new Date(new Date(startTime).getTime() + durationMs).toISOString();
    const sameSpot =
      doctorId === appt.doctorId &&
      localMinutes(appt.startTime) === startMinute &&
      localDateKey(appt.startTime) === pivotKey;
    if (sameSpot) return;
    flushPending();
    setMoves((prev) => ({ ...prev, [appt.id]: { startTime, endTime, doctorId } }));
    const hh = `${String(Math.floor(startMinute / 60)).padStart(2, '0')}:${String(startMinute % 60).padStart(2, '0')}`;
    const action: PendingAction = {
      key: `${appt.id}:move:${startTime}:${doctorId}`,
      id: appt.id,
      status: appt.status,
      label: t('appointments.moved', {
        name: patientName(appt.patientId),
        doctor: doctorNameMap.get(doctorId) ?? '',
        time: hh,
      }),
      commit: () =>
        moveMut.mutate(
          {
            id: appt.id,
            startTime,
            endTime,
            ...(doctorId !== appt.doctorId ? { doctorId } : {}),
          },
          {
            onError: (err) => {
              clearOverride(appt.id);
              notifications.show({ color: 'red', message: moveErrorMessage(err) });
            },
          },
        ),
    };
    pendingRef.current = action;
    setPending(action);
  };

  const undoPending = () => {
    const p = pendingRef.current;
    pendingRef.current = null;
    setPending(null);
    // Hech narsa yuborilmagan — faqat optimistik ko'rinish qaytariladi.
    if (p) clearOverride(p.id);
  };

  const changeStatus = (appt: Appointment, to: AppointmentStatus) =>
    statusMut.mutate({ id: appt.id, status: to });

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
            {isToday(pivotKey) && (
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
              appointments={apptList}
              doctors={doctors ?? []}
              patientName={patientName}
              onSlotClick={openDetail}
              selectedId={selectedId}
              unscheduledDoctorIds={unscheduledDoctorIds}
              canMove={hasPermission('appointment.edit')}
              onMove={moveAppointment}
            />
          ) : (
            <WeekGrid
              appointments={apptList}
              dayKeys={dayKeys}
              patientName={patientName}
              onSlotClick={openDetail}
              selectedId={selectedId}
            />
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {selected != null && (
            <AppointmentPanel
              appointment={selected}
              patientName={patientName(selected.patientId)}
              doctorName={doctorNameMap.get(selected.doctorId) ?? '—'}
              serviceNames={(selected.serviceIds ?? []).map((id) => serviceNameMap.get(id) ?? id)}
              canEdit={hasPermission('appointment.edit')}
              canCancel={hasPermission('appointment.cancel')}
              canOpenPatient={hasPermission('patient.view')}
              onStatus={(to) => changeStatus(selected, to)}
              onNoShow={() => markNoShow(selected)}
              onCancel={() => markCancelled(selected)}
              onClose={closeDetail}
              doctors={doctors ?? []}
              onMove={(doctorId, hhmm) => {
                const [h, m] = hhmm.split(':').map(Number);
                moveAppointment(selected, doctorId, (h ?? 0) * 60 + (m ?? 0));
              }}
            />
          )}
          <DayStatsCard
            appts={apptList}
            isToday={isToday(pivotKey)}
            dayLabel={formatDayMonth(date, i18n.language)}
          />
          {/* DS12: jonli "Bo'sh slot" kartasi — faqat `schedule.view` ruxsati
              bo'lganda render (cheklangan rollarda 403 oldini olish, CLI-153). */}
          {hasPermission('schedule.view') && (
            <FreeSlotsCard branchId={branchId} date={pivotKey} enabled />
          )}
          <WaitlistCard appts={apptList} />
        </div>
      </div>

      {pending != null && (
        <UndoToast
          key={pending.key}
          floating
          undoLabel={t('calendar.undo')}
          secondsSuffix={t('calendar.seconds')}
          onUndo={undoPending}
          onCommit={flushPending}
        >
          {pending.label}
        </UndoToast>
      )}
    </div>
  );
}
