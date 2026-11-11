import type { TFunction } from 'i18next';
import { describe, expect, it } from 'vitest';
import { formatCurrency, formatNumber } from './format';

// Mahalliy guruh ajratgich (NBSP yoki oddiy bo'shliq) muhitga bog'liq —
// kutilgan natijani haqiqiy Intl chiqishidan hisoblaymiz, hardcode qilmaymiz.
const fmt = new Intl.NumberFormat('uz-UZ');

// `common.currency` ni "so'm" ga qaytaruvchi minimal t.
const t = ((key: string) => (key === 'common.currency' ? "so'm" : key)) as unknown as TFunction;

describe('formatCurrency', () => {
  it('formatlangan son + mahalliylashtirilgan valyuta suffiksi', () => {
    expect(formatCurrency(1234567, t)).toBe(`${fmt.format(1234567)} so'm`);
  });

  it('kasrni butunga yaxlitlaydi', () => {
    expect(formatCurrency(1234.6, t)).toBe(`${fmt.format(1235)} so'm`);
  });
});

describe('formatNumber', () => {
  it('yaxlitlaydi, valyutasiz', () => {
    expect(formatNumber(1234.6)).toBe(fmt.format(1235));
  });
});

import { formatDayMonth, formatWeekday } from './format';
import { roleLabel } from './role-label';

describe("uz sana nomlari (Intl'siz)", () => {
  it('12-noyabr · payshanba', () => {
    const d = new Date('2026-11-12T09:00:00Z');
    expect(formatDayMonth(d, 'uz', { timeZone: 'Asia/Tashkent' })).toBe('12-noyabr');
    expect(formatWeekday(d, 'uz', 'long', 'Asia/Tashkent')).toBe('payshanba');
    expect(formatWeekday(d, 'uz', 'short', 'Asia/Tashkent')).toBe('pay');
    expect(
      formatDayMonth(d, 'uz', { month: 'short', padDay: true, timeZone: 'Asia/Tashkent' }),
    ).toBe('12-noy');
  });
  it('ru Intl orqali', () => {
    expect(formatWeekday(new Date('2026-11-12T09:00:00Z'), 'ru', 'long', 'Asia/Tashkent')).toBe(
      'четверг',
    );
  });
});

describe('roleLabel', () => {
  const t = ((k: string, o?: { defaultValue?: string }) =>
    k === 'nav.role_name.doctor' ? 'Врач' : (o?.defaultValue ?? k)) as never;
  it("tizim roli tarjima, custom o'z nomi bilan", () => {
    expect(roleLabel('Doctor', t, true)).toBe('Врач');
    expect(roleLabel('Doctor', t, false)).toBe('Doctor');
    expect(roleLabel('Senior Doctor', t)).toBe('Senior Doctor');
  });
});
