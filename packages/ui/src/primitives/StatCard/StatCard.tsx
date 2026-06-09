import type { ReactNode } from 'react';
import classes from './StatCard.module.css';

export interface StatCardProps {
  label: ReactNode;
  value: ReactNode;
  unit?: string;
  icon?: ReactNode;
  accent?: boolean;
  delta?: ReactNode;
  deltaDir?: 'up' | 'down';
}

export function StatCard({
  label,
  value,
  unit,
  icon,
  accent = false,
  delta,
  deltaDir = 'up',
}: StatCardProps) {
  return (
    <div className={classes.root}>
      <div className={classes.top}>
        {icon != null && (
          <span className={classes.chip} data-accent={accent || undefined}>
            {icon}
          </span>
        )}
        <span className={classes.label}>{label}</span>
      </div>
      <div className={classes.row}>
        <span className={classes.value}>{value}</span>
        {unit && <span className={classes.unit}>{unit}</span>}
        {delta != null && (
          <span className={classes.delta} data-delta={deltaDir}>
            {delta}
          </span>
        )}
      </div>
    </div>
  );
}
