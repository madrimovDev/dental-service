import type { ReactNode } from 'react';
import classes from './PageHead.module.css';

export interface PageHeadProps {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
}

export function PageHead({ title, subtitle, actions }: PageHeadProps) {
  return (
    <div className={classes.root}>
      <div>
        <h1 className={classes.title}>{title}</h1>
        {subtitle != null && <p className={classes.sub}>{subtitle}</p>}
      </div>
      {actions != null && <div className={classes.actions}>{actions}</div>}
    </div>
  );
}
