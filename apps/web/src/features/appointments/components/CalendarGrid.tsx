import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { cellStartMinute, groupByDoctor, minuteLabel } from '../appointments.mappers';
import type { Appointment } from '../appointments.types';
import {
  type CalendarEvent,
  type Doctor,
  GRID,
  type GridConfig,
  toneForIndex,
  toneVars,
} from '../appointments.types';
import { AppointmentSlot } from './AppointmentSlot';
import classes from './CalendarGrid.module.css';
import { CurrentTimeLine } from './CurrentTimeLine';

/** Faqat hali boshlanmagan yozilishni ko'chirish mumkin. */
export const MOVABLE: ReadonlySet<string> = new Set(['scheduled', 'confirmed']);

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '';
  const first = parts[0]?.[0] ?? '';
  if (parts.length === 1) return first.toUpperCase();
  const last = parts[parts.length - 1]?.[0] ?? '';
  return (first + last).toUpperCase();
}

/** Yarim soatlik grid chiziqlari (hour opacity 1, half .4) — 88px/soat zichlik. */
function GridLines({
  grid,
  cellLabel,
  onCell,
}: {
  grid: GridConfig;
  /** FT-05.1: bor bo'lsa har katak tugma (klaviatura/AT uchun aria-label). */
  cellLabel?: (startMinute: number) => string;
  onCell?: (startMinute: number) => void;
}) {
  const rows = (grid.dayEndHour - grid.dayStartHour) * 2; // 30-daq qadam
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

export function CalendarGrid({
  appointments,
  doctors,
  patientName,
  onSlotClick,
  selectedId,
  unscheduledDoctorIds,
  canMove = false,
  onMove,
  onResize,
  onCellClick,
  grid = GRID,
  outsideHoursIds,
}: {
  appointments: Appointment[];
  doctors: Doctor[];
  patientName: (patientId: string) => string;
  onSlotClick?: (event: CalendarEvent) => void;
  /** Tanlangan yozilish (halqa bilan ajratiladi). */
  selectedId?: string | null;
  /**
   * Shu kunda ish jadvali YO'Q doktorlar (`null` — bilinmaydi, `schedule.view`siz rol).
   * Ularning ustunida sabab bloki chiqadi: jadvalsiz yozib bo'lmaydi (P10).
   */
  unscheduledDoctorIds?: ReadonlySet<string> | null;
  /** `appointment.edit` — faol yozilishlarni sudrab ko'chirish mumkin. */
  canMove?: boolean;
  /** Yozilish `doctorId` ustuniga, kun boshidan `startMinute` ga tushirildi (pointer drag, touch ham). */
  onMove?: (appointment: Appointment, doctorId: string, startMinute: number) => void;
  /** FT-05.3: pastki chetdan cho'zildi — yangi tugash daqiqasi (15 daqiqa qadam). */
  onResize?: (appointment: Appointment, endMinute: number) => void;
  /** FT-05.1: `appointment.create` — bo'sh katakka bosish (jadvalsiz doktorda yo'q). */
  onCellClick?: (cell: { doctorId: string; startMinute: number }) => void;
  /** FT-05.2: filial ish vaqtidan hisoblangan oyna (standart — `GRID`). */
  grid?: GridConfig;
  /** FT-05.2: filial ish vaqtidan tashqari yozilishlar — «soatdan tashqari» belgisi. */
  outsideHoursIds?: ReadonlySet<string>;
}) {
  const { t } = useTranslation();
  const cols = groupByDoctor(appointments, doctors, grid);
  const noSchedule = (doctorId: string) => unscheduledDoctorIds?.has(doctorId) ?? false;
  const hours = Array.from(
    { length: grid.dayEndHour - grid.dayStartHour },
    (_, i) => grid.dayStartHour + i,
  );

  return (
    <div className={classes.grid} data-cal-grid>
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
            <div
              key={col.doctor.id}
              className={classes.col}
              data-no-schedule={noSchedule(col.doctor.id) || undefined}
            >
              <div className={classes.colHead} style={toneVars(tone)}>
                <span className={classes.colTile} aria-hidden>
                  {initials(col.doctor.name)}
                </span>
                <span className={classes.colHeadText}>
                  <span className={classes.colName}>{col.doctor.name}</span>
                  {/* sub-line: DoctorListItem faqat {id,name} → specialty yo'q; jadvalsiz bo'lsa qisqa belgi */}
                  {noSchedule(col.doctor.id) && (
                    <span className={`${classes.colSub} ${classes.colSubDanger}`}>
                      {t('calendar.no_schedule_badge')}
                    </span>
                  )}
                </span>
                <span className={classes.colCount}>{col.events.length}</span>
              </div>
              <div
                data-drop-col={col.doctor.id}
                className={`${classes.colBody} ${noSchedule(col.doctor.id) ? classes.colNoSchedule : ''}`}
              >
                <GridLines
                  grid={grid}
                  onCell={
                    onCellClick && !noSchedule(col.doctor.id) && col.doctor.id
                      ? (startMinute) => onCellClick({ doctorId: col.doctor.id, startMinute })
                      : undefined
                  }
                  cellLabel={(m) =>
                    t('calendar.new_appt_at', { doctor: col.doctor.name, time: minuteLabel(m) })
                  }
                />
                {noSchedule(col.doctor.id) && col.events.length === 0 && (
                  <div className={classes.noScheduleNote} role="note">
                    <span className={classes.noScheduleTitle}>
                      {t('calendar.no_schedule_title')}
                    </span>
                    <span>{t('calendar.no_schedule_text')}</span>
                    <Link to="/schedule" className={classes.noScheduleLink}>
                      {t('calendar.no_schedule_link')}
                    </Link>
                  </div>
                )}
                <CurrentTimeLine showBadge={index === 0} grid={grid} />
                {col.events.map((e) => (
                  <AppointmentSlot
                    key={e.appointment.id}
                    event={e}
                    patientName={patientName}
                    tone={tone}
                    onClick={onSlotClick}
                    selected={selectedId === e.appointment.id}
                    outsideHours={outsideHoursIds?.has(e.appointment.id)}
                    grid={grid}
                    draggable={canMove && MOVABLE.has(e.appointment.status)}
                    onMoveGesture={(ev, target) =>
                      onMove?.(ev.appointment, target.colKey, target.startMinute)
                    }
                    onResizeGesture={(ev, endMinute) => onResize?.(ev.appointment, endMinute)}
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
