import { Select as MantineSelect } from '@mantine/core';
import type { ComponentProps, ReactNode } from 'react';
import classes from './Select.module.css';

export interface SelectProps {
  label?: string;
  value?: string | null;
  onChange?: (value: string | null) => void;
  placeholder?: string;
  error?: ReactNode;
  disabled?: boolean;
  data: ComponentProps<typeof MantineSelect>['data'];
}

export function Select({
  label,
  value,
  onChange,
  placeholder,
  error,
  disabled,
  data,
}: SelectProps) {
  return (
    <MantineSelect
      label={label}
      value={value}
      onChange={(v) => onChange?.(v)}
      placeholder={placeholder}
      error={error}
      disabled={disabled}
      data={data}
      classNames={{ input: classes.input, dropdown: classes.dropdown, option: classes.option }}
    />
  );
}
