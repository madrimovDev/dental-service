import type { ReactNode } from 'react';
import classes from './StatusPill.module.css';

export interface StatusPillProps {
  children: ReactNode;
  status?: 'neutral' | 'success' | 'warning' | 'danger' | 'info' | 'accent';
  dot?: boolean;
}

export function StatusPill({ children, status = 'neutral', dot = true }: StatusPillProps) {
  return (
    <span className={classes.root} data-status={status}>
      {dot && <span className={classes.dot} data-pill-dot />}
      {children}
    </span>
  );
}
