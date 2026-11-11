import { StateView } from '@dental/ui';
import { Box, Group, Select, Stack, Text, TextInput } from '@mantine/core';
import { useDebouncedValue } from '@mantine/hooks';
import { IconCalendarPlus, IconSearch } from '@tabler/icons-react';
import { type ReactNode, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAppointments } from '@/features/appointments/appointments.api.ts';
import { useQueueToday } from '@/features/queue/queue.api.ts';
import { useAuthStore } from '@/stores/auth-store.ts';
import { useTodayRange } from '../dashboard.api.ts';
import {
  useDoctorOptions,
  usePatientNames,
  usePatientSearch,
  useReceptionAttention,
} from '../reception.api.ts';
import {
  type AttentionItem,
  limitAttention,
  matchesStatusFilter,
  nextAction,
  parseStatusFilter,
  STATUS_FILTERS,
  waitMinutes,
} from '../reception.logic.ts';
import { AttentionPanel } from './widgets/AttentionPanel.tsx';
import { QueueCard } from './widgets/QueueCard.tsx';
import { StatCard } from './widgets/StatCard.tsx';
import { TodayTable } from './widgets/TodayTable.tsx';

// Off-scale literal (parity): KPI grid gap 14px (4px shkalada yo'q: 12/16).
const KPI_GAP = 14;

const fmtTime = (iso: string) =>
  new Date(iso).toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit' });

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

/** Qidiruv: kamida 2 belgi, natija dropdown (A.1 endpoint — kirill/lotin, istalgan telefon). */
function PatientSearch() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [debounced] = useDebouncedValue(q, 250);
  const search = usePatientSearch(debounced);
  const items = search.data?.items ?? [];
  const open = debounced.trim().length >= 2;
  return (
    <Box style={{ position: 'relative', width: 380, maxWidth: '100%' }}>
      <TextInput
        value={q}
        onChange={(e) => setQ(e.currentTarget.value)}
        placeholder={t('receptionToday.search_placeholder')}
        leftSection={<IconSearch size={16} />}
        aria-label={t('receptionToday.search_placeholder')}
      />
      {open && (
        <Box
          role="listbox"
          style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            left: 0,
            right: 0,
            zIndex: 20,
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 10,
            boxShadow: 'var(--shadow-md)',
            padding: 6,
          }}
        >
          {items.length === 0 ? (
            <Text size="xs" c="var(--ink-3)" p="xs">
              {t('receptionToday.search_empty')}
            </Text>
          ) : (
            items.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => navigate(`/patients/${p.id}`)}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: 12,
                  width: '100%',
                  padding: '8px 10px',
                  background: 'none',
                  border: 'none',
                  borderRadius: 8,
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
              >
                <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--ink)' }}>
                  {p.fullName}
                </span>
                <span
                  style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--ink-3)' }}
                >
                  {p.phone ?? ''}
                </span>
              </button>
            ))
          )}
          <Text size="xs" c="var(--ink-3)" p="xs">
            {t('receptionToday.search_hint')}
          </Text>
        </Box>
      )}
    </Box>
  );
}

