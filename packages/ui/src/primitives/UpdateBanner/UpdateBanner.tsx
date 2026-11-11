import type { ReactNode } from 'react';
import classes from './UpdateBanner.module.css';

export interface UpdateBannerAction {
  label: string;
  onClick: () => void;
}

export interface UpdateBannerProps {
  /** "Yangi versiya 0.2.0 tayyor" */
  title: ReactNode;
  /** Qachon o'rnatilishi: ish vaqtida emas, klinika yopilgandan keyin. */
  children: ReactNode;
  actions?: UpdateBannerAction[];
}

/** Desktop yangilanishi haqida ma'lumot — majburiy qayta ishga tushirish qabul o'rtasida bo'lmaydi. */
export function UpdateBanner({ title, children, actions }: UpdateBannerProps) {
  return (
    <div className={classes.root} role="status">
      <strong className={classes.title}>{title}</strong>
      <span className={classes.text}>{children}</span>
      {actions && actions.length > 0 && (
        <div className={classes.actions}>
          {actions.map((a) => (
            <button key={a.label} type="button" className={classes.action} onClick={a.onClick}>
              {a.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
