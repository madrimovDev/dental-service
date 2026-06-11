import { describe, expect, it } from 'vitest';
import { cashierKeys } from './cashier.keys';

describe('cashierKeys', () => {
  it('all / today / summary / planBalance kalitlari', () => {
    expect(cashierKeys.all).toEqual(['cashier']);
    expect(cashierKeys.today('b1')).toEqual(['cashier', 'today', 'b1']);
    expect(cashierKeys.summary('b1')).toEqual(['cashier', 'summary', 'b1']);
    expect(cashierKeys.planBalance('p1')).toEqual(['cashier', 'plan-balance', 'p1']);
  });
});
