import { describe, expect, it } from 'vitest';
import { useTodayRange } from './dashboard.api';

// useTodayRange — hook nomida bo'lsa-da React hook ishlatmaydi (sof hisob),
// shuning uchun to'g'ridan-to'g'ri chaqiriladi.
describe('useTodayRange (CLI-160)', () => {
  const ISO_DATETIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

  it("from/to to'liq ISO datetime (date-only emas — appointments 400 oldini oladi)", () => {
    const { from, to } = useTodayRange();
    expect(from).toMatch(ISO_DATETIME);
    expect(to).toMatch(ISO_DATETIME);
  });

  it('from kun boshi, to kun oxiri — from < to', () => {
    const { from, to } = useTodayRange();
    expect(new Date(from).getTime()).toBeLessThan(new Date(to).getTime());
  });

  it('from va to bitta lokal kunga tegishli', () => {
    const { from, to } = useTodayRange();
    expect(new Date(from).toDateString()).toBe(new Date(to).toDateString());
  });
});
