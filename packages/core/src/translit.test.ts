import { describe, expect, it } from 'bun:test';
import { cyrillicToLatin, latinToCyrillic, searchVariants } from './translit';

describe('cyrillicToLatin', () => {
  it('«турсун» → «tursun»', () => {
    expect(cyrillicToLatin('турсун')).toBe('tursun');
  });

  it('digraflar: ш ч ю я ё', () => {
    expect(cyrillicToLatin('Шарипов Чориев Юсуф Ямин Ёқуб')).toBe(
      'Sharipov Choriev Yusuf Yamin Yoqub',
    );
  });

  it("o'zbek harflari: ў ғ қ ҳ", () => {
    expect(cyrillicToLatin('Ўктам Ғуломов Қодиров Ҳамид')).toBe("O'ktam G'ulomov Qodirov Hamid");
  });

  it('bosh harf saqlanadi (Т → T, Ш → Sh)', () => {
    expect(cyrillicToLatin('Турсунов')).toBe('Tursunov');
    expect(cyrillicToLatin('Шерзод')).toBe('Sherzod');
  });

  it('lotin matn o‘zgarmaydi', () => {
    expect(cyrillicToLatin('Tursun 123')).toBe('Tursun 123');
  });
});

describe('latinToCyrillic', () => {
  it('«Tursun» → «Турсун»', () => {
    expect(latinToCyrillic('Tursun')).toBe('Турсун');
  });

  it('digraflar: sh ch yu ya yo', () => {
    expect(latinToCyrillic('Sharipov Choriev Yusuf Yamin')).toBe('Шарипов Чориев Юсуф Ямин');
  });

  it("o' g' tutuq belgilari (turli apostroflar)", () => {
    expect(latinToCyrillic("O'ktam G'ulom")).toBe('Ўктам Ғулом');
    expect(latinToCyrillic('Oʻktam Gʻulom')).toBe('Ўктам Ғулом');
    expect(latinToCyrillic('O‘ktam G’ulom')).toBe('Ўктам Ғулом');
  });

  it('kirill matn o‘zgarmaydi', () => {
    expect(latinToCyrillic('Турсун')).toBe('Турсун');
  });
});

describe('searchVariants', () => {
  it('kirill → asl + lotin', () => {
    expect(searchVariants('турсун')).toEqual(expect.arrayContaining(['турсун', 'tursun']));
  });

  it('lotin → asl + kirill', () => {
    expect(searchVariants('Tursun')).toEqual(expect.arrayContaining(['Tursun', 'Турсун']));
  });

  it('raqam/belgi — bitta variant', () => {
    expect(searchVariants('+998 90')).toEqual(['+998 90']);
  });

  it('bo‘sh → bo‘sh', () => {
    expect(searchVariants('  ')).toEqual([]);
  });
});

describe('searchVariants — C-locale kirill katta-kichik harf (desktop)', () => {
  it("lotin 'tursun' kirillning bosh harfli va katta shakllarini ham beradi", () => {
    const v = searchVariants('tursun');
    expect(v).toContain('турсун');
    expect(v).toContain('Турсун');
    expect(v).toContain('ТУРСУН');
  });
  it("kirill 'турсун' o'zining bosh harfli shaklini beradi", () => {
    expect(searchVariants('турсун')).toContain('Турсун');
  });
});
