import type { ChangeEvent, ReactNode } from 'react';
import classes from './Input.module.css';

export interface InputProps {
  label?: string;
  value?: string;
  placeholder?: string;
  icon?: ReactNode;
  invalid?: boolean;
  error?: ReactNode;
  disabled?: boolean;
  required?: boolean;
  onChange?: (value: string, e: ChangeEvent<HTMLInputElement>) => void;
  type?: string;
}

export function Input({
  label,
  value,
  placeholder,
  icon,
  invalid = false,
  error,
  disabled = false,
  required = false,
  onChange,
  type = 'text',
}: InputProps) {
  const isInvalid = invalid || error != null;
  const field = (
    <div
      className={classes.wrap}
      data-invalid={isInvalid || undefined}
      data-disabled={disabled || undefined}
    >
      {icon}
      <input
        className={classes.input}
        type={type}
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        aria-invalid={isInvalid || undefined}
        onChange={onChange ? (e) => onChange(e.target.value, e) : undefined}
      />
    </div>
  );
  const errorNode =
    error != null ? (
      <span className={classes.error} role="alert">
        {error}
      </span>
    ) : null;
  if (!label) {
    return (
      <>
        {field}
        {errorNode}
      </>
    );
  }
  return (
    // biome-ignore lint/a11y/noLabelWithoutControl: input nested via `field` variable (implicit association)
    <label className={classes.field}>
      <span>
        {label}
        {required && <span className={classes.req}> *</span>}
      </span>
      {field}
      {errorNode}
    </label>
  );
}
