import { UnstyledButton } from '@mantine/core';
import type { MouseEvent, ReactNode } from 'react';
import classes from './Button.module.css';

export interface ButtonProps {
  children?: ReactNode;
  variant?: 'default' | 'primary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  block?: boolean;
  iconLeft?: ReactNode;
  iconRight?: ReactNode;
  disabled?: boolean;
  onClick?: (e: MouseEvent<HTMLButtonElement>) => void;
  type?: 'button' | 'submit' | 'reset';
}

export function Button({
  children,
  variant = 'default',
  size = 'md',
  block = false,
  iconLeft,
  iconRight,
  disabled = false,
  onClick,
  type = 'button',
}: ButtonProps) {
  return (
    <UnstyledButton
      component="button"
      type={type}
      disabled={disabled}
      onClick={onClick}
      className={classes.root}
      data-variant={variant}
      data-size={size}
      data-block={block || undefined}
    >
      {iconLeft}
      {children != null && <span>{children}</span>}
      {iconRight}
    </UnstyledButton>
  );
}
