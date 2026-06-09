import type { ChangeEvent, ReactNode } from 'react';
import classes from './Input.module.css';

export interface InputProps {
  label?: string;
  value?: string;
  placeholder?: string;
  icon?: ReactNode;
  invalid?: boolean;
  onChange?: (value: string, e: ChangeEvent<HTMLInputElement>) => void;
  type?: string;
}

export function Input({
  label,
  value,
  placeholder,
  icon,
  invalid = false,
  onChange,
  type = 'text',
}: InputProps) {
  const field = (
    <div className={classes.wrap} data-invalid={invalid || undefined}>
      {icon}
      <input
        className={classes.input}
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={onChange ? (e) => onChange(e.target.value, e) : undefined}
      />
    </div>
  );
  if (!label) return field;
  return (
    // biome-ignore lint/a11y/noLabelWithoutControl: input nested via `field` variable (implicit association)
    <label className={classes.field}>
      <span>{label}</span>
      {field}
    </label>
  );
}
