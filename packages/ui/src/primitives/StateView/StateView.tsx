import { Skeleton } from '@mantine/core';
import type { ReactNode } from 'react';
import classes from './StateView.module.css';

export type StateViewStatus = 'loading' | 'error' | 'empty' | 'forbidden';
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
  /**
   * Faqat `forbidden` uchun: kimga murojaat qilish matni ("Kerak bo'lsa, Anvar
   * Karimovga murojaat qiling."). Chaqiruvchi tarjima qilib beradi.
   */
  contact?: string;
}

const LockIcon = (
  <svg
    aria-hidden="true"
    width="22"
    height="22"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M6 11h12v10H6zM8 11V7a4 4 0 0 1 8 0v4" />
  </svg>
);

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
    contact,
  } = props;

  // 403: hech qachon standart/oldingi qiymat ko'rsatilmaydi (ID-11) — faqat tushuntirish.
  if (status === 'forbidden') {
    return (
      <div className={classes.root} data-state="forbidden">
        <div className={classes.center}>
          <div className={classes.icon}>{icon ?? LockIcon}</div>
          {title && <div className={classes.title}>{title}</div>}
          {description && <div className={classes.description}>{description}</div>}
          {contact && <div className={classes.description}>{contact}</div>}
        </div>
      </div>
    );
  }

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
