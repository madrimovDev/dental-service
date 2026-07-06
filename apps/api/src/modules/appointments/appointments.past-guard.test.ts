import { describe, expect, it } from 'bun:test';
import { isInPast } from './appointments.service.ts';

describe('A2 (CLI-438) isInPast (past-booking guard)', () => {
  const now = new Date('2026-07-06T04:00:00Z'); // 09:00 Tashkent

  it('start well in the future → not past', () => {
    expect(isInPast(new Date('2026-07-06T05:00:00Z'), now)).toBe(false);
  });

  it('start well in the past (this morning) → past', () => {
    expect(isInPast(new Date('2026-07-06T02:00:00Z'), now)).toBe(true);
  });

  it('start exactly now → not past (grace window)', () => {
    expect(isInPast(new Date(now), now)).toBe(false);
  });

  it('start 1 minute ago → not past (within 2-minute grace, clock race)', () => {
    expect(isInPast(new Date(now.getTime() - 60_000), now)).toBe(false);
  });

  it('start 5 minutes ago → past (beyond grace)', () => {
    expect(isInPast(new Date(now.getTime() - 5 * 60_000), now)).toBe(true);
  });
});
