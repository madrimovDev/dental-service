import { Button, IconButton, StatusPill } from '@dental/ui';
import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { formatDayMonth } from '@/lib/format';
import { localTimeLabel } from '../appointments.mappers';
import type { Appointment, AppointmentStatus } from '../appointments.types';
import classes from './AppointmentPanel.module.css';

/** Yozilish holati → yagona holat lug'ati (UI-0). */
const PILL: Record<AppointmentStatus, 'planned' | 'confirmed' | 'active' | 'done' | 'failed'> = {
  scheduled: 'planned',
  confirmed: 'confirmed',
  in_progress: 'active',
  completed: 'done',
  no_show: 'failed',
  cancelled: 'done',
};

/** Bosh yo'l: har holatning bitta «keyingi qadami» (state-machine: appointments.transitions). */
const NEXT: Partial<Record<AppointmentStatus, { to: AppointmentStatus; labelKey: string }>> = {
  scheduled: { to: 'confirmed', labelKey: 'calendar.action_confirm' },
  confirmed: { to: 'in_progress', labelKey: 'calendar.action_start' },
  in_progress: { to: 'completed', labelKey: 'calendar.action_complete' },
  no_show: { to: 'scheduled', labelKey: 'calendar.action_reopen' },
  cancelled: { to: 'scheduled', labelKey: 'calendar.action_reopen' },
};

const PATH: AppointmentStatus[] = ['scheduled', 'confirmed', 'in_progress', 'completed'];
const HISTORY_KEY: Record<AppointmentStatus, string> = {
  scheduled: 'calendar.history_booked',
  confirmed: 'calendar.history_confirmed',
  in_progress: 'calendar.history_in_progress',
  completed: 'calendar.history_completed',
  no_show: 'calendar.history_no_show',
  cancelled: 'calendar.history_cancelled',
};

/** `no_show` / `cancelled` faqat faol (hali yakunlanmagan) yozilishda mumkin. */
export const CAN_ABORT: ReadonlySet<AppointmentStatus> = new Set([
  'scheduled',
  'confirmed',
  'in_progress',
]);

export function AppointmentPanel({
  appointment,
  patientName,
  doctorName,
  serviceNames,
  canEdit,
  canCancel,
  canOpenPatient,
  onStatus,
  onNoShow,
  onCancel,
  onClose,
}: {
  appointment: Appointment;
  patientName: string;
  doctorName: string;
  serviceNames: string[];
  canEdit: boolean;
  canCancel: boolean;
  canOpenPatient: boolean;
  /** Qaytarib bo'lmaydigan emas — to'g'ridan PATCH. */
  onStatus: (to: AppointmentStatus) => void;
  /** Qaytariladigan amal — chaqiruvchi `UndoToast` bilan kechiktiradi. */
  onNoShow: () => void;
  onCancel: () => void;
  onClose: () => void;
}) {
  const { t, i18n } = useTranslation();
  const status = appointment.status;
  const next = NEXT[status];
  const abortable = CAN_ABORT.has(status);
  const fmt = (iso: string) => {
    const d = new Date(iso);
    const time = new Intl.DateTimeFormat('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone: 'Asia/Tashkent',
    }).format(d);
    return `${formatDayMonth(d, i18n.language, { timeZone: 'Asia/Tashkent' })}, ${time}`;
  };

  // Holat tarixi: mavjud endpoint yo'q (audit — `audit.view`, registratorda yo'q) →
  // `createdAt`/`updatedAt` + joriy holatdan yo'l quriladi (o'tgan ✓ · joriy ● · kelgusi ○).
  const reached = PATH.indexOf(status);
  const aborted = status === 'no_show' || status === 'cancelled';
  const steps = aborted
    ? [
        { s: 'scheduled' as const, state: 'done' as const },
        { s: status, state: 'bad' as const },
      ]
    : PATH.map((s, i) => ({
        s,
        state:
          i < reached
            ? ('done' as const)
            : i === reached
              ? ('current' as const)
              : ('todo' as const),
      }));

  return (
    <section
      className={classes.root}
      aria-labelledby="appt-panel-h"
      data-testid="appointment-panel"
    >
      <div className={classes.head}>
        <div className={classes.headText}>
          <span className={classes.eyebrow}>{t('calendar.panel_title')}</span>
          <h2 id="appt-panel-h" className={classes.patient}>
            {patientName}
          </h2>
          <span className={classes.meta}>
            <span className={classes.mono}>
              {localTimeLabel(appointment.startTime)}–{localTimeLabel(appointment.endTime)}
            </span>{' '}
            · {doctorName}
            {serviceNames.length > 0 ? ` · ${serviceNames.join(', ')}` : ''}
          </span>
        </div>
        <IconButton label={t('calendar.panel_close')} onClick={onClose}>
          <X />
        </IconButton>
      </div>

      <div>
        <StatusPill status={PILL[status]}>{t(`appointments.status.${status}`)}</StatusPill>
      </div>

      {(next != null || abortable || canOpenPatient) && (
        <div className={classes.actions}>
          <span className={classes.actionsLabel}>{t('calendar.next_step')}</span>
          {canEdit && next != null && (
            <Button variant="primary" size="lg" block onClick={() => onStatus(next.to)}>
              {t(next.labelKey)}
            </Button>
          )}
          <div className={classes.grid}>
            {canOpenPatient && (
              <Link to={`/patients/${appointment.patientId}`} className={classes.link}>
                {t('calendar.action_patient_card')}
              </Link>
            )}
            {canEdit && abortable && (
              <Button variant="danger" onClick={onNoShow}>
                {t('calendar.action_no_show')}
              </Button>
            )}
            {canCancel && abortable && (
              <Button variant="danger" onClick={onCancel}>
                {t('calendar.action_cancel')}
              </Button>
            )}
          </div>
        </div>
      )}

      <ol className={classes.history} aria-label={t('calendar.history')}>
        {steps.map(({ s, state }) => (
          <li key={s} className={classes.step} data-state={state}>
            <b className={classes.mark} aria-hidden="true">
              {state === 'done' ? '✓' : state === 'todo' ? '○' : '●'}
            </b>
            <span>
              {s === 'scheduled'
                ? t(HISTORY_KEY[s], { date: fmt(appointment.createdAt) })
                : t(HISTORY_KEY[s])}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}
