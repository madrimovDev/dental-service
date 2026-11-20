import { useTranslation } from 'react-i18next';
import { formatDayMonth, formatWeekday } from '@/lib/format';
import { cellStartMinute, groupByDay, minuteLabel } from '../appointments.mappers';
import type { Appointment } from '../appointments.types';
import {
  type CalendarEvent,
  GRID,
  type GridConfig,
  toneForIndex,
  toneVars,
} from '../appointments.types';
import { AppointmentSlot } from './AppointmentSlot';
import classes from './CalendarGrid.module.css';

/** Yarim soatlik grid chiziqlari (hour opacity 1, half .4) — CalendarGrid bilan bir xil. */
function GridLines({
  grid,
  cellLabel,
  onCell,
}: {
  grid: GridConfig;
  cellLabel?: (startMinute: number) => string;
  onCell?: (startMinute: number) => void;
}) {
  const rows = (grid.dayEndHour - grid.dayStartHour) * 2;
  return (
    <>
      {Array.from({ length: rows }, (_, i) =>
        onCell ? (
          <button
            // biome-ignore lint/suspicious/noArrayIndexKey: statik fiksir grid panjarasi
            key={i}
            type="button"
            tabIndex={-1}
            className={classes.gridLine}
            data-half={i % 2 === 1}
            aria-label={cellLabel?.(cellStartMinute(i, grid))}
            onClick={() => onCell(cellStartMinute(i, grid))}
          />
        ) : (
          // biome-ignore lint/suspicious/noArrayIndexKey: statik fiksir grid panjarasi
          <div key={i} className={classes.gridLine} data-half={i % 2 === 1} />
        ),
      )}
    </>
  );
}

/** Hafta ko'rinishi — 7 kun ustun (kun grid generalizatsiyasi, `groupByDay`). */
export function WeekGrid({
  appointments,
  dayKeys,
  patientName,
  onSlotClick,
  selectedId,
  onCellClick,
  grid = GRID,
  outsideHoursIds,
}: {
  appointments: Appointment[];
  dayKeys: string[];
  patientName: (patientId: string) => string;
  onSlotClick?: (event: CalendarEvent) => void;
  selectedId?: string | null;
  /** FT-05.1: `appointment.create` — bo'sh katakka bosish (kun + boshlanish daqiqasi). */
  onCellClick?: (cell: { dateKey: string; startMinute: number }) => void;
  /** FT-05.2: filial ish vaqtidan hisoblangan oyna (standart — `GRID`). */
  grid?: GridConfig;
  /** FT-05.2: filial ish vaqtidan tashqari yozilishlar — «soatdan tashqari» belgisi. */
  outsideHoursIds?: ReadonlySet<string>;
}) {
  const { t, i18n } = useTranslation();
  const cols = groupByDay(appointments, dayKeys, grid);
  const hours = Array.from(
    { length: grid.dayEndHour - grid.dayStartHour },
    (_, i) => grid.dayStartHour + i,
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
                  <span className={classes.colName}>
                    {formatWeekday(day, i18n.language, 'short', 'Asia/Tashkent')}
                  </span>
                  <span className={classes.colSub}>
                    {formatDayMonth(day, i18n.language, {
                      month: 'short',
                      padDay: true,
                      timeZone: 'Asia/Tashkent',
                    })}
                  </span>
                </span>
                <span className={classes.colCount}>{col.events.length}</span>
              </div>
              <div className={classes.colBody}>
                <GridLines
                  grid={grid}
                  onCell={
                    onCellClick
                      ? (startMinute) => onCellClick({ dateKey: col.dateKey, startMinute })
                      : undefined
                  }
                  cellLabel={(m) =>
                    t('calendar.new_appt_at', {
                      doctor: formatWeekday(day, i18n.language, 'short', 'Asia/Tashkent'),
                      time: minuteLabel(m),
                    })
                  }
                />
                {col.events.map((e) => (
                  <AppointmentSlot
                    key={e.appointment.id}
                    event={e}
                    patientName={patientName}
                    tone={tone}
                    onClick={onSlotClick}
                    selected={selectedId === e.appointment.id}
                    outsideHours={outsideHoursIds?.has(e.appointment.id)}
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
