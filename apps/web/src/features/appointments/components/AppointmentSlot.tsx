import { localTimeLabel } from '../appointments.mappers';
import type { CalendarEvent } from '../appointments.types';
import classes from './CalendarGrid.module.css';

export function AppointmentSlot({
  event,
  patientName,
  onClick,
}: {
  event: CalendarEvent;
  patientName: (patientId: string) => string;
  onClick?: (event: CalendarEvent) => void;
}) {
  const { pos, appointment } = event;
  const width = 100 / pos.laneCount;
  return (
    <button
      type="button"
      className={classes.slot}
      data-status={appointment.status}
      style={{
        top: pos.top + 40,
        height: pos.height,
        left: `${pos.lane * width}%`,
        width: `${width}%`,
      }}
      onClick={() => onClick?.(event)}
    >
      <span className={classes.slotTime}>{localTimeLabel(appointment.startTime)}</span>{' '}
      {patientName(appointment.patientId)}
    </button>
  );
}
