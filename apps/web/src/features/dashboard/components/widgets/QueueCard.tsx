import type { QueueTicketStatus as QueueStatusValue } from '@dental/api-client';
// Runtime enum const lives in the generated model (barrel re-exports it type-only); deep
// import gives the value object so consumers/tests can iterate every status.
import { QueueTicketStatus } from '@dental/api-client/generated/model/queueTicketStatus';
import { StatusPill, type StatusPillProps } from '@dental/ui';
import type { ReactNode } from 'react';

type Tone = NonNullable<StatusPillProps['status']>;

/**
 * QueueTicketStatus → StatusPill tone. Compile-time exhaustive (typecheck fails if the
 * enum grows). Values mirror the queue feature precedent (waiting=warning, in_progress=info,
 * done=success, missed=danger) — redefined in-file, no cross-feature import.
 */
const QUEUE_TONE: Record<QueueStatusValue, Tone> = {
  waiting: 'warning',
  in_progress: 'info',
  done: 'success',
  missed: 'danger',
};

/**
 * Runtime-tolerant tone lookup. Param is `string` (not the enum) on purpose so the
 * `?? 'neutral'` fallback is reachable — no row ever renders a blank/unmapped chip.
 */
export function queueStatusTone(status: string): Tone {
  return (QUEUE_TONE as Record<string, Tone>)[status] ?? 'neutral';
}

/** Re-export the enum value object so consumers/tests can iterate every value. */
export { QueueTicketStatus };

export interface QueueRow {
  id: string;
  /** queue number label, e.g. "12" (mono badge). */
  number: string;
  /** patient name (truncated). */
  patient: string;
  /** secondary meta line, e.g. doctor/branch (truncated). */
  meta?: string;
  /** raw status enum value — drives the chip tone. */
  status: string;
  /** already-translated status label (consumer's t()). Rendered inside the chip. */
  statusLabel: string;
}

export interface QueueCardProps {
  /** card title, e.g. t('dashboard.queue_status') / "Navbat holati". */
  title: string;
  rows: QueueRow[];
  /** already-translated waiting pill, e.g. t('dashboard.queue_waiting', { n }) / "3 kutmoqda". */
  waitingLabel?: string;
  /** rendered when rows is empty. */
  emptyText?: ReactNode;
}

/** Off-scale literal: card radius 16 / padding bottom 6 have no exact token → kept for parity. */
const CARD_RADIUS = 16;

/** "Navbat holati" — token card with header + mono waiting pill + numbered queue rows. Pure presentational. */
export function QueueCard({ title, rows, waitingLabel, emptyText }: QueueCardProps) {
  return (
    <div
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: CARD_RADIUS,
        boxShadow: 'var(--shadow-sm)',
        padding: '16px 16px 6px',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 8,
          marginBottom: 4,
        }}
      >
        <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)' }}>{title}</span>
        {waitingLabel != null && (
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 12,
              fontWeight: 700,
              color: 'var(--warning)',
              background: 'var(--warning-soft)',
              borderRadius: 99,
              padding: '2px 9px',
            }}
          >
            {waitingLabel}
          </span>
        )}
      </div>

      {rows.length === 0
        ? emptyText != null && (
            <div style={{ padding: '9px 0', fontSize: 12.5, color: 'var(--ink-3)' }}>
              {emptyText}
            </div>
          )
        : rows.map((row) => (
            <div
              key={row.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 11,
                padding: '9px 0',
                borderTop: '1px solid var(--border)',
              }}
            >
              <span
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 13,
                  fontWeight: 700,
                  color: 'var(--ink)',
                  width: 42,
                  textAlign: 'center',
                  background: 'var(--surface-2)',
                  borderRadius: 7,
                  padding: '5px 0',
                  flex: 'none',
                }}
              >
                {row.number}
              </span>
              <span
                style={{ display: 'flex', flexDirection: 'column', gap: 1, flex: 1, minWidth: 0 }}
              >
                <span
                  style={{
                    fontSize: 13,
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
                      fontSize: 11.5,
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
              <StatusPill status={queueStatusTone(row.status)}>{row.statusLabel}</StatusPill>
            </div>
          ))}
    </div>
  );
}
