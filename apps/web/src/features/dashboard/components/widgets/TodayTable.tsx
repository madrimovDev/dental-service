import { StatusPill } from '@dental/ui';
import { Title } from '@mantine/core';
import { Link } from 'react-router-dom';
import { appointmentStatusTone } from './ScheduleList.tsx';

export interface TodayRow {
  id: string;
  time: string;
  patient: string;
  meta: string;
  status: string;
  statusLabel: string;
  /** Bitta keyingi amal (yo'q bo'lsa — ko'rsatilmaydi). */
  action?: { label: string; to: string };
}

export interface TodayTableProps {
  title: string;
  calendarLabel: string;
  onCalendar: () => void;
  columns: { time: string; patient: string; meta: string; status: string; action: string };
  rows: TodayRow[];
  emptyText: string;
}

const GRID = '64px minmax(0,1.2fr) minmax(0,1fr) 140px 120px';

/** «Keyingi bemorlar» jadvali — har qatorda BITTA amal. Sof presentational. */
export function TodayTable({
  title,
  calendarLabel,
  onCalendar,
  columns,
  rows,
  emptyText,
}: TodayTableProps) {
  const head = { fontSize: 11.5, fontWeight: 600, color: 'var(--ink-3)' } as const;
  return (
    <div
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-card)',
        boxShadow: 'var(--shadow-sm)',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '16px 18px',
          borderBottom: '1px solid var(--border)',
        }}
      >
        <Title order={4} fw={700} c="var(--ink)">
          {title}
        </Title>
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
      </div>
      {rows.length === 0 ? (
        <div style={{ padding: '16px 18px', fontSize: 12.5, color: 'var(--ink-3)' }}>
          {emptyText}
        </div>
      ) : (
        <>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: GRID,
              gap: 12,
              padding: '8px 18px',
              borderBottom: '1px solid var(--border)',
            }}
          >
            <span style={head}>{columns.time}</span>
            <span style={head}>{columns.patient}</span>
            <span style={head}>{columns.meta}</span>
            <span style={head}>{columns.status}</span>
            <span style={{ ...head, textAlign: 'right' }}>{columns.action}</span>
          </div>
          {rows.map((r) => (
            <div
              key={r.id}
              style={{
                display: 'grid',
                gridTemplateColumns: GRID,
                gap: 12,
                alignItems: 'center',
                padding: '12px 18px',
                borderTop: '1px solid var(--border)',
              }}
            >
              <span
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 13,
                  fontWeight: 600,
                  color: 'var(--ink-2)',
                }}
              >
                {r.time}
              </span>
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
                {r.patient}
              </span>
              <span
                style={{
                  fontSize: 12,
                  color: 'var(--ink-3)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {r.meta}
              </span>
              <span>
                <StatusPill status={appointmentStatusTone(r.status)}>{r.statusLabel}</StatusPill>
              </span>
              <span style={{ textAlign: 'right' }}>
                {r.action && (
                  <Link
                    to={r.action.to}
                    style={{
                      fontSize: 12.5,
                      fontWeight: 600,
                      color: 'var(--primary)',
                      textDecoration: 'none',
                    }}
                  >
                    {r.action.label}
                  </Link>
                )}
              </span>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
