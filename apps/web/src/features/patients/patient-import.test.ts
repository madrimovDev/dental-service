import { describe, expect, it } from 'vitest';
import {
  cellToString,
  chunk,
  guessMapping,
  isMappingComplete,
  mapRows,
  mergeImportResults,
  normalizeDate,
  normalizeGender,
} from './patient-import';

describe('FU-24 guessMapping', () => {
  it('uz/ru/en sarlavhalarni maydonlarga moslaydi', () => {
    const m = guessMapping([
      'F.I.Sh.',
      'Telefon raqam',
      "Tug'ilgan sana",
      'Jins',
      'Manzil',
      'Izoh',
    ]);
    expect(m.fullName).toBe(0);
    expect(m.phone).toBe(1);
    expect(m.dateOfBirth).toBe(2);
    expect(m.gender).toBe(3);
    expect(m.address).toBe(4);
    expect(m.notes).toBe(5);
    expect(m.passport).toBeNull();
    const ru = guessMapping(['ФИО', 'Телефон', 'Дата рождения', 'Пол']);
    expect([ru.fullName, ru.phone, ru.dateOfBirth, ru.gender]).toEqual([0, 1, 2, 3]);
    expect(guessMapping(['name', 'phone']).phone).toBe(1);
  });

  it('bitta ustun ikki maydonga berilmaydi; ism topilmasa to‘liq emas', () => {
    const m = guessMapping(['Telefon', 'Telefon']);
    expect(m.phone).toBe(0);
    expect(m.phoneSecondary).toBeNull();
    expect(isMappingComplete(m)).toBe(false);
    expect(isMappingComplete(guessMapping(['Ism']))).toBe(true);
  });
});

describe('FU-24 normalizeDate / normalizeGender', () => {
  it('sana formatlari → YYYY-MM-DD; noto‘g‘ri sana o‘zgarishsiz (server rad etadi)', () => {
    expect(normalizeDate('1990-05-01')).toBe('1990-05-01');
    expect(normalizeDate('01.05.1990')).toBe('1990-05-01');
    expect(normalizeDate('1/5/1990')).toBe('1990-05-01');
    expect(normalizeDate('32.13.1990')).toBe('32.13.1990');
    expect(normalizeDate('')).toBe('');
    // Excel seriya raqami: 33000 = 1990-04-... (1900 tizimi)
    expect(normalizeDate('25569')).toBe('1970-01-01');
  });

  it('jins xaritasi', () => {
    expect(normalizeGender('Erkak')).toBe('male');
    expect(normalizeGender('Ж')).toBe('female');
    expect(normalizeGender('ayol')).toBe('female');
    expect(normalizeGender('')).toBe('');
    expect(normalizeGender('robot')).toBe('robot');
  });

  it('Date katagi mahalliy kalendar kuniga aylanadi', () => {
    expect(cellToString(new Date(1990, 4, 1))).toBe('1990-05-01');
    expect(cellToString(901234567)).toBe('901234567');
    expect(cellToString(null)).toBe('');
  });
});

describe('FU-24 mapRows', () => {
  const mapping = guessMapping(['Ism', 'Telefon', "Tug'ilgan sana", 'Jins']);
  it('bo‘sh qatorlarni tashlaydi, asl qator raqamini saqlaydi', () => {
    const { rows, sourceRows } = mapRows(
      [
        ['Ali Valiyev', '90 123 45 67', '01.05.1990', 'Erkak'],
        ['', '', '', ''],
        ['Vali', '', '', ''],
      ],
      mapping,
    );
    expect(rows).toEqual([
      { fullName: 'Ali Valiyev', phone: '90 123 45 67', dateOfBirth: '1990-05-01', gender: 'male' },
      { fullName: 'Vali' },
    ]);
    expect(sourceRows).toEqual([2, 4]);
  });
});

describe('FU-24 bo‘laklash va natijani birlashtirish', () => {
  it('chunk 1000 ga bo‘ladi', () => {
    expect(chunk(Array.from({ length: 2500 }, (_, i) => i)).map((c) => c.length)).toEqual([
      1000, 1000, 500,
    ]);
  });

  it('mergeImportResults qator raqamini global qiladi', () => {
    const part = (created: number, row: number) => ({
      dryRun: false,
      created,
      skippedDuplicate: 0,
      errorCount: 1,
      results: [{ row, status: 'error' as const, code: 'invalid_phone' }],
    });
    const merged = mergeImportResults([part(2, 5), part(3, 7)], 1000);
    expect(merged.created).toBe(5);
    expect(merged.errorCount).toBe(2);
    expect(merged.results.map((r) => r.row)).toEqual([5, 1007]);
  });
});
