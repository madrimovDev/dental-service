import { describe, expect, it } from 'bun:test';
import { computeDueDate } from './recalls.service.ts';

describe('A7 (CLI-438) computeDueDate month-end overflow', () => {
  it('Jan 31 + 1 month → Feb 28 (non-leap year), not Mar 3', () => {
    const now = new Date('2026-01-31T04:00:00Z'); // 2026-01-31 09:00 Tashkent
    expect(computeDueDate(1, now)).toBe('2026-02-28');
  });

  it('Jan 31 + 1 month → Feb 29 (leap year)', () => {
    const now = new Date('2028-01-31T04:00:00Z'); // 2028 is a leap year
    expect(computeDueDate(1, now)).toBe('2028-02-29');
  });

  it('Mar 31 + 1 month → Apr 30 (30-day month)', () => {
    const now = new Date('2026-03-31T04:00:00Z');
    expect(computeDueDate(1, now)).toBe('2026-04-30');
  });

  it('mid-month (ordinary case) unaffected — Apr 15 + 6 months → Oct 15', () => {
    const now = new Date('2026-04-15T04:00:00Z');
    expect(computeDueDate(6, now)).toBe('2026-10-15');
  });

  it('Jan 1 + 6 months → Jul 1 (default interval)', () => {
    const now = new Date('2026-01-01T04:00:00Z');
    expect(computeDueDate(6, now)).toBe('2026-07-01');
  });
});
