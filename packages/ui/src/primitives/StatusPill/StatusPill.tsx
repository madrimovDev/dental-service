import type { ReactNode } from 'react';
import classes from './StatusPill.module.css';

/** Yagona holat lug'ati (UI-0 1.2) — ma'no bo'yicha, modul bo'yicha emas. */
export type StatusMeaning = 'planned' | 'confirmed' | 'waiting' | 'active' | 'done' | 'failed';

/** Eski (R0) variant nomlari — iste'molchilar buzilmasligi uchun saqlanadi. */
export type LegacyStatus = 'neutral' | 'success' | 'warning' | 'danger' | 'info' | 'accent';

/** Eski nom -> yangi ma'no. */
export const LEGACY_STATUS_MEANING: Record<LegacyStatus, StatusMeaning> = {
  info: 'planned',
  success: 'confirmed',
  warning: 'waiting',
  accent: 'active',
  neutral: 'done',
  danger: 'failed',
};

const MEANINGS: ReadonlySet<string> = new Set([
  'planned',
  'confirmed',
  'waiting',
  'active',
  'done',
  'failed',
]);

export function resolveStatusMeaning(status: StatusMeaning | LegacyStatus): StatusMeaning {
  return MEANINGS.has(status)
    ? (status as StatusMeaning)
    : LEGACY_STATUS_MEANING[status as LegacyStatus];
}

export interface StatusPillProps {
  children: ReactNode;
  status?: StatusMeaning | LegacyStatus;
  dot?: boolean;
}

export function StatusPill({ children, status = 'neutral', dot = true }: StatusPillProps) {
  return (
    <span className={classes.root} data-status={status} data-meaning={resolveStatusMeaning(status)}>
      {dot && <span className={classes.dot} data-pill-dot />}
      {children}
    </span>
  );
}
