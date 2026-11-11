import type { ReactNode } from 'react';
import classes from './AlertBanner.module.css';

export interface AlertBannerProps {
  /** 2 = diqqat (doim ko'rinadi, to'xtatmaydi), 3 = ma'lumot. 1-daraja — CriticalActionDialog. */
  tier: 2 | 3;
  title?: ReactNode;
  children: ReactNode;
  action?: { label: string; onClick: () => void };
}

export function AlertBanner({ tier, title, children, action }: AlertBannerProps) {
  return (
    <div className={classes.root} data-tier={tier} role={tier === 2 ? 'alert' : 'status'}>
      <span className={classes.dot} aria-hidden="true" />
      <div className={classes.body}>
        {title && <strong className={classes.title}>{title}</strong>}
        <span className={classes.text}>{children}</span>
      </div>
      {action && (
        <button type="button" className={classes.action} onClick={action.onClick}>
          {action.label}
        </button>
      )}
    </div>
  );
}
