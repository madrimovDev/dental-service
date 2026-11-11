import { describe, expect, test } from 'bun:test';
import {
  adjustmentDelta,
  allocateBatchRemaining,
  applyMovement,
  avgDailyUsage,
  daysOfSupply,
  isLowStock,
} from './stock.calc.ts';

describe('isLowStock', () => {
  test('qoldiq chegaradan past → true', () => {
    expect(isLowStock(2, 5)).toBe(true);
  });
  test("qoldiq aynan chegarada → false (qat'iy <)", () => {
    expect(isLowStock(5, 5)).toBe(false);
  });
  test('qoldiq chegaradan yuqori → false', () => {
    expect(isLowStock(10, 5)).toBe(false);
  });
  test('chegara 0 → qoldiq 0 da false', () => {
    expect(isLowStock(0, 0)).toBe(false);
  });
});

describe('applyMovement', () => {
  test("in → qo'shadi", () => {
    expect(applyMovement(10, 'in', 5)).toBe(15);
  });
  test('out → ayiradi', () => {
    expect(applyMovement(10, 'out', 3)).toBe(7);
  });
  test('adjustment → set-to-value (100→90, phantom emas)', () => {
    expect(applyMovement(100, 'adjustment', 90)).toBe(90);
  });
  test('adjustment → yuqoriga ham (100→110)', () => {
    expect(applyMovement(100, 'adjustment', 110)).toBe(110);
  });
  test('adjustment → nolga (100→0)', () => {
    expect(applyMovement(100, 'adjustment', 0)).toBe(0);
  });
  test("adjustment → o'zgarishsiz (100→100)", () => {
    expect(applyMovement(100, 'adjustment', 100)).toBe(100);
  });
  test("out manfiyga ruxsat (guard yo'q)", () => {
    expect(applyMovement(2, 'out', 3)).toBe(-1);
  });
});

describe('adjustmentDelta', () => {
  test('pastga tuzatish → manfiy delta (100→90 = -10)', () => {
    expect(adjustmentDelta(100, 90)).toBe(-10);
  });
  test('yuqoriga tuzatish → musbat delta (100→110 = +10)', () => {
    expect(adjustmentDelta(100, 110)).toBe(10);
  });
  test("o'zgarishsiz → 0 (100→100)", () => {
    expect(adjustmentDelta(100, 100)).toBe(0);
  });
});

describe('daysOfSupply / avgDailyUsage', () => {
  test('sarf 0 → null (cheksiz, bo‘linish xatosi yo‘q)', () => {
    expect(daysOfSupply(50, 0)).toBeNull();
    expect(daysOfSupply(0, 0)).toBeNull();
    expect(avgDailyUsage(0)).toBe(0);
    expect(avgDailyUsage(-5)).toBe(0);
  });
  test('qoldiq ÷ kunlik sarf, pastga yaxlitlanadi', () => {
    expect(daysOfSupply(10, avgDailyUsage(30))).toBe(10);
    expect(daysOfSupply(10, 3)).toBe(3);
  });
  test('qoldiq ≤ 0 va sarf bor → 0', () => {
    expect(daysOfSupply(0, 1)).toBe(0);
    expect(daysOfSupply(-2, 1)).toBe(0);
  });
});

describe('allocateBatchRemaining (FIFO)', () => {
  const d = (n: number) => new Date(2030, 0, n);
  test('qoldiq eng yangi partiyaga taqsimlanadi', () => {
    const r = allocateBatchRemaining(14, [
      { id: 'old', receivedAt: d(1), qtyReceived: 10 },
      { id: 'new', receivedAt: d(20), qtyReceived: 20 },
    ]);
    expect(r.find((b) => b.id === 'new')?.qtyRemaining).toBe(14);
    expect(r.find((b) => b.id === 'old')?.qtyRemaining).toBe(0);
  });
  test('qoldiq oshsa eski partiyaga o‘tadi; manfiy/0 qoldiq → hammasi 0', () => {
    const r = allocateBatchRemaining(25, [
      { id: 'old', receivedAt: d(1), qtyReceived: 10 },
      { id: 'new', receivedAt: d(20), qtyReceived: 20 },
    ]);
    expect(r.map((b) => b.qtyRemaining)).toEqual([5, 20]);
    expect(
      allocateBatchRemaining(-3, [{ receivedAt: d(1), qtyReceived: 5 }])[0]?.qtyRemaining,
    ).toBe(0);
  });
});
