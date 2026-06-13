import { Skeleton } from '@mantine/core';
import type { ReactNode } from 'react';
import classes from './StateView.module.css';

export type StateViewStatus = 'loading' | 'error' | 'empty';
export type StateViewSkeleton = 'table' | 'cards' | 'detail';

export interface StateViewProps {
  status: StateViewStatus;
  skeleton?: StateViewSkeleton;
  icon?: ReactNode;
  title?: string;
  description?: string;
  action?: ReactNode;
  onRetry?: () => void;
  retryLabel?: string;
}

function SkeletonBlock({ shape }: { shape: StateViewSkeleton }) {
  if (shape === 'detail') {
    return (
      <div className={classes.skeletonWrap}>
        <Skeleton height={40} width="40%" radius="md" />
        <Skeleton height={120} radius="md" mt="md" />
        <Skeleton height={120} radius="md" mt="sm" />
      </div>
    );
  }
  if (shape === 'cards') {
    return (
      <div className={classes.cards}>
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} height={96} radius="md" />
        ))}
      </div>
    );
  }
  return (
    <div className={classes.skeletonWrap}>
      {[0, 1, 2, 3, 4].map((i) => (
        <Skeleton key={i} height={44} radius="sm" mt={i === 0 ? 0 : 8} />
      ))}
    </div>
  );
}

export function StateView(props: StateViewProps) {
  const {
    status,
    skeleton = 'table',
    icon,
    title,
    description,
    action,
    onRetry,
    retryLabel,
  } = props;

  if (status === 'loading') {
    return (
      <div className={classes.root} data-state="loading" aria-busy="true">
        <SkeletonBlock shape={skeleton} />
      </div>
    );
  }

  return (
    <div className={classes.root} data-state={status}>
      <div className={classes.center}>
        {icon && <div className={classes.icon}>{icon}</div>}
        {title && <div className={classes.title}>{title}</div>}
        {description && <div className={classes.description}>{description}</div>}
        {status === 'error' && onRetry && retryLabel && (
          <button type="button" className={classes.retry} onClick={onRetry}>
            {retryLabel}
          </button>
        )}
        {action && <div className={classes.action}>{action}</div>}
      </div>
    </div>
  );
}
