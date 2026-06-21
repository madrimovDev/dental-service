import { describe, expect, it } from 'vitest';
import {
  fullDayRangeToInstants,
  groupSegmentsByWeekday,
  minutesToHhmm,
  slotTimeLabel,
  toPutSegments,
} from './schedule.mappers';

describe('minutesToHhmm', () => {
  it('540 → 09:00', () => expect(minutesToHhmm(540)).toBe('09:00'));
  it('0 → 00:00', () => expect(minutesToHhmm(0)).toBe('00:00'));
  it('1439 → 23:59', () => expect(minutesToHhmm(1439)).toBe('23:59'));
  it('zero-pads hour and minute (e.g. 65 → 01:05)', () => expect(minutesToHhmm(65)).toBe('01:05'));
});

describe('fullDayRangeToInstants (Asia/Tashkent UTC+5)', () => {
  it('single day: 00:00 local start, exclusive next-day 00:00 local end', () => {
    const { startAt, endAt } = fullDayRangeToInstants('2026-06-20', '2026-06-20');
    // local 00:00 Tashkent = previous day 19:00 UTC
    expect(startAt).toBe('2026-06-19T19:00:00.000Z');
    // exclusive end = 2026-06-21 00:00 local = 2026-06-20 19:00 UTC
    expect(endAt).toBe('2026-06-20T19:00:00.000Z');
  });

  it('multi-day inclusive range: end is the day AFTER the last date at local midnight', () => {
    const { startAt, endAt } = fullDayRangeToInstants('2026-06-20', '2026-06-22');
    expect(startAt).toBe('2026-06-19T19:00:00.000Z');
    // last day 22nd fully covered → exclusive end = 23rd local midnight
    expect(endAt).toBe('2026-06-22T19:00:00.000Z');
  });
});

describe('groupSegmentsByWeekday', () => {
  it('groups DTO segments per weekday into HH:mm pairs', () => {
    const grouped = groupSegmentsByWeekday([
      {
        id: '1',
        doctorId: 'd1',
        branchId: 'b1',
        weekday: 1,
        start: '09:00',
        end: '13:00',
        isActive: true,
        effectiveFrom: null,
        effectiveUntil: null,
      },
      {
        id: '2',
        doctorId: 'd1',
        branchId: 'b1',
        weekday: 1,
        start: '14:00',
        end: '18:00',
        isActive: true,
        effectiveFrom: null,
        effectiveUntil: null,
      },
    ]);
    expect(grouped[1]).toEqual([
      { key: expect.any(String), start: '09:00', end: '13:00' },
      { key: expect.any(String), start: '14:00', end: '18:00' },
    ]);
    expect(grouped[2] ?? []).toEqual([]);
  });
});

describe('toPutSegments', () => {
  it('flattens weekly map into PUT body segments (drops empty days)', () => {
    const segs = toPutSegments({
      1: [{ key: 'a', start: '09:00', end: '13:00' }],
      3: [],
      5: [{ key: 'b', start: '10:00', end: '14:00' }],
    });
    expect(segs).toEqual([
      { weekday: 1, start: '09:00', end: '13:00' },
      { weekday: 5, start: '10:00', end: '14:00' },
    ]);
  });
});

describe('slotTimeLabel', () => {
  it('renders ISO instant as Tashkent HH:mm', () => {
    // 2026-06-20T04:00:00Z = 09:00 Tashkent
    expect(slotTimeLabel('2026-06-20T04:00:00.000Z')).toBe('09:00');
  });
});
