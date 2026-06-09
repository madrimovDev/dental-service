import { UnstyledButton } from '@mantine/core';
import type { MouseEvent, ReactNode } from 'react';
import classes from './IconButton.module.css';

export interface IconButtonProps {
  children: ReactNode;
  label: string;
  size?: 'sm' | 'md';
  bordered?: boolean;
  dot?: boolean;
  onClick?: (e: MouseEvent<HTMLButtonElement>) => void;
}

export function IconButton({
  children,
  label,
  size = 'md',
  bordered = false,
  dot = false,
  onClick,
}: IconButtonProps) {
  return (
    <UnstyledButton
      component="button"
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={classes.root}
      data-size={size}
      data-bordered={bordered || undefined}
    >
      {children}
      {dot && <span className={classes.dot} data-dot />}
    </UnstyledButton>
  );
}
