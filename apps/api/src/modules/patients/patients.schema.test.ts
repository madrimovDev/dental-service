/**
 * patients.schema.ts — pure Zod validation tests (no DB).
 *
 * CLI-455: ixtiyoriy PII/kontakt maydonlar `.nullable()` bo'lishi kerak (insurance
 * bilan bir xil) — `null` orqali maydonni "tozalash" mumkin bo'lishi uchun.
 */
import { describe, expect, test } from 'bun:test';
import { updatePatientSchema } from './patients.schema.ts';

describe('CLI-455 — updatePatientSchema ixtiyoriy maydonlar nullable', () => {
  const nullableFields = [
    'phone',
    'phoneSecondary',
    'passport',
    'address',
    'notes',
    'dateOfBirth',
    'gender',
  ] as const;

  for (const field of nullableFields) {
    test(`${field}: null qiymatni qabul qiladi (clear)`, () => {
      const result = updatePatientSchema.safeParse({ [field]: null });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data[field]).toBeNull();
      }
    });

    test(`${field}: kalit yo'q bo'lsa — natijada ham yo'q (no-op)`, () => {
      const result = updatePatientSchema.safeParse({});
      expect(result.success).toBe(true);
      if (result.success) {
        expect(Object.hasOwn(result.data, field)).toBe(false);
      }
    });
  }
});
