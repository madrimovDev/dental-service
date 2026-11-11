import { ApiError } from '@dental/api-client';
import { StateView } from '@dental/ui';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import classes from './Overview.module.css';

/** Server 403 qaytargan (ruxsat yo'q) — bo'sh/default emas, `forbidden` holati ko'rsatiladi. */
export function isForbiddenError(err: unknown): boolean {
  return err instanceof ApiError && err.status === 403;
}

export function Block({
  titleId,
  title,
  children,
}: {
  titleId: string;
  title: ReactNode;
  children: ReactNode;
}) {
  return (
    <section aria-labelledby={titleId} className={classes.block}>
      <h2 id={titleId} className={classes.title}>
        {title}
      </h2>
      {children}
    </section>
  );
}

export function ForbiddenState() {
  const { t } = useTranslation();
  return (
    <StateView
      status="forbidden"
      title={t('patientCard.forbidden_title')}
      description={t('patientCard.forbidden_desc')}
    />
  );
}

/** DD.MM.YYYY — deterministik (locale'ga bog'liq emas). */
export function formatDate(iso: string): string {
  const d = new Date(iso);
  const p2 = (n: number) => String(n).padStart(2, '0');
  return `${p2(d.getDate())}.${p2(d.getMonth() + 1)}.${d.getFullYear()}`;
}
