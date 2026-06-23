import type { AppointmentStatus as AppointmentStatusValue } from '@dental/api-client';
// Runtime enum const lives in the generated model (barrel re-exports it type-only); deep
// import gives the value object so consumers/tests can iterate every status.
import { AppointmentStatus } from '@dental/api-client/generated/model/appointmentStatus';
import { StatusPill, type StatusPillProps } from '@dental/ui';
import type { ReactNode } from 'react';

type Tone = NonNullable<StatusPillProps['status']>;

/**
 * AppointmentStatus → StatusPill tone. Compile-time exhaustive (typecheck fails if the
 * enum grows). Values mirror the appointments/CalendarScreen precedent for visual
 * consistency (redefined in-file — no cross-feature import).
 */
const APPT_TONE: Record<AppointmentStatusValue, Tone> = {
  scheduled: 'accent',
  confirmed: 'info',
  in_progress: 'warning',
  completed: 'success',
  no_show: 'danger',
  cancelled: 'neutral',
};

/**
 * Runtime-tolerant tone lookup. Param is `string` (not the enum) on purpose so the
 * `?? 'neutral'` fallback is reachable — no row ever renders a blank/unmapped chip even
 * if an unknown status string arrives at runtime.
 */
export function appointmentStatusTone(status: string): Tone {
  return (APPT_TONE as Record<string, Tone>)[status] ?? 'neutral';
}

/** Re-export the enum value object so consumers/tests can iterate every value. */
export { AppointmentStatus };

export interface ScheduleRow {
  id: string;
  /** time label, e.g. "09:30" — rendered in mono. */
  time: string;
  /** patient name (line 1, truncated). */
  patient: string;
  /** line 2 — already-composed "service · doctor" (truncated). */
  meta?: string;
  /** duration label, e.g. "30 min" (mono). */
  duration?: string;
  /** raw status enum value — drives the chip tone. */
  status: string;
  /** already-translated status label (consumer's t()). Rendered inside the chip. */
  statusLabel: string;
}

export interface ScheduleListProps {
  /** card title, e.g. t('dashboard.today_schedule') / "Bugungi jadval". */
  title: string;
  rows: ScheduleRow[];
  /** already-translated calendar link label, e.g. t('dashboard.calendar_link'). */
  calendarLabel?: string;
  onCalendar?: () => void;
  /** href alternative to onCalendar (rendered as <a>). */
  href?: string;
  /** rendered when rows is empty. */
  emptyText?: ReactNode;
  onRowClick?: (row: ScheduleRow) => void;
}

/** Off-scale literal: card radius 16 / row padding 12·18 have no exact token → kept for parity. */
const CARD_RADIUS = 16;

/** "Bugungi jadval" — token card with bordered header + rich appointment rows. Pure presentational. */
export function ScheduleList({
  title,
  rows,
  calendarLabel,
  onCalendar,
  href,
  emptyText,
  onRowClick,
}: ScheduleListProps) {
  return (
    <div
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: CARD_RADIUS,
        boxShadow: 'var(--shadow-sm)',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 8,
          padding: '16px 18px',
          borderBottom: '1px solid var(--border)',
        }}
      >
        <span style={{ fontSize: 14.5, fontWeight: 700, color: 'var(--ink)' }}>{title}</span>
        {calendarLabel != null &&
          (href != null ? (
            <a
              href={href}
              style={{
                fontSize: 12.5,
                fontWeight: 600,
                color: 'var(--primary)',
                textDecoration: 'none',
              }}
            >
              {calendarLabel} ›
            </a>
          ) : (
            <button
              type="button"
              onClick={onCalendar}
              style={{
                fontSize: 12.5,
                fontWeight: 600,
                color: 'var(--primary)',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: 0,
              }}
            >
              {calendarLabel} ›
            </button>
          ))}
      </div>

      {rows.length === 0
        ? emptyText != null && (
            <div style={{ padding: '16px 18px', fontSize: 12.5, color: 'var(--ink-3)' }}>
              {emptyText}
            </div>
          )
        : rows.map((row) => (
            <button
              key={row.id}
              type="button"
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 14,
                width: '100%',
                padding: '12px 18px',
                borderTop: '1px solid var(--border)',
                background: 'none',
                cursor: onRowClick ? 'pointer' : 'default',
                textAlign: 'left',
              }}
            >
              <span
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 13,
                  fontWeight: 600,
                  color: 'var(--ink-2)',
                  width: 46,
                  flex: 'none',
                }}
              >
                {row.time}
              </span>
              <span style={{ width: 1, height: 34, background: 'var(--border)', flex: 'none' }} />
              <span
                style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1, minWidth: 0 }}
              >
                <span
                  style={{
                    fontSize: 13.5,
                    fontWeight: 600,
                    color: 'var(--ink)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {row.patient}
                </span>
                {row.meta != null && (
                  <span
                    style={{
                      fontSize: 12,
                      color: 'var(--ink-3)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {row.meta}
                  </span>
                )}
              </span>
              {row.duration != null && (
                <span
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 11.5,
                    color: 'var(--ink-3)',
                    flex: 'none',
                  }}
                >
                  {row.duration}
                </span>
              )}
              <StatusPill status={appointmentStatusTone(row.status)}>{row.statusLabel}</StatusPill>
            </button>
          ))}
    </div>
  );
}
