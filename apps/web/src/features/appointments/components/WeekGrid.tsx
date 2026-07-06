import { useTranslation } from 'react-i18next';
import { groupByDay } from '../appointments.mappers';
import type { Appointment } from '../appointments.types';
import { type CalendarEvent, GRID, toneForIndex, toneVars } from '../appointments.types';
import { AppointmentSlot } from './AppointmentSlot';
import classes from './CalendarGrid.module.css';

/** Yarim soatlik grid chiziqlari (hour opacity 1, half .4) — CalendarGrid bilan bir xil. */
function GridLines() {
  const rows = (GRID.dayEndHour - GRID.dayStartHour) * 2;
  return (
    <>
      {Array.from({ length: rows }, (_, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: statik fiksir grid panjarasi
        <div key={i} className={classes.gridLine} data-half={i % 2 === 1} />
      ))}
    </>
  );
}

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
  const { i18n } = useTranslation();
  const locale = i18n.language === 'ru' ? 'ru-RU' : 'uz-UZ';
  const weekdayFmt = new Intl.DateTimeFormat(locale, {
    weekday: 'short',
    timeZone: 'Asia/Tashkent',
  });
  const dayFmt = new Intl.DateTimeFormat(locale, {
    day: '2-digit',
    month: 'short',
    timeZone: 'Asia/Tashkent',
  });
  const cols = groupByDay(appointments, dayKeys);
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
          const day = new Date(`${col.dateKey}T00:00:00Z`);
          const tone = toneForIndex(index);
          return (
            <div key={col.dateKey} className={classes.col}>
              <div className={classes.colHead} style={toneVars(tone)}>
                <span className={classes.colHeadText}>
                  <span className={classes.colName}>{weekdayFmt.format(day)}</span>
                  <span className={classes.colSub}>{dayFmt.format(day)}</span>
                </span>
                <span className={classes.colCount}>{col.events.length}</span>
              </div>
              <div className={classes.colBody}>
                <GridLines />
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
