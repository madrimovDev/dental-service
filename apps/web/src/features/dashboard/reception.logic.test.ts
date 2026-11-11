import { describe, expect, it } from 'vitest';
import {
  type AttentionItem,
  isLabOverdue,
  limitAttention,
  matchesStatusFilter,
  nextAction,
  parseStatusFilter,
  waitMinutes,
} from './reception.logic';

const item = (key: string, tier: 2 | 3): AttentionItem => ({
  key,
  tier,
  title: key,
  text: '',
  actionLabel: '',
  to: '/',
});

describe('reception.logic', () => {
  it('limitAttention: ≤3, daraja bo‘yicha tartib, qolgani «yana N ta»', () => {
    const r = limitAttention([
      item('a', 3),
      item('b', 2),
      item('c', 3),
      item('d', 2),
      item('e', 3),
    ]);
    expect(r.shown.map((i) => i.key)).toEqual(['b', 'd', 'a']);
    expect(r.more).toBe(2);
  });
  it('waitMinutes', () => {
    const now = Date.parse('2026-01-01T10:30:00Z');
    expect(waitMinutes('2026-01-01T10:08:00Z', now)).toBe(22);
    expect(waitMinutes(undefined, now)).toBeUndefined();
    expect(waitMinutes('2026-01-01T11:00:00Z', now)).toBeUndefined();
  });
  it('nextAction: har holatda bitta amal', () => {
    expect(nextAction('scheduled')).toBe('to_queue');
    expect(nextAction('completed')).toBe('to_cashier');
    expect(nextAction('no_show')).toBe('rebook');
    expect(nextAction('cancelled')).toBeNull();
  });
  it('status filtri', () => {
    expect(parseStatusFilter('zzz')).toBe('all');
    expect(matchesStatusFilter('confirmed', 'pending')).toBe(true);
    expect(matchesStatusFilter('completed', 'pending')).toBe(false);
  });
  it('isLabOverdue', () => {
    expect(isLabOverdue({ expectedDate: '2026-01-01', status: 'sent' }, '2026-01-02')).toBe(true);
    expect(isLabOverdue({ expectedDate: '2026-01-01', status: 'delivered' }, '2026-01-02')).toBe(
      false,
    );
    expect(isLabOverdue({ expectedDate: null, status: 'sent' }, '2026-01-02')).toBe(false);
  });
});
