import { describe, expect, it } from 'vitest';
import { formatDateTime, formatDay, formatMonth, shiftMonth } from './format';

describe('format', () => {
  it('uz kun: «18-noyabr» (ICU «M11» emas)', () => {
    expect(formatDay('2026-11-18', 'uz')).toBe('18-noyabr');
    expect(formatDateTime('2026-11-12T10:30:00', 'uz')).toMatch(/^12-noyabr 10:30$/);
  });
  it('ru kun', () => expect(formatDay('2026-11-18', 'ru')).toBe('18 ноября'));
  it('oy: nomi va surish (yil chegarasi)', () => {
    expect(formatMonth('2026-11', 'uz')).toBe('Noyabr 2026');
    expect(formatMonth('2026-11', 'ru')).toBe('Ноябрь 2026');
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
    expect(shiftMonth('2026-12', 1)).toBe('2027-01');
  });
});
