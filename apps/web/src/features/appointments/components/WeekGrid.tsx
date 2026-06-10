import { groupByDay } from '../appointments.mappers';
import type { Appointment } from '../appointments.types';
import { type CalendarEvent, GRID } from '../appointments.types';
import { AppointmentSlot } from './AppointmentSlot';
import classes from './CalendarGrid.module.css';

const WEEKDAYS = ['Yak', 'Du', 'Se', 'Cho', 'Pa', 'Ju', 'Sha'] as const;

/** Hafta ko'rinishi — 7 kun ustun (kun grid generalizatsiyasi, `groupByDay`). */
export function WeekGrid({
  appointments,
  dayKeys,
  patientName,
  onSlotClick,
}: {
  appointments: Appointment[];
  dayKeys: string[];
  patientName: (patientId: string) => string;
  onSlotClick?: (event: CalendarEvent) => void;
}) {
  const cols = groupByDay(appointments, dayKeys);
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
        {cols.map((col) => {
          const day = new Date(`${col.dateKey}T00:00:00`);
          const weekday = WEEKDAYS[day.getDay()] ?? '';
          return (
            <div key={col.dateKey} className={classes.col}>
              <div className={classes.colHead}>
                {weekday} {String(day.getDate()).padStart(2, '0')}
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
          );
        })}
      </div>
    </div>
  );
}
