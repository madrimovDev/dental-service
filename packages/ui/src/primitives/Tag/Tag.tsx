import type { ReactNode } from 'react';
import classes from './Tag.module.css';

export interface TagProps {
  children: ReactNode;
}

export function Tag({ children }: TagProps) {
  return <span className={classes.root}>{children}</span>;
}
