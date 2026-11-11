import { normalizePhone } from '@dental/core';
import { useEffect, useId, useState } from 'react';
import classes from './PhoneInput.module.css';

export interface PhoneInputProps {
  /** Kanonik qiymat: `''` yoki `+998XXXXXXXXX` (to'liq bo'lmasa — `+998` + kiritilgan raqamlar). */
  value?: string;
  /** Har o'zgarishda kanonik qiymat. To'liq raqam — `+998XXXXXXXXX`; bo'sh — `''`. */
  onChange?: (value: string) => void;
  label?: string;
  /** Izoh ("Istalgan shaklda yozing — avtomatik to'g'rilanadi"). */
  hint?: string;
  error?: string;
  disabled?: boolean;
  required?: boolean;
  placeholder?: string;
}

const NATIONAL_LENGTH = 9;

/**
 * Istalgan shakldagi kiritmadan (`+998 90 123-45-67`, `998901234567`, `90 123-45-67`)
 * 9 xonali milliy qismni ajratadi.
 */
export function extractNational(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  const hasCountry =
    digits.startsWith('998') && (raw.trim().startsWith('+') || digits.length > NATIONAL_LENGTH);
  return (hasCountry ? digits.slice(3) : digits).slice(0, NATIONAL_LENGTH);
}

/** `901234567` → `90 123 45 67` (ko'rinish uchun). */
export function formatNational(national: string): string {
  const parts = [
    national.slice(0, 2),
    national.slice(2, 5),
    national.slice(5, 7),
    national.slice(7, 9),
  ];
  return parts.filter(Boolean).join(' ');
}

const toCanonical = (national: string): string => {
  if (!national) return '';
  // normalizePhone 9 xonali kiritmaga +998 qo'shadi; qisman raqamga qo'llab bo'lmaydi.
  return national.length === NATIONAL_LENGTH ? normalizePhone(national) : `+998${national}`;
};

/** `+998` prefiksli telefon maydoni; Mono; kanonik `+998XXXXXXXXX` qaytaradi. */
export function PhoneInput({
  value,
  onChange,
  label,
  hint,
  error,
  disabled = false,
  required = false,
  placeholder = '90 123 45 67',
}: PhoneInputProps) {
  const id = useId();
  const [national, setNational] = useState(() => extractNational(value ?? ''));

  // Tashqaridan o'zgargan qiymat (forma reset) — ichki holatni moslash.
  useEffect(() => {
    if (value === undefined) return;
    if (value !== toCanonical(national)) setNational(extractNational(value));
  }, [value, national]);

  const handle = (raw: string) => {
    const next = extractNational(raw);
    setNational(next);
    onChange?.(toCanonical(next));
  };

  const describedBy = [hint ? `${id}-hint` : null, error ? `${id}-err` : null]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={classes.field}>
      {label && (
        <label htmlFor={id} className={classes.label}>
          {label}
          {required && <span className={classes.req}> *</span>}
        </label>
      )}
      <div
        className={classes.wrap}
        data-invalid={error ? true : undefined}
        data-disabled={disabled || undefined}
      >
        <span className={classes.prefix} aria-hidden="true">
          +998
        </span>
        <input
          id={id}
          className={classes.input}
          type="tel"
          inputMode="tel"
          autoComplete="tel-national"
          value={formatNational(national)}
          placeholder={placeholder}
          disabled={disabled}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy || undefined}
          onChange={(e) => handle(e.target.value)}
        />
      </div>
      {hint && !error && (
        <span id={`${id}-hint`} className={classes.hint}>
          {hint}
        </span>
      )}
      {error && (
        <span id={`${id}-err`} className={classes.error} role="alert">
          {error}
        </span>
      )}
    </div>
  );
}
