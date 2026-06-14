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
