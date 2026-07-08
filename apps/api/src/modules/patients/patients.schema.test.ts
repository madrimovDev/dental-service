/**
 * patients.schema.ts — pure Zod validation tests (no DB).
 *
 * CLI-455: ixtiyoriy PII/kontakt maydonlar `.nullable()` bo'lishi kerak (insurance
 * bilan bir xil) — `null` orqali maydonni "tozalash" mumkin bo'lishi uchun.
 * CLI-464: `dateOfBirth` kelajak sanani rad etishi kerak.
 */
import { describe, expect, test } from 'bun:test';
import { createPatientSchema, updatePatientSchema } from './patients.schema.ts';

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

describe('CLI-464 — dateOfBirth kelajak sanani rad etadi', () => {
  test('ertangi sana — rad etiladi', () => {
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const result = createPatientSchema.safeParse({
      fullName: 'Ali Valiyev',
      dateOfBirth: tomorrow,
    });
    expect(result.success).toBe(false);
  });

  test('bugungi sana — qabul qilinadi', () => {
    const today = new Date().toISOString().slice(0, 10);
    const result = createPatientSchema.safeParse({ fullName: 'Ali Valiyev', dateOfBirth: today });
    expect(result.success).toBe(true);
  });

  test("o'tgan sana — qabul qilinadi", () => {
    const result = createPatientSchema.safeParse({
      fullName: 'Ali Valiyev',
      dateOfBirth: '1990-05-15',
    });
    expect(result.success).toBe(true);
  });

  test('dateOfBirth berilmasa — muammosiz', () => {
    const result = createPatientSchema.safeParse({ fullName: 'Ali Valiyev' });
    expect(result.success).toBe(true);
  });

  test('dateOfBirth: null — muammosiz (CLI-455 bilan mos)', () => {
    const result = createPatientSchema.safeParse({ fullName: 'Ali Valiyev', dateOfBirth: null });
    expect(result.success).toBe(true);
  });
});
