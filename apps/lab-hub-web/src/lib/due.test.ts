import { describe, expect, it } from 'vitest';
import { dueInfo } from './due';

const now = new Date('2026-11-12T09:30:00');

describe('dueInfo', () => {
  it('muddat yo‘q', () => expect(dueInfo(null, now).kind).toBe('none'));
  it('o‘tib ketgan — overdue, kunlar manfiy', () => {
    expect(dueInfo('2026-11-10', now)).toEqual({ kind: 'overdue', days: -2 });
  });
  it('bugun', () => expect(dueInfo('2026-11-12', now)).toEqual({ kind: 'today', days: 0 }));
  it('ertaga', () => expect(dueInfo('2026-11-13', now)).toEqual({ kind: 'tomorrow', days: 1 }));
  it('keyinroq — oddiy', () => {
    expect(dueInfo('2026-11-19', now)).toEqual({ kind: 'later', days: 7 });
  });
  it('oy/yil chegarasi', () => {
    expect(dueInfo('2027-01-01', new Date('2026-12-31T23:59:00')).days).toBe(1);
  });
});
