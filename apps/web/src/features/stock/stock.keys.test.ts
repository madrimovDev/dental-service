import { describe, expect, it } from 'vitest';
import { stockKeys } from './stock.keys';

describe('stockKeys', () => {
  it('all / items / movements / bom kalitlari', () => {
    expect(stockKeys.all).toEqual(['stock']);
    expect(stockKeys.items('b1')).toEqual(['stock', 'items', 'b1']);
    expect(stockKeys.movements('i1')).toEqual(['stock', 'movements', 'i1']);
    expect(stockKeys.bom('s1')).toEqual(['stock', 'bom', 's1']);
  });
});
