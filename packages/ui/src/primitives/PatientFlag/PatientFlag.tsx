import type { ReactNode } from 'react';
import classes from './PatientFlag.module.css';

export type PatientFlagLevel = 'critical' | 'attention' | 'neutral' | 'info';

export interface PatientFlagProps {
  children: ReactNode;
  level?: PatientFlagLevel;
}

/** Bemor belgisi — to'rtburchak yorliq (holat doirasi emas). Rang ma'noni takrorlaydi, matn majburiy. */
export function PatientFlag({ children, level = 'neutral' }: PatientFlagProps) {
  return (
    <span className={classes.root} data-level={level}>
      {children}
    </span>
  );
}
