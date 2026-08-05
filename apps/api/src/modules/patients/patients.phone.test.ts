import { describe, expect, test } from 'bun:test';
import { normalizeOptionalPhone } from './patients.phone.ts';

describe('normalizeOptionalPhone', () => {
  test('9 xonali mahalliy format 998 prefiksini oladi', () => {
    expect(normalizeOptionalPhone('901234567')).toBe('+998901234567');
  });

  test('formatlangan kiritma tozalanadi', () => {
    expect(normalizeOptionalPhone('+998 (90) 123-45-67')).toBe('+998901234567');
  });

  test('davlat kodli format saqlanadi', () => {
    expect(normalizeOptionalPhone('+79161234567')).toBe('+79161234567');
  });

  test('undefined → null (ustunga NULL yoziladi)', () => {
    expect(normalizeOptionalPhone(undefined)).toBeNull();
  });

  test('null → null', () => {
    expect(normalizeOptionalPhone(null)).toBeNull();
  });

  test("bo'sh satr → null ('+' EMAS)", () => {
    // normalizePhone('') bo'sh satr qaytaradi — bazaga '+' yoki '' emas,
    // NULL yozilishi kerak (mavjud xulq: telefon berilmasa NULL).
    expect(normalizeOptionalPhone('')).toBeNull();
  });

  test("raqamsiz axlat → null ('+' EMAS)", () => {
    expect(normalizeOptionalPhone('---')).toBeNull();
  });
});
