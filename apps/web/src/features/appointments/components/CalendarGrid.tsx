import { Avatar } from '@dental/ui';
import { groupByDoctor } from '../appointments.mappers';
import type { Appointment } from '../appointments.types';
import { type CalendarEvent, type Doctor, GRID } from '../appointments.types';
import { AppointmentSlot } from './AppointmentSlot';
import classes from './CalendarGrid.module.css';

export function CalendarGrid({
  appointments,
  doctors,
  patientName,
  onSlotClick,
}: {
  appointments: Appointment[];
  doctors: Doctor[];
  patientName: (patientId: string) => string;
  onSlotClick?: (event: CalendarEvent) => void;
}) {
  const cols = groupByDoctor(appointments, doctors);
  const hours = Array.from(
    { length: GRID.dayEndHour - GRID.dayStartHour },
    (_, i) => GRID.dayStartHour + i,
  );

  return (
    <div className={classes.grid}>
      <div className={classes.times}>
        <div style={{ height: 40 }} />
        {hours.map((h) => (
          <div key={h} className={classes.timeLabel}>
            {String(h).padStart(2, '0')}:00
          </div>
        ))}
      </div>
      <div className={classes.cols}>
        {cols.map((col) => (
          <div key={col.doctor.id} className={classes.col}>
            <div className={classes.colHead}>
              <Avatar name={col.doctor.name} size="sm" /> {col.doctor.name}
            </div>
            <div className={classes.colBody}>
              {hours.map((h) => (
                <div key={h} className={classes.hourLine} />
              ))}
              {col.events.map((e) => (
                <AppointmentSlot
                  key={e.appointment.id}
                  event={e}
                  patientName={patientName}
                  onClick={onSlotClick}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
