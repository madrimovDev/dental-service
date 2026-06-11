import { describe, expect, test } from 'bun:test';
import { applyMovement, isLowStock } from './stock.calc.ts';

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
  test("adjustment → qo'shadi", () => {
    expect(applyMovement(10, 'adjustment', 4)).toBe(14);
  });
  test("out manfiyga ruxsat (guard yo'q)", () => {
    expect(applyMovement(2, 'out', 3)).toBe(-1);
  });
});
