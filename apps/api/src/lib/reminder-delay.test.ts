import { describe, expect, test } from 'bun:test';
import { reminderDelayMs } from './reminder-delay.ts';

const HOUR = 3600_000;

describe('reminderDelayMs', () => {
  test('kelajak: start now+48h, lead 24h → ~24h musbat delay', () => {
    const now = new Date('2026-06-11T00:00:00Z');
    const start = new Date(now.getTime() + 48 * HOUR);
    const delay = reminderDelayMs(start, now);
    expect(delay).toBe(24 * HOUR);
  });

  test("yaqin: start now+12h, lead 24h → null (fireAt o'tgan)", () => {
    const now = new Date('2026-06-11T00:00:00Z');
    const start = new Date(now.getTime() + 12 * HOUR);
    expect(reminderDelayMs(start, now)).toBeNull();
  });

  test("o'tgan: start now−1h → null", () => {
    const now = new Date('2026-06-11T00:00:00Z');
    const start = new Date(now.getTime() - HOUR);
    expect(reminderDelayMs(start, now)).toBeNull();
  });

  test('custom leadHours: start now+10h, lead 2h → 8h delay', () => {
    const now = new Date('2026-06-11T00:00:00Z');
    const start = new Date(now.getTime() + 10 * HOUR);
    expect(reminderDelayMs(start, now, 2)).toBe(8 * HOUR);
  });
});
