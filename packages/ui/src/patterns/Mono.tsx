import type { ElementType, ReactNode } from 'react';
import classes from './Mono.module.css';

export interface MonoProps {
  children: ReactNode;
  /** Render qiladigan element. @default "span" */
  as?: ElementType;
}

/** Raqam / ID / sana / vaqt / narx — mono + tabular nums. */
export function Mono({ children, as: Tag = 'span' }: MonoProps) {
  return <Tag className={classes.mono}>{children}</Tag>;
}
