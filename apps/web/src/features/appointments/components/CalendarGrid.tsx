import { groupByDoctor } from '../appointments.mappers';
import type { Appointment } from '../appointments.types';
import {
  type CalendarEvent,
  type Doctor,
  GRID,
  toneForIndex,
  toneVars,
} from '../appointments.types';
import { AppointmentSlot } from './AppointmentSlot';
import classes from './CalendarGrid.module.css';
import { CurrentTimeLine } from './CurrentTimeLine';

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '';
  const first = parts[0]?.[0] ?? '';
  if (parts.length === 1) return first.toUpperCase();
  const last = parts[parts.length - 1]?.[0] ?? '';
  return (first + last).toUpperCase();
}

/** Yarim soatlik grid chiziqlari (hour opacity 1, half .4) — 88px/soat zichlik. */
function GridLines() {
  const rows = (GRID.dayEndHour - GRID.dayStartHour) * 2; // 30-daq qadam
  return (
    <>
      {Array.from({ length: rows }, (_, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: statik fiksir grid panjarasi
        <div key={i} className={classes.gridLine} data-half={i % 2 === 1} />
      ))}
    </>
  );
}

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
        <div className={classes.timesHead} />
        {hours.map((h) => (
          <div key={h} className={classes.timeLabel}>
            {String(h).padStart(2, '0')}:00
          </div>
        ))}
      </div>
      <div className={classes.cols}>
        {cols.map((col, index) => {
          const tone = col.doctor.id ? toneForIndex(index) : 'muted';
          return (
            <div key={col.doctor.id} className={classes.col}>
              <div className={classes.colHead} style={toneVars(tone)}>
                <span className={classes.colTile} aria-hidden>
                  {initials(col.doctor.name)}
                </span>
                <span className={classes.colHeadText}>
                  <span className={classes.colName}>{col.doctor.name}</span>
                  {/* sub-line: DoctorListItem faqat {id,name} → specialty data yo'q (bo'sh) */}
                </span>
                <span className={classes.colCount}>{col.events.length}</span>
              </div>
              <div className={classes.colBody}>
                <GridLines />
                <CurrentTimeLine showBadge={index === 0} />
                {col.events.map((e) => (
                  <AppointmentSlot
                    key={e.appointment.id}
                    event={e}
                    patientName={patientName}
                    tone={tone}
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
