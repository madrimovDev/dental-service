import { describe, expect, it } from 'bun:test';
import { normalizePhone } from './phone';

describe('normalizePhone', () => {
  it('+998 prefiksini saqlaydi', () => {
    expect(normalizePhone('+998901234567')).toBe('+998901234567');
  });

  it("+ belgisiz raqamga + qo'shadi", () => {
    expect(normalizePhone('998901234567')).toBe('+998901234567');
  });

  it("bo'sh joy, qavs va tirelarni olib tashlaydi", () => {
    expect(normalizePhone('+998 (90) 123-45-67')).toBe('+998901234567');
  });

  it("9 xonali mahalliy raqamga 998 prefiksini qo'shadi", () => {
    expect(normalizePhone('901234567')).toBe('+998901234567');
  });

  it("boshqa davlat kodini o'zgartirmaydi", () => {
    expect(normalizePhone('+79161234567')).toBe('+79161234567');
  });

  it("bo'sh satr uchun bo'sh satr qaytaradi", () => {
    expect(normalizePhone('')).toBe('');
  });
});
