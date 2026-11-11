import { useTranslation } from 'react-i18next';
import { localTimeLabel } from '../appointments.mappers';
import type { CalendarEvent, Tone } from '../appointments.types';
import { toneVars } from '../appointments.types';
import classes from './CalendarGrid.module.css';
import { StatusIndicator } from './StatusIndicator';

export function AppointmentSlot({
  event,
  patientName,
  tone = 'muted',
  onClick,
  selected = false,
  draggable = false,
  onDragStartSlot,
}: {
  event: CalendarEvent;
  patientName: (patientId: string) => string;
  tone?: Tone;
  onClick?: (event: CalendarEvent) => void;
  selected?: boolean;
  /** Sudrab ko'chirish mumkin (appointment.edit + faol yozilish). */
  draggable?: boolean;
  onDragStartSlot?: (event: CalendarEvent, grabOffsetPx: number) => void;
}) {
  const { t } = useTranslation();
  const { pos, appointment, startMin, endMin } = event;
  const width = 100 / pos.laneCount;
  const durationMin = Math.max(endMin - startMin, 0);
  const serviceCount = appointment.serviceIds?.length ?? 0;

  return (
    <button
      type="button"
      className={classes.slot}
      data-status={appointment.status}
      data-selected={selected}
      aria-pressed={selected}
      draggable={draggable || undefined}
      data-draggable={draggable || undefined}
      onDragStart={
        draggable
          ? (e) => {
              const top = e.currentTarget.getBoundingClientRect().top;
              e.dataTransfer.effectAllowed = 'move';
              e.dataTransfer.setData('text/plain', appointment.id);
              onDragStartSlot?.(event, e.clientY - top);
            }
          : undefined
      }
      style={{
        // model (a): slot ham, grid line ham .colBody origin'idan → addend YO'Q
        top: pos.top,
        height: pos.height,
        left: `${pos.lane * width}%`,
        width: `${width}%`,
        ...toneVars(tone),
      }}
      onClick={() => onClick?.(event)}
    >
      <span className={classes.slotHead}>
        <span className={classes.slotTime}>
          {localTimeLabel(appointment.startTime)} · {durationMin}
          {t('appointments.minuteShort')}
        </span>
        <StatusIndicator status={appointment.status} size={9} />
      </span>
      <span className={classes.slotPatient}>{patientName(appointment.patientId)}</span>
      {pos.height > 44 && serviceCount > 0 ? (
        <span className={classes.slotService}>
          {serviceCount} {t('appointments.serviceShort')}
        </span>
      ) : null}
    </button>
  );
}
