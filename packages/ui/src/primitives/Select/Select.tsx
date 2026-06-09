import { Select as MantineSelect } from '@mantine/core';
import type { ComponentProps } from 'react';
import classes from './Select.module.css';

export interface SelectProps {
  label?: string;
  value?: string | null;
  onChange?: (value: string | null) => void;
  placeholder?: string;
  data: ComponentProps<typeof MantineSelect>['data'];
}

export function Select({ label, value, onChange, placeholder = 'Tanlang', data }: SelectProps) {
  return (
    <MantineSelect
      label={label}
      value={value}
      onChange={(v) => onChange?.(v)}
      placeholder={placeholder}
      data={data}
      classNames={{ input: classes.input, dropdown: classes.dropdown, option: classes.option }}
    />
  );
}