export function ReceptionistDashboard() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const { activeBranchId, hasPermission } = useAuthStore();
  const range = useTodayRange();
  const appointments = useAppointments({ branchId: activeBranchId ?? undefined, ...range });
  const queue = useQueueToday(activeBranchId);
  const doctors = useDoctorOptions();
  const attention = useReceptionAttention(activeBranchId);

  const doctorFilter = params.get('doctor') ?? 'all';
  const statusFilter = parseStatusFilter(params.get('status'));
  const setFilter = (key: 'doctor' | 'status', value: string | null) => {
    const next = new URLSearchParams(params);
    if (!value || value === 'all') next.delete(key);
    else next.set(key, value);
    setParams(next, { replace: true });
  };

  const appts = appointments.data ?? [];
  const queueItems = queue.data ?? [];
  const names = usePatientNames([
    ...appts.map((a) => a.patientId),
    ...queueItems.map((q) => q.patientId),
  ]);
  const noShow = appts.filter((a) => a.status === 'no_show').length;
  const pending = appts.filter((a) => matchesStatusFilter(a.status, 'pending')).length;
  const waiting = queueItems.filter((q) => q.status === 'waiting').length;
  const now = Date.now();
  const longestWait = queueItems
    .filter((q) => q.status === 'waiting')
    .map((q) => waitMinutes(q.createdAt, now))
    .reduce<number | undefined>((m, w) => (w === undefined ? m : Math.max(m ?? 0, w)), undefined);

  const doctorName = (id: string | null | undefined) =>
    doctors.data?.find((d) => d.id === id)?.name;
  const patientName = (id: string | null | undefined) =>
    (id ? names.get(id) : undefined) ?? t('receptionToday.patient_unknown');

  const canAppointment = hasPermission('appointment.view');
  const canCashier = hasPermission('cashier.view');
  const canQueue = hasPermission('queue.view');
  const canCreateQueue = hasPermission('queue.create');

  const actionFor = (status: string) => {
    switch (nextAction(status)) {
      case 'to_queue':
        return canQueue ? { label: t('receptionToday.action_to_queue'), to: '/queue' } : undefined;
      case 'to_cashier':
        return canCashier
          ? { label: t('receptionToday.action_to_cashier'), to: '/cashier' }
          : undefined;
      case 'rebook':
        return canAppointment
          ? { label: t('receptionToday.action_rebook'), to: '/appointments' }
          : undefined;
      default:
        return undefined;
    }
  };

  const rows = appts
    .filter((a) => matchesStatusFilter(a.status, statusFilter))
    .filter((a) => doctorFilter === 'all' || a.doctorId === doctorFilter)
    .map((a) => ({
      id: a.id,
      time: fmtTime(a.startTime),
      patient: patientName(a.patientId),
      meta: doctorName(a.doctorId) ?? '—',
      status: a.status,
      statusLabel: t(`appointments.status.${a.status}`, a.status),
      action: actionFor(a.status),
    }));

  const attentionItems: AttentionItem[] = [
    ...attention.doctorsWithoutSchedule.map(
      (d): AttentionItem => ({
        key: `sched-${d.id}`,
        tier: 2,
        title: t('receptionToday.attention_no_schedule_title', { name: d.name }),
        text: t('receptionToday.attention_no_schedule_text'),
        actionLabel: t('receptionToday.attention_open_schedule'),
        to: '/schedule',
      }),
    ),
    ...(attention.overdueLabs > 0
      ? [
          {
            key: 'lab',
            tier: 2 as const,
            title: t('receptionToday.attention_lab_title'),
            text: t('receptionToday.attention_lab_text', { n: attention.overdueLabs }),
            actionLabel: t('receptionToday.attention_open_lab'),
            to: '/lab',
          },
        ]
      : []),
    ...(attention.recallOverdue > 0
      ? [
          {
            key: 'recall',
            tier: 3 as const,
            title: t('receptionToday.attention_recall_title', { n: attention.recallOverdue }),
            text: t('receptionToday.attention_recall_text'),
            actionLabel: t('receptionToday.attention_open_recall'),
            to: '/recalls',
          },
        ]
      : []),
  ];
  const limited = limitAttention(attentionItems);

  return (
    <Stack gap="lg">
      {/* Header: qidiruv + amallar (greeting YO'Q — topbar sahifa sarlavhasi). */}
      <Group gap="xs" justify="space-between" align="flex-start">
        {hasPermission('patient.view') ? <PatientSearch /> : <span />}
        <Group gap="xs">
          {canQueue && canCreateQueue && (
            <HeaderAction to="/queue" icon={null} label={t('receptionToday.add_to_queue')} />
          )}
          {canAppointment && (
            <HeaderAction
              to="/appointments"
              icon={<IconCalendarPlus size={17} />}
              label={t('dashboard.new_appointment', 'Yangi yozilish')}
            />
          )}
          {canCashier && (
            <HeaderAction to="/cashier" icon={null} label={t('dashboard.open_cashier', 'Kassa')} />
          )}
        </Group>
      </Group>

      {/* Filtrlar URL search params'da — navigatsiyadan keyin saqlanadi. */}
      <Group gap="sm" align="center">
        <Text size="sm" c="var(--ink-3)">
          {t('receptionToday.filter_label')}
        </Text>
        <Select
          size="xs"
          w={190}
          allowDeselect={false}
          aria-label={t('receptionToday.filter_doctor')}
          value={doctorFilter}
          onChange={(v) => setFilter('doctor', v)}
          data={[
            { value: 'all', label: t('receptionToday.filter_doctor_all') },
            ...(doctors.data ?? []).map((d) => ({ value: d.id, label: d.name })),
          ]}
        />
        <Select
          size="xs"
          w={190}
          allowDeselect={false}
          aria-label={t('receptionToday.filter_status')}
          value={statusFilter}
          onChange={(v) => setFilter('status', v)}
          data={STATUS_FILTERS.map((f) => ({
            value: f,
            label: t(`receptionToday.filter_status_${f}`),
          }))}
        />
        <Text size="xs" c="var(--ink-3)">
          {t('receptionToday.filters_saved_hint')}
        </Text>
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
          <Box style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: KPI_GAP }}>
            <StatCard
              label={t('dashboard.today_total')}
              value={appts.length}
              tone="primary"
              hint={t('receptionToday.kpi_pending', { n: pending })}
            />
            <StatCard label={t('dashboard.no_show')} value={noShow} tone="warning" />
            <StatCard
              label={t('dashboard.queue')}
              value={queueItems.length}
              tone="info"
              hint={
                longestWait !== undefined
                  ? t('receptionToday.kpi_longest_wait', { n: longestWait })
                  : undefined
              }
            />
            <StatCard
              label={t('receptionToday.kpi_telegram')}
              value="—"
              tone="violet"
              hint={t('receptionToday.kpi_telegram_sub')}
            />
          </Box>

          <Box
            style={{
              display: 'grid',
              gridTemplateColumns: 'minmax(0, 1fr) 360px',
              gap: 16,
              alignItems: 'start',
            }}
          >
            <Stack gap="md" style={{ minWidth: 0 }}>
              {/* Telegram so'rovlari — booking_requests UI-4 (T2) da; hozir bo'sh holat. */}
              <Box
                style={{
                  background: 'var(--surface)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-card)',
                  padding: 18,
                }}
              >
                <Text fw={700} c="var(--ink)">
                  {t('receptionToday.tg_title')}
                </Text>
                <Text size="sm" c="var(--ink-3)" mt={4}>
                  {t('receptionToday.tg_empty')}
                </Text>
              </Box>
              <TodayTable
                title={t('receptionToday.next_title')}
                calendarLabel={t('receptionToday.calendar_link')}
                onCalendar={() => navigate('/appointments')}
                columns={{
                  time: t('receptionToday.col_time'),
                  patient: t('receptionToday.col_patient'),
                  meta: t('receptionToday.col_doctor'),
                  status: t('receptionToday.col_status'),
                  action: t('receptionToday.col_action'),
                }}
                rows={rows}
                emptyText={t('dashboard.no_appointments')}
              />
            </Stack>

            <Stack gap="md">
              <AttentionPanel
                title={t('receptionToday.attention_title')}
                items={limited.shown}
                more={limited.more}
                moreLabel={t('receptionToday.attention_more', { n: limited.more })}
                emptyText={t('receptionToday.attention_empty')}
                onOpen={(to) => navigate(to)}
              />
              <QueueCard
                title={t('receptionToday.queue_title')}
                waitingLabel={
                  waiting > 0
                    ? t('dashboard.queue_waiting', {
                        n: waiting,
                        defaultValue: `${waiting} kutmoqda`,
                      })
                    : undefined
                }
                rows={queueItems.map((q) => {
                  const w = waitMinutes(q.createdAt, now);
                  return {
                    id: q.id,
                    number: `#${q.queueNumber}`,
                    patient: patientName(q.patientId),
                    meta:
                      [
                        doctorName(q.doctorId),
                        w !== undefined && q.status === 'waiting'
                          ? t('receptionToday.wait_min', { n: w })
                          : undefined,
                      ]
                        .filter(Boolean)
                        .join(' · ') || undefined,
                    status: q.status,
                    statusLabel: t(`queue.${q.status}`, q.status),
                  };
                })}
                emptyText={t('dashboard.no_queue')}
              />
            </Stack>
          </Box>
        </>
      )}
    </Stack>
  );
}
