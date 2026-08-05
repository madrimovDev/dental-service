import { describe, expect, test } from 'bun:test';
import { normalizePhone } from '@dental/core';
import * as manager from './telegram-bot-manager.ts';

/**
 * H1 — `telegram-bot-manager.ts` dagi lokal `normalizePhone` nusxasi o'chirildi.
 *
 * Divergensiya real bug edi: lokal nusxa `raw.replace(/[^\d]/g,'')` qilib `+`
 * qo'shardi, ya'ni Telegram'dan keladigan 9 xonali mahalliy raqam
 * (`901234567`) `+901234567` bo'lib chiqardi. `patients.phone` esa kanonik
 * `+998901234567` shaklda saqlanadi (`@dental/core` §normalizePhone) — bemor
 * hech qachon topilmasdi va foydalanuvchi "Raqamingiz topilmadi" xabarini
 * olardi.
 */
describe('telegram bemor linking telefon kanonikligi', () => {
  test("modul o'z normalizePhone nusxasini EKSPORT QILMAYDI (H1 qulfi)", () => {
    // 🔴 Bu — yagona assertion qaysiki o'zgarishdan OLDIN qizil. Qolganlari
    // `@dental/core`ning xulqini qulflaydi (u allaqachon to'g'ri), lekin
    // lokal nusxa qaytib kelsa buni sezmasdi.
    expect('normalizePhone' in manager).toBe(false);
  });

  test('9 xonali mahalliy format 998 prefiksini oladi', () => {
    // Eski lokal nusxa buni '+901234567' qilardi — kanonik shaklga mos
    // kelmagani uchun bemor topilmasdi.
    expect(normalizePhone('901234567')).toBe('+998901234567');
  });

  test("bo'sh kiritma bo'sh satr qaytaradi ('+' EMAS)", () => {
    // Eski nusxa '+' qaytarardi — `inArray(patients.phone, ['+', ''])`
    // qidiruvi tasodifiy qatorga tushishi mumkin edi.
    expect(normalizePhone('')).toBe('');
  });

  test("davlat kodli format o'zgarmaydi", () => {
    expect(normalizePhone('+998 90 123 45 67')).toBe('+998901234567');
    expect(normalizePhone('998901234567')).toBe('+998901234567');
  });
});
