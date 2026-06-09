import type { ReactNode } from 'react';
import classes from './Card.module.css';

export interface CardProps {
  title?: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
  bodyless?: boolean;
}

export function Card({ title, subtitle, actions, children, bodyless = false }: CardProps) {
  const hasHeader = title != null || subtitle != null || actions != null;
  return (
    <div className={classes.root}>
      {hasHeader && (
        <div className={classes.header} data-card-header>
          <div>
            {title != null && <div className={classes.title}>{title}</div>}
            {subtitle != null && <div className={classes.sub}>{subtitle}</div>}
          </div>
          {actions != null && <div className={classes.actions}>{actions}</div>}
        </div>
      )}
      {bodyless ? children : <div className={classes.body}>{children}</div>}
    </div>
  );
}
